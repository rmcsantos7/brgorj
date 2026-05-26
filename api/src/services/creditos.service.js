/**
 * Service de Créditos
 * Lógica de negócio (validações, processamento)
 *
 * NOTA: Replica lógica dos MKFs "Insere Remessa de Importacao" e "Importar Creditos"
 * - Remessa: apenas (crd_usucrerem_id, crd_usu_data_import, crd_usu_login, crd_cli_id)
 * - Credito: (crd_usr_id, crd_pro_id=999, crd_usu_valor, crd_usu_data_credito,
 *             crd_usucre_cpf, crd_cli_id, crd_usu_login, crd_usu_data_import,
 *             crd_usucrerem_id, crd_sit_id=1)
 * - COM desconto de taxa (crd_cli_manutencao_usuario) sobre o valor inserido
 */

const creditosRepository = require('../repositories/creditos.repository');
const colaboradoresRepository = require('../repositories/colaboradores.repository');
const { APIError } = require('../middlewares/errorHandler');
const { isValidPositiveNumber, validatePagination } = require('../utils/validators');
const { ok, created, paginated } = require('../utils/response');
const logger = require('../utils/logger');
const db = require('../config/database');

/**
 * Estados finais do boleto — não precisam ser sincronizados com a EFI.
 * 'paid'/'settled' são quitações; 'canceled'/'cancelled'/'expired' já refletem
 * o término do ciclo do boleto.
 */
const STATUS_FINAIS_BOLETO = ['paid', 'settled', 'canceled', 'cancelled', 'expired'];

/**
 * Consulta a EFI e atualiza o status local do boleto se mudou. Usado ao abrir
 * o detalhe para garantir que o badge ("Pago"/"Cancelado"/"Aguardando") reflita
 * a situação real — sem isso, um pagamento que aconteceu após o cancelamento
 * manual (Remessa #108) ou um pagamento sem webhook fica invisível para o usuário.
 *
 * Retorna o status atualizado (ou o local original se a EFI estiver fora ou em
 * estado final).
 */
const sincronizarStatusBoletoEFI = async (notaFiscalId, statusLocal) => {
  if (!notaFiscalId) return statusLocal;
  const s = (statusLocal || '').toLowerCase();
  if (STATUS_FINAIS_BOLETO.includes(s)) return statusLocal;

  try {
    const baseUrl = process.env.BASE_URL_HUB_BAAS || 'http://localhost:5003';
    const idOperacao = process.env.HUB_BAAS_ID_OPERACAO || 'BOLETO_EFI';
    const token = process.env.HUB_BAAS_TOKEN || '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const url = `${baseUrl}/efi/V1/boleto/${idOperacao}/${notaFiscalId}`;
    const response = await fetch(url, { headers });
    const result = await response.json().catch(() => null);

    if (response.ok && result?.data?.status) {
      const efiStatus = result.data.status;
      if (efiStatus !== statusLocal) {
        await creditosRepository.atualizarBoletoStatus(notaFiscalId, efiStatus);
        logger.info('Status do boleto sincronizado com EFI:', {
          notaFiscalId,
          anterior: statusLocal,
          novo: efiStatus
        });
        return efiStatus;
      }
    }
  } catch (err) {
    logger.warn('Falha ao sincronizar status do boleto com EFI:', {
      notaFiscalId,
      error: err.message
    });
  }

  return statusLocal;
};

/**
 * Chama Hub/EFI para gerar boleto de uma nota fiscal.
 * Retorna { boleto, erro }. Se sucesso, já persiste no banco.
 */
const chamarApiBoleto = async (notaFiscalId) => {
  if (!notaFiscalId) return { boleto: null, erro: null };
  try {
    const baseUrl = process.env.BASE_URL_HUB_BAAS || 'http://localhost:5003';
    const idOperacao = process.env.HUB_BAAS_ID_OPERACAO || 'BOLETO_EFI';
    const token = process.env.HUB_BAAS_TOKEN || '';
    const boletoUrl = `${baseUrl}/efi/V1/boleto/${idOperacao}/${notaFiscalId}`;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const boletoResponse = await fetch(boletoUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ com_juros: false })
    });
    const boletoResult = await boletoResponse.json().catch(() => null);

    if (boletoResponse.ok && boletoResult?.data) {
      const boleto = boletoResult.data;
      await creditosRepository.atualizarNotaComBoleto(notaFiscalId, boleto);
      return { boleto, erro: null };
    }

    const erro = boletoResult?.error || boletoResult?.message || `HTTP ${boletoResponse.status}`;
    logger.warn('API de boleto retornou erro:', { notaFiscalId, status: boletoResponse.status, boletoResult });
    return { boleto: null, erro };
  } catch (err) {
    logger.error('Falha ao chamar API de boleto:', { notaFiscalId, error: err.message });
    return { boleto: null, erro: err.message || 'Falha de comunicação com o serviço de boleto' };
  }
};

/**
 * Valida dados de geração de crédito
 * @param {object} payload - Dados de entrada
 * @param {number} clienteId - ID do cliente
 * @returns {object} Payload validado
 */
const validarPayloadCredito = (payload, clienteId) => {
  const { colaboradores } = payload;

  // Validação de colaboradores
  if (!Array.isArray(colaboradores) || colaboradores.length === 0) {
    throw new APIError('Mínimo 1 colaborador é obrigatório', 400, { campo: 'colaboradores' });
  }

  if (colaboradores.length > 5000) {
    throw new APIError('Máximo 5000 colaboradores permitidos', 400, { campo: 'colaboradores' });
  }

  // Detecta modo: por ID (seleção manual) ou por CPF (importação Excel)
  const modoCpf = colaboradores.some(c => !c.id || c.id <= 0);

  // Validação de valores individuais
  colaboradores.forEach((colab, index) => {
    if (modoCpf) {
      // Modo CPF: precisa ter cpf válido
      const cpfLimpo = (colab.cpf || '').replace(/\D/g, '');
      if (cpfLimpo.length !== 11) {
        throw new APIError(`Colaborador ${index + 1}: CPF inválido`, 400);
      }
    } else {
      // Modo ID: precisa ter id válido
      if (!colab.id || !Number.isInteger(colab.id) || colab.id <= 0) {
        throw new APIError(`Colaborador ${index + 1}: ID inválido`, 400);
      }
    }

    // Cada colaborador precisa de valor
    if (!isValidPositiveNumber(colab.valor, 1000000)) {
      throw new APIError(`Colaborador ${index + 1}: Valor inválido ou excede o limite`, 400);
    }
  });

  // Título da recarga (opcional, máx 40 chars)
  const titulo = payload.titulo ? String(payload.titulo).trim().substring(0, 40) : null;

  // Data de disponibilização (padrão: hoje + 1)
  let dataDisponibilizacao = null;
  if (payload.dataDisponibilizacao) {
    const data = new Date(payload.dataDisponibilizacao + 'T00:00:00');
    if (isNaN(data.getTime())) {
      throw new APIError('Data de disponibilização inválida', 400);
    }
    dataDisponibilizacao = payload.dataDisponibilizacao;
  }

  return {
    colaboradores,
    clienteId,
    modoCpf,
    titulo,
    dataDisponibilizacao
  };
};

/**
 * Gera crédito para múltiplos colaboradores (com transação)
 * Replica lógica dos MKFs:
 * 1. Gera remessa_id via sequence (nextval)
 * 2. Insere remessa com (id, data, login, cli_id) — apenas 4 campos
 * 3. Para cada colaborador: insere crédito com valor direto (sem taxa)
 *    com crd_pro_id=201 e crd_sit_id=2, usando dataDisponibilizacao em crd_usu_data_credito
 *
 * @param {object} payload - Dados validados
 * @param {string} login - Login do usuário que está gerando
 * @returns {Promise<object>} Resultado da geração
 */
const gerarCredito = async (payload, login = 'sistema') => {
  const { colaboradores, clienteId, modoCpf, titulo, dataDisponibilizacao } = payload;
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    let colaboradoresValidos;

    if (modoCpf) {
      // Modo Excel: resolve IDs pelo CPF (como o MKF faz)
      const cpfs = colaboradores.map(c => (c.cpf || '').replace(/\D/g, '').padStart(11, '0'));
      colaboradoresValidos = await colaboradoresRepository.buscarColaboradoresPorCpfs(cpfs, clienteId);
    } else {
      // Modo manual: busca pelo ID
      const ids = colaboradores.map(c => c.id);
      colaboradoresValidos = await colaboradoresRepository.buscarColaboradoresPorIds(ids, clienteId);
    }

    // 2. Cria registro de remessa (ID gerado automaticamente pela sequence)
    const remessaId = await creditosRepository.criarRemessa(client, clienteId, login, titulo);

    // 3. Processa cada colaborador — valor direto, sem cálculo de taxa
    let valorTotal = 0;
    const creditosCriados = [];
    const ignorados = [];

    for (const colab of colaboradores) {
      // Encontra colaborador no banco: por ID ou por CPF
      let colabDB;
      if (modoCpf) {
        const cpfLimpo = (colab.cpf || '').replace(/\D/g, '').padStart(11, '0');
        colabDB = colaboradoresValidos.find(c => {
          const dbCpfLimpo = (c.cpf || '').replace(/\D/g, '').padStart(11, '0');
          return dbCpfLimpo === cpfLimpo;
        });
      } else {
        colabDB = colaboradoresValidos.find(c => c.id === colab.id);
      }

      if (!colabDB) {
        ignorados.push({
          id: colab.id || 0,
          cpf: colab.cpf || '',
          nome: colab.nome || '',
          motivo: 'CPF não encontrado ou colaborador inativo'
        });
        continue;
      }

      // Valor informado pelo usuário (bruto — gravado direto, sem desconto)
      const valor = parseFloat(colab.valor);

      if (!valor || valor <= 0) {
        ignorados.push({ id: colabDB.id, motivo: 'valor<=0' });
        continue;
      }

      // CPF do colaborador (limpo, como no MKF)
      const cpf = (colabDB.cpf || '').replace(/[.\-]/g, '').padStart(11, '0');

      // Insere crédito individual com valor bruto (sem desconto)
      const creditoId = await creditosRepository.inserirCredito(
        client,
        colabDB.id,
        valor,
        cpf,
        remessaId,
        clienteId,
        login,
        dataDisponibilizacao
      );

      creditosCriados.push({
        credito_id: creditoId,
        colaborador_id: colabDB.id,
        nome: colabDB.nome,
        valor
      });

      valorTotal += valor;
    }

    // 4. Gera nota fiscal vinculada à remessa
    let notaFiscalId = null;
    if (creditosCriados.length > 0) {
      const { taxa, tipo } = await colaboradoresRepository.buscarTaxaCliente(clienteId);
      const valorBruto = Math.round(valorTotal * 100) / 100;
      const valorServico = Math.round(valorTotal * taxa / 100 * 100) / 100;

      // Tipo 'A' (acréscimo): o restaurante paga a taxa por cima — o boleto fica
      // bruto + taxa e os colaboradores recebem o valor cheio (bruto).
      // Tipo 'D' (desconto, padrão): a taxa sai do colaborador — o boleto fica
      // igual ao bruto e a movimentação aos colaboradores é bruto - taxa.
      const isAcrescimo = tipo === 'A';
      const valorNotaFiscal = isAcrescimo
        ? Math.round((valorBruto + valorServico) * 100) / 100
        : valorBruto;
      const valorMovimentacao = isAcrescimo
        ? valorBruto
        : Math.round((valorBruto - valorServico) * 100) / 100;

      notaFiscalId = await creditosRepository.criarNotaFiscal(
        client,
        clienteId,
        valorNotaFiscal,
        valorServico,
        valorMovimentacao
      );

      // 4.1. Associa todos os créditos da remessa à nota criada (crd_not_id)
      await creditosRepository.associarCreditosANota(
        client,
        remessaId,
        clienteId,
        notaFiscalId
      );
    }

    // 5. Confirma transação
    await client.query('COMMIT');

    // 6. Gera boleto via API EFI (após COMMIT, para não travar a transação)
    const { boleto, erro: boletoErro } = await chamarApiBoleto(notaFiscalId);
    if (notaFiscalId) {
      if (boletoErro) {
        await creditosRepository.atualizarStatusRemessa(remessaId, clienteId, 'E').catch(() => {});
      }
    }

    logger.info('Crédito gerado com sucesso:', {
      remessaId,
      clienteId,
      notaFiscalId,
      boleto: boleto ? { charge_id: boleto.charge_id, status: boleto.status } : null,
      totalColaboradores: creditosCriados.length,
      totalIgnorados: ignorados.length,
      valorTotal,
      login
    });

    return created({
      remessa_id: remessaId,
      nota_fiscal_id: notaFiscalId,
      total_inseridos: creditosCriados.length,
      total_ignorados: ignorados.length,
      valor_total: Math.round(valorTotal * 100) / 100,
      data_criacao: new Date().toISOString(),
      criado_por: login,
      detalhes: creditosCriados,
      ignorados: ignorados.length > 0 ? ignorados : undefined,
      boleto: boleto ? {
        charge_id: boleto.charge_id,
        status: boleto.status,
        codigo_barras: boleto.codigo_barras,
        linha_digitavel: boleto.linha_digitavel,
        pix_qrcode: boleto.pix?.qrcode || null,
        pdf_url: boleto.links?.pdf_url || null,
        qrcode_image_url: boleto.links?.qrcode_image_url || null
      } : null,
      boleto_erro: boletoErro
    }, `Crédito gerado com sucesso para ${creditosCriados.length} colaborador(es)`);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Erro ao gerar recarga:', { error: error.message });

    if (error instanceof APIError) {
      throw error;
    }

    throw new APIError('Erro ao gerar recarga', 500);
  } finally {
    client.release();
  }
};

/**
 * Busca histórico de gerações
 * @param {object} query - Query parameters
 * @param {number} clienteId - ID do cliente
 * @returns {Promise<object>} Histórico e metadados
 */
const obterHistorico = async (query, clienteId) => {
  if (!clienteId) {
    throw new APIError('cliente_id é obrigatório', 400);
  }

  const { limit, offset, data_inicio, data_fim } = query;
  const { limit: validLimit, offset: validOffset } = validatePagination(limit, offset);

  try {
    const resultado = await creditosRepository.buscarHistorico(
      clienteId,
      validLimit,
      validOffset,
      data_inicio,
      data_fim
    );

    logger.info('Histórico buscado:', {
      clienteId,
      total: resultado.total,
      filtro_datas: { data_inicio, data_fim }
    });

    return paginated(resultado.historico, {
      total: resultado.total,
      limit: validLimit,
      offset: validOffset
    });
  } catch (error) {
    logger.error('Erro ao obter histórico:', { error: error.message });
    throw new APIError('Erro ao buscar histórico', 500);
  }
};

/**
 * Busca detalhes de uma remessa específica
 * @param {number} remessaId - ID da remessa
 * @param {number} clienteId - ID do cliente
 * @returns {Promise<object>} Detalhes da remessa
 */
const obterDetalheRemessa = async (remessaId, clienteId) => {
  if (!remessaId || !clienteId) {
    throw new APIError('remessa_id e cliente_id são obrigatórios', 400);
  }

  try {
    const detalhes = await creditosRepository.buscarDetalheRemessa(remessaId, clienteId);

    // Antes de montar a resposta, tenta sincronizar o status do boleto com a EFI
    // para casos como a Remessa #108 (paga após cancelamento manual): se a EFI
    // tem o estado correto, atualiza local e o badge sai certo na tela.
    if (detalhes.length > 0 && detalhes[0].nota_fiscal_id) {
      const statusAtualizado = await sincronizarStatusBoletoEFI(
        detalhes[0].nota_fiscal_id,
        detalhes[0].boleto_status
      );
      if (statusAtualizado !== detalhes[0].boleto_status) {
        detalhes.forEach(d => { d.boleto_status = statusAtualizado; });
      }
    }

    const nf0 = detalhes[0] || {};

    // Bruto = soma dos créditos (valor digitado por colaborador). Não depende do tipo.
    const totalBruto = Math.round(detalhes.reduce((s, d) => s + (parseFloat(d.valor_bruto) || 0), 0) * 100) / 100;

    // IMPORTANTE: a verdade do que foi cobrado está gravada na NOTA FISCAL no momento
    // da geração (boleto, taxa e movimentação). Usamos esses valores para exibir — e
    // inferimos o tipo a partir deles — para que uma remessa já gerada NÃO mude de
    // valor na tela se o restaurante trocar de tipo/taxa depois. Só caímos no
    // tipo/taxa atuais do cliente quando não há nota fiscal vinculada.
    const temNota = nf0.nf_valor_boleto != null;
    let valorBoleto, valorTaxa, totalLiquido, isAcrescimo, taxa;
    if (temNota) {
      valorBoleto = Math.round((parseFloat(nf0.nf_valor_boleto) || 0) * 100) / 100;
      valorTaxa = Math.round((parseFloat(nf0.nf_valor_servico) || 0) * 100) / 100;
      totalLiquido = Math.round((parseFloat(nf0.nf_valor_movimentacao) || 0) * 100) / 100;
      // 'A' deixou o boleto acima do bruto (taxa por cima); 'D' deixou boleto = bruto.
      isAcrescimo = valorBoleto > totalBruto + 0.005;
      // % derivada do que foi efetivamente cobrado (a NF guarda o valor, não a alíquota).
      taxa = totalBruto > 0 ? Math.round(valorTaxa / totalBruto * 100 * 100) / 100 : 0;
    } else {
      isAcrescimo = nf0.tipo_taxa === 'A';
      taxa = parseFloat(nf0.taxa) || 0;
      valorTaxa = Math.round(totalBruto * taxa / 100 * 100) / 100;
      totalLiquido = isAcrescimo ? totalBruto : Math.round((totalBruto - valorTaxa) * 100) / 100;
      valorBoleto = isAcrescimo ? Math.round((totalBruto + valorTaxa) * 100) / 100 : totalBruto;
    }
    const tipoTaxa = isAcrescimo ? 'A' : 'D';

    const meta = detalhes.length > 0 ? {
      criado_por: detalhes[0].criado_por,
      data_criacao: detalhes[0].data_criacao,
      restaurante: detalhes[0].restaurante,
      titulo: detalhes[0].titulo || null,
      status: detalhes[0].status || null
    } : {};

    // Dados do boleto (vêm do JOIN com crd_nota_fiscal)
    const boleto = detalhes.length > 0 && detalhes[0].boleto_charge_id ? {
      nota_fiscal_id: detalhes[0].nota_fiscal_id,
      charge_id: detalhes[0].boleto_charge_id,
      codigo_barras: detalhes[0].boleto_codigo_barras,
      linha_digitavel: detalhes[0].boleto_linha_digitavel,
      pix_qrcode: detalhes[0].boleto_pix_qrcode,
      pdf_url: detalhes[0].boleto_pdf_url,
      qrcode_image_url: detalhes[0].boleto_qrcode_image_url,
      status: detalhes[0].boleto_status
    } : null;

    // Líquido por colaborador, proporcional à movimentação total (cobre A e D):
    // fator = movimentação/bruto → em 'A' = 1 (recebe cheio); em 'D' = 1 - taxa%.
    const fatorLiquido = totalBruto > 0 ? totalLiquido / totalBruto : 1;
    const colaboradores = detalhes.map(d => {
      const valorBruto = parseFloat(d.valor_bruto) || 0;
      const valorLiquido = Math.round(valorBruto * fatorLiquido * 100) / 100;
      return {
        credito_id: d.credito_id,
        colaborador_id: d.colaborador_id,
        nome: d.nome,
        cpf: d.cpf,
        valor_bruto: valorBruto,
        valor_liquido: valorLiquido,
        data_credito: d.data_credito
      };
    });

    return ok({
      remessa_id: remessaId,
      taxa,
      tipo_taxa: tipoTaxa,
      ...meta,
      total_colaboradores: colaboradores.length,
      valor_bruto: totalBruto,
      valor_liquido: totalLiquido,
      valor_taxa: valorTaxa,
      valor_boleto: valorBoleto,
      boleto,
      colaboradores
    });
  } catch (error) {
    logger.error('Erro ao obter detalhe da remessa:', { error: error.message });
    throw new APIError('Erro ao buscar detalhes da remessa', 500);
  }
};

/**
 * Cancela uma remessa inteira:
 * 1. Verifica se existe nota fiscal vinculada
 * 2. Se tem boleto, consulta status na API EFI
 * 3. Se boleto está aberto (waiting), cancela na API EFI
 * 4. Cancela: créditos (crd_sit_id=3), remessa (crd_rem_status='C') e nota fiscal (crd_not_situacao='C')
 *
 * @param {number} remessaId - ID da remessa
 * @param {number} clienteId - ID do cliente
 * @returns {Promise<object>} Resultado do cancelamento
 */
const cancelarRemessa = async (remessaId, clienteId, canceladoPor = null) => {
  if (!remessaId || !clienteId) {
    throw new APIError('remessa_id e cliente_id são obrigatórios', 400);
  }

  // 1. Busca nota fiscal vinculada à remessa
  const notaFiscal = await creditosRepository.buscarNotaFiscalPorRemessa(remessaId, clienteId);

  const baseUrl = process.env.BASE_URL_HUB_BAAS || 'http://localhost:5003';
  const idOperacao = process.env.HUB_BAAS_ID_OPERACAO || 'BOLETO_EFI';
  const token = process.env.HUB_BAAS_TOKEN || '';
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let boletoStatus = null;
  let boletoStatusConsultado = false;
  let boletoCancelado = false;

  // 2. Se tem nota com boleto, verifica status no EFI
  // A checagem é obrigatória — não dá pra cancelar uma remessa sem confirmar
  // que o boleto não foi pago, senão corremos o risco de marcar como cancelada
  // uma remessa cujo boleto foi quitado e ainda não sincronizou no DB.
  if (notaFiscal && notaFiscal.nota_fiscal_id) {
    try {
      const statusUrl = `${baseUrl}/efi/V1/boleto/${idOperacao}/${notaFiscal.nota_fiscal_id}`;
      const statusResponse = await fetch(statusUrl, { headers });
      const statusResult = await statusResponse.json();

      if (statusResponse.ok && statusResult?.data?.status) {
        boletoStatus = statusResult.data.status;
        boletoStatusConsultado = true;
        logger.info('Status do boleto consultado:', { notaId: notaFiscal.nota_fiscal_id, status: boletoStatus });
      }
    } catch (err) {
      logger.warn('Erro ao consultar status do boleto:', { error: err.message });
    }

    if (!boletoStatusConsultado) {
      throw new APIError(
        'Não foi possível confirmar o status atual do boleto na EFI. Tente novamente em instantes.',
        503
      );
    }

    if (boletoStatus === 'paid' || boletoStatus === 'settled') {
      throw new APIError('Não é possível cancelar: o boleto já foi pago', 400, { status: boletoStatus });
    }

    // 3. Se boleto está aberto (waiting/active), cancela na API EFI
    if (boletoStatus === 'waiting' || boletoStatus === 'active') {
      try {
        const cancelUrl = `${baseUrl}/efi/V1/boleto/${idOperacao}/${notaFiscal.nota_fiscal_id}/cancel`;
        const cancelResponse = await fetch(cancelUrl, {
          method: 'PUT',
          headers
        });
        const cancelResult = await cancelResponse.json().catch(() => null);
        boletoCancelado = cancelResponse.ok;
        logger.info('Boleto cancelado na API EFI:', { notaId: notaFiscal.nota_fiscal_id, resultado: cancelResult });
      } catch (err) {
        logger.warn('Erro ao cancelar boleto na API EFI (prosseguindo com exclusão):', { error: err.message });
      }
    }
  }

  // 4. Exclui tudo em transação
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Cancela créditos (crd_sit_id = 3)
    const creditosCancelados = await creditosRepository.cancelarCreditosPorRemessa(client, remessaId, clienteId);

    // Cancela nota fiscal (crd_not_situacao = 'C')
    if (notaFiscal && notaFiscal.nota_fiscal_id) {
      await creditosRepository.cancelarNotaFiscal(client, notaFiscal.nota_fiscal_id, canceladoPor);
    }

    // Cancela remessa (crd_rem_status = 'C')
    const remessaCancelada = await creditosRepository.cancelarRemessaRepo(client, remessaId, clienteId);

    if (remessaCancelada === 0) {
      await client.query('ROLLBACK');
      throw new APIError('Remessa não encontrada', 404);
    }

    await client.query('COMMIT');

    logger.info('Remessa cancelada com sucesso:', {
      remessaId,
      clienteId,
      creditosCancelados,
      notaCancelada: notaFiscal?.nota_fiscal_id || null,
      boletoCancelado,
      boletoStatus
    });

    return ok({
      remessa_id: remessaId,
      creditos_cancelados: creditosCancelados,
      nota_fiscal_cancelada: notaFiscal?.nota_fiscal_id || null,
      boleto_cancelado: boletoCancelado,
      boleto_status_anterior: boletoStatus
    }, 'Remessa cancelada com sucesso');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Erro ao cancelar remessa:', { error: error.message });

    if (error instanceof APIError) throw error;
    throw new APIError('Erro ao cancelar remessa', 500);
  } finally {
    client.release();
  }
};

/**
 * Reemite o boleto de uma remessa que ficou em erro.
 * Se sucesso, limpa o status de erro da remessa.
 */
const reemitirBoleto = async (remessaId, clienteId) => {
  if (!remessaId || !clienteId) {
    throw new APIError('remessa_id e cliente_id são obrigatórios', 400);
  }

  const notaFiscal = await creditosRepository.buscarNotaFiscalPorRemessa(remessaId, clienteId);
  if (!notaFiscal || !notaFiscal.nota_fiscal_id) {
    throw new APIError('Nota fiscal não encontrada para esta remessa', 404);
  }

  const { boleto, erro } = await chamarApiBoleto(notaFiscal.nota_fiscal_id);

  if (erro) {
    await creditosRepository.atualizarStatusRemessa(remessaId, clienteId, 'E').catch(() => {});
    throw new APIError(`Erro ao gerar boleto: ${erro}`, 502, { boleto_erro: erro });
  }

  await creditosRepository.atualizarStatusRemessa(remessaId, clienteId, null).catch(() => {});

  return ok({
    remessa_id: remessaId,
    nota_fiscal_id: notaFiscal.nota_fiscal_id,
    boleto: {
      charge_id: boleto.charge_id,
      status: boleto.status,
      codigo_barras: boleto.codigo_barras,
      linha_digitavel: boleto.linha_digitavel,
      pix_qrcode: boleto.pix?.qrcode || null,
      pdf_url: boleto.links?.pdf_url || null,
      qrcode_image_url: boleto.links?.qrcode_image_url || null
    }
  }, 'Boleto gerado com sucesso');
};

module.exports = {
  validarPayloadCredito,
  gerarCredito,
  obterHistorico,
  obterDetalheRemessa,
  cancelarRemessa,
  reemitirBoleto
};
