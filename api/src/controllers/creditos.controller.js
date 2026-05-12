/**
 * Controller de Créditos
 * Handlers das requisições HTTP
 */

const creditosService = require('../services/creditos.service');
const creditosRepository = require('../repositories/creditos.repository');
const { asyncHandler, APIError } = require('../middlewares/errorHandler');
const { extractClienteId } = require('../utils/validators');
const logger = require('../utils/logger');

/**
 * Garante que o usuário autenticado tem acesso à nota fiscal antes de
 * deixar o proxy do Hub-BaaS servir o boleto/QR. Admins têm acesso total.
 */
const autorizarAcessoNota = async (req, notaId) => {
  const donoClienteId = await creditosRepository.buscarClienteIdDaNota(notaId);
  if (!donoClienteId) {
    throw new APIError('Nota fiscal não encontrada', 404);
  }
  const isAdmin = req.usuario?.administrador;
  const clienteIdJWT = Number(req.usuario?.cliente_id);
  if (isAdmin) return;
  if (donoClienteId !== clienteIdJWT) {
    logger.warn('Tentativa de acesso a boleto de outro cliente:', {
      usuario: req.usuario?.codigo,
      donoClienteId,
      clienteIdJWT,
      notaId
    });
    throw new APIError('Acesso negado a este boleto', 403);
  }
};

/**
 * POST /api/creditos/gerar?cliente_id=1
 * Body: { colaboradores, descricao, aplicar_mesmo_valor, valor_uniforme }
 *
 * colaboradores: [{ id: 1, valor: 100.00 }, ...]
 * Se aplicar_mesmo_valor = true, usar valor_uniforme para todos
 */
const gerarCredito = asyncHandler(async (req, res) => {
  const { cliente_id, login } = req.query;
  const payload = req.body;

  const clienteId = extractClienteId(cliente_id);
  if (!clienteId) {
    throw new APIError('cliente_id inválido ou não fornecido', 400, { campo: 'cliente_id' });
  }

  // Login vem da URL (passado pelo sistema legado)
  const loginUsuario = login || req.user?.email || 'sistema';

  // Valida payload
  const payloadValidado = creditosService.validarPayloadCredito(payload, clienteId);

  // Gera crédito (com transação, replica lógica MKF)
  const resultado = await creditosService.gerarCredito(
    payloadValidado,
    loginUsuario
  );

  logger.info('Crédito gerado via API:', {
    clienteId,
    login: loginUsuario,
    totalColaboradores: payloadValidado.colaboradores.length
  });

  return res.status(201).json(resultado);
});

/**
 * GET /api/creditos/historico?cliente_id=1&limit=50&offset=0&data_inicio=&data_fim=
 */
const obterHistorico = asyncHandler(async (req, res) => {
  const { cliente_id, ...query } = req.query;

  const clienteId = extractClienteId(cliente_id);
  if (!clienteId) {
    throw new APIError('cliente_id inválido ou não fornecido', 400, { campo: 'cliente_id' });
  }

  const resultado = await creditosService.obterHistorico(query, clienteId);

  return res.status(200).json(resultado);
});

/**
 * GET /api/creditos/remessa/:remessa_id?cliente_id=1
 * Detalhes de uma remessa específica (colaboradores e valores)
 */
const obterDetalheRemessa = asyncHandler(async (req, res) => {
  const { cliente_id } = req.query;
  const { remessa_id } = req.params;

  const clienteId = extractClienteId(cliente_id);
  if (!clienteId) {
    throw new APIError('cliente_id inválido ou não fornecido', 400, { campo: 'cliente_id' });
  }

  const remessaId = parseInt(remessa_id);
  if (!remessaId || remessaId <= 0) {
    throw new APIError('remessa_id inválido', 400, { campo: 'remessa_id' });
  }

  const resultado = await creditosService.obterDetalheRemessa(remessaId, clienteId);

  return res.status(200).json(resultado);
});

/**
 * GET /api/creditos/nota/:nota_id/pdf
 * Proxy para hub-bass: retorna PDF do boleto
 */
const obterBoletoPdf = asyncHandler(async (req, res) => {
  const { nota_id } = req.params;
  const notaId = parseInt(nota_id);
  if (!notaId || notaId <= 0) {
    throw new APIError('nota_id inválido', 400);
  }

  await autorizarAcessoNota(req, notaId);

  const baseUrl = process.env.BASE_URL_HUB_BAAS || 'http://localhost:5003';
  const idOperacao = process.env.HUB_BAAS_ID_OPERACAO || 'BOLETO_EFI';
  const token = process.env.HUB_BAAS_TOKEN || '';
  const url = `${baseUrl}/efi/V1/boleto/${idOperacao}/${notaId}/pdf`;

  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new APIError('Erro ao obter PDF do boleto', response.status);
  }

  res.setHeader('Content-Type', response.headers.get('content-type') || 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="boleto-${notaId}.pdf"`);

  const buffer = await response.arrayBuffer();
  return res.send(Buffer.from(buffer));
});

/**
 * GET /api/creditos/nota/:nota_id/qrcode
 * Proxy para hub-bass: retorna imagem QR Code
 */
const obterBoletoQrCode = asyncHandler(async (req, res) => {
  const { nota_id } = req.params;
  const notaId = parseInt(nota_id);
  if (!notaId || notaId <= 0) {
    throw new APIError('nota_id inválido', 400);
  }

  await autorizarAcessoNota(req, notaId);

  const baseUrl = process.env.BASE_URL_HUB_BAAS || 'http://localhost:5003';
  const idOperacao = process.env.HUB_BAAS_ID_OPERACAO || 'BOLETO_EFI';
  const token = process.env.HUB_BAAS_TOKEN || '';
  const url = `${baseUrl}/efi/V1/boleto/${idOperacao}/${notaId}/qrcode`;

  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new APIError('Erro ao obter QR Code', response.status);
  }

  const contentType = response.headers.get('content-type') || 'image/svg+xml';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'private, max-age=3600');

  const buffer = await response.arrayBuffer();
  return res.send(Buffer.from(buffer));
});

/**
 * DELETE /api/creditos/remessa/:remessa_id?cliente_id=1
 * Cancela remessa: cancela boleto na EFI + exclui créditos, remessa e nota fiscal
 */
const cancelarRemessa = asyncHandler(async (req, res) => {
  const { cliente_id, login } = req.query;
  const { remessa_id } = req.params;

  const clienteId = extractClienteId(cliente_id);
  if (!clienteId) {
    throw new APIError('cliente_id inválido ou não fornecido', 400, { campo: 'cliente_id' });
  }

  const remessaId = parseInt(remessa_id);
  if (!remessaId || remessaId <= 0) {
    throw new APIError('remessa_id inválido', 400, { campo: 'remessa_id' });
  }

  const canceladoPor = login || req.user?.email || 'sistema';

  const resultado = await creditosService.cancelarRemessa(remessaId, clienteId, canceladoPor);

  logger.info('Remessa cancelada via API:', { clienteId, remessaId, canceladoPor });

  return res.status(200).json(resultado);
});

/**
 * POST /api/creditos/remessa/:remessa_id/boleto?cliente_id=1
 * Reemite o boleto de uma remessa em erro
 */
const reemitirBoleto = asyncHandler(async (req, res) => {
  const { cliente_id } = req.query;
  const { remessa_id } = req.params;

  const clienteId = extractClienteId(cliente_id);
  if (!clienteId) {
    throw new APIError('cliente_id inválido ou não fornecido', 400, { campo: 'cliente_id' });
  }

  const remessaId = parseInt(remessa_id);
  if (!remessaId || remessaId <= 0) {
    throw new APIError('remessa_id inválido', 400, { campo: 'remessa_id' });
  }

  const resultado = await creditosService.reemitirBoleto(remessaId, clienteId);
  logger.info('Boleto reemitido via API:', { clienteId, remessaId });
  return res.status(200).json(resultado);
});

module.exports = {
  gerarCredito,
  obterHistorico,
  obterDetalheRemessa,
  obterBoletoPdf,
  obterBoletoQrCode,
  cancelarRemessa,
  reemitirBoleto
};
