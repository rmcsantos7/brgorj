/**
 * Service de Autenticação
 * Valida credenciais usando hash MD5(usr_codigo + senha)
 */

const crypto = require('crypto');
const https = require('https');
const constants = require('constants');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const authRepository = require('../repositories/auth.repository');
const { APIError } = require('../middlewares/errorHandler');
const { ok } = require('../utils/response');
const logger = require('../utils/logger');

// SEGURANÇA: JWT_SECRET obrigatório via variável de ambiente
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET não definido nas variáveis de ambiente. O servidor não pode iniciar sem esta configuração.');
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Gera hash MD5
 */
const md5 = (str) => crypto.createHash('md5').update(String(str)).digest('hex');

/**
 * Verifica senha via MD5(usr_codigo + senha)
 */
const verificarSenha = (usuario, senha) => {
  const hashBanco = usuario.usr_senha;
  const concatenacao = String(usuario.usr_codigo) + senha;
  const hashGerado = md5(concatenacao);
  return hashGerado === hashBanco;
};

/**
 * Mascara um email: r***@dominio.com
 */
const mascararEmail = (email) => {
  if (!email || typeof email !== 'string') return null;
  const [user, domain] = email.split('@');
  if (!domain) return null;
  const visible = user.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(1, user.length - 1))}@${domain}`;
};

/**
 * Mascara um celular: (11) 9****-1234
 */
const mascararCelular = (celular) => {
  if (!celular) return null;
  const limpo = String(celular).replace(/\D/g, '');
  if (limpo.length < 4) return null;
  const fim = limpo.slice(-4);
  return '*'.repeat(Math.max(1, limpo.length - 4)) + fim;
};

/**
 * Gera código numérico de 6 dígitos
 */
const gerarCodigo2FA = () => {
  return String(Math.floor(100000 + Math.random() * 900000));
};

/**
 * Envia SMS via wrapper PHP (mesma chamada usada pelo MKF "Enviar SMS Generico").
 *   GET {host}numero={destinatario}&str={mensagem}&token={token}&size=2
 *
 * Configuração lida de crd_dados_sensiveis pk=2:
 *   crd_dad_host  → URL completa terminando em '?' (ex.: ".../new_envio.php?")
 *   crd_dad_senha → token
 */
const enviarSMS = async (numero, mensagem) => {
  const cfg = await authRepository.buscarConfigSMS();
  if (!cfg || !cfg.host || !cfg.token || !cfg.servico || !cfg.parceiro_id) {
    logger.warn('SMS não configurado:', {
      temHost: !!cfg?.host, temToken: !!cfg?.token,
      temServico: !!cfg?.servico, temParceiro: !!cfg?.parceiro_id
    });
    throw new APIError('Configuração de SMS não disponível', 500);
  }

  const numeroLimpo = String(numero).replace(/\D/g, '');
  // Mobile BR com DDI = 13 dígitos (55 + DDD + 9XXXXXXXX). Se já temos
  // 12 ou 13 dígitos, confiamos que o DDI já veio; com 10 ou 11 dígitos
  // (DDD+número), prepende o 55. Olhar só o prefixo "55" classificaria
  // um celular de Santa Maria-RS (DDD 55) como já-tendo-DDI por engano.
  let numeroComDDI;
  if (numeroLimpo.length === 12 || numeroLimpo.length === 13) {
    numeroComDDI = numeroLimpo;
  } else if (numeroLimpo.length === 10 || numeroLimpo.length === 11) {
    numeroComDDI = `55${numeroLimpo}`;
  } else {
    logger.warn('SMS: número com tamanho inválido', { tamanho: numeroLimpo.length });
    throw new APIError('Número de celular cadastrado é inválido', 400);
  }
  if (numeroComDDI.length !== 13) {
    logger.warn('SMS: número final não é mobile BR válido', { tamanho: numeroComDDI.length });
    throw new APIError('Número de celular cadastrado não é um mobile válido', 400);
  }

  // Normaliza a mensagem para um subset seguro do GSM-7 (codificacao: '0').
  // Diacríticos pt-BR (ã, õ, ó, í, á, â, ê, ú...) e pontuação tipográfica
  // (em-dash, aspas curvas, reticências) ficam fora do GSM-7 básico —
  // gateways às vezes aceitam o request e silenciosamente não despacham.
  // Para SMS transacional de código de verificação não vale a pena gastar
  // metade dos caracteres com UCS-2; padroniza tudo em ASCII.
  const mensagemNormalizada = mensagem
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacríticos
    .replace(/[‐-―]/g, '-') // hifens/dashes unicode → '-'
    .replace(/[‘’]/g, "'") // aspas simples tipográficas
    .replace(/[“”]/g, '"') // aspas duplas tipográficas
    .replace(/…/g, '...')        // reticências
    .replace(/[^\x20-\x7E]/g, '');    // descarta o que sobrar fora do ASCII imprimível

  const payload = JSON.stringify([{
    numero: numeroComDDI,
    servico: cfg.servico,
    mensagem: mensagemNormalizada,
    parceiro_id: cfg.parceiro_id,
    codificacao: '0'
  }]);

  const url = new URL(cfg.host);

  // Servidor usa OpenSSL antigo / cert expirado — renegociação legacy + skip cert.
  const agent = new https.Agent({
    secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT,
    rejectUnauthorized: false
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      agent,
      headers: {
        'Authorization': `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (resp) => {
      let body = '';
      resp.on('data', chunk => { body += chunk; });
      resp.on('end', () => {
        logger.info('SMS enviado (resposta provedor):', { httpStatus: resp.statusCode, preview: body.slice(0, 300) });
        // Provedor pode responder 200 com erro no corpo — checa o status no JSON
        let okCorpo = resp.statusCode >= 200 && resp.statusCode < 300;
        try {
          const json = JSON.parse(body);
          if (json && typeof json.status === 'number') {
            okCorpo = json.status >= 200 && json.status < 300;
          }
          if (Array.isArray(json?.detail)) {
            const accepted = json.detail.some(d => d?.status === 'ACCEPTED');
            okCorpo = okCorpo && accepted;
          }
        } catch { /* corpo não é JSON */ }
        if (okCorpo) resolve();
        else reject(new APIError('Falha ao enviar SMS', 500));
      });
    });
    req.on('error', (err) => {
      logger.error('Erro ao chamar provedor SMS:', { error: err.message });
      reject(new APIError('Erro ao enviar SMS — tente outro método', 500));
    });
    req.write(payload);
    req.end();
  });
};

/**
 * Envia código por email usando SMTP (crd_dados_sensiveis pk=1)
 */
const enviarCodigoPorEmail = async (usuario, codigo) => {
  const smtp = await authRepository.buscarConfigSMTP(1);
  if (!smtp) {
    throw new APIError('Configuração de email não disponível', 500);
  }
  const portaNum = parseInt(smtp.porta, 10) || 587;
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: portaNum,
    secure: portaNum === 465,
    auth: { user: smtp.usuario, pass: smtp.senha },
    tls: { rejectUnauthorized: false }
  });

  const html = `
    <div style="font-family: 'Nunito', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px;">
      <div style="background: #4A1D4F; border-radius: 12px; padding: 30px; text-align: center;">
        ${smtp.logo_url ? `<img src="${smtp.logo_url}" alt="Logo" style="max-height: 50px; margin-bottom: 20px;" />` : ''}
        <h2 style="color: #fff; margin: 0 0 10px; font-size: 22px;">Código de verificação</h2>
        <p style="color: rgba(255,255,255,0.8); font-size: 14px; margin: 0 0 25px;">
          Olá <strong>${usuario.usr_nome}</strong>, use o código abaixo para concluir seu login.
        </p>
        <div style="background: rgba(255,255,255,0.1); border-radius: 8px; padding: 24px; margin-bottom: 18px;">
          <p style="color: #F9678C; font-size: 32px; font-weight: 800; letter-spacing: 8px; margin: 0; font-family: monospace;">
            ${codigo}
          </p>
        </div>
        <p style="color: rgba(255,255,255,0.6); font-size: 12px; margin: 0;">
          O código expira em 5 minutos. Se você não solicitou, ignore este email.
        </p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"BR Gorjeta" <${smtp.remetente || smtp.usuario}>`,
    to: usuario.usr_email,
    subject: 'Código de verificação — BR Gorjeta',
    html
  });
};

/**
 * Lista os restaurantes efetivos do usuário.
 * Para Master (usr_administrador='S') sem vínculo em fr_usuario_role,
 * cai para todos os restaurantes — alinhado ao verificarClienteId, que já
 * permite a admins acessar qualquer cliente.
 */
const obterRestaurantesDoUsuario = async (usuario) => {
  const proprios = await authRepository.listarRestaurantesDoUsuario(usuario.usr_codigo);
  if (proprios && proprios.length > 0) return proprios;
  if (usuario.usr_administrador === 'S') {
    return authRepository.listarTodosRestaurantes();
  }
  return [];
};

/**
 * Etapa 1 — valida login + senha e gera challenge_token de 2FA.
 */
const login = async (loginUsuario, senha) => {
  if (!loginUsuario || !senha) {
    throw new APIError('Login e senha são obrigatórios', 400);
  }

  try {
    const usuario = await authRepository.buscarUsuarioPorLogin(loginUsuario);
    if (!usuario) throw new APIError('Usuário ou senha inválidos', 401);

    const valido = verificarSenha(usuario, senha);
    if (!valido) throw new APIError('Usuário ou senha inválidos', 401);

    // Confere se o usuário tem ao menos um restaurante acessível antes de pedir 2FA
    // (Masters sem vínculo enxergam todos os restaurantes)
    const restaurantes = await obterRestaurantesDoUsuario(usuario);
    if (!restaurantes || restaurantes.length === 0) {
      throw new APIError('Nenhum restaurante vinculado a este usuário — contate o suporte', 403);
    }

    const challengeToken = jwt.sign(
      { phase: 'choose-method', usr_codigo: usuario.usr_codigo },
      JWT_SECRET,
      { expiresIn: '5m' }
    );

    logger.info('Login etapa 1 OK — aguardando 2FA:', { login: loginUsuario, usr_codigo: usuario.usr_codigo });

    // O login do usuário é, por convenção do Portal, o próprio email.
    const emailEfetivo = usuario.usr_email || usuario.usr_login;

    return ok({
      challenge_token: challengeToken,
      awaiting_2fa: true,
      contato: {
        email_mask: mascararEmail(emailEfetivo),
        celular_mask: mascararCelular(usuario.usr_celular),
        tem_email: true,
        tem_celular: !!usuario.usr_celular
      }
    });
  } catch (error) {
    if (error instanceof APIError) throw error;
    logger.error('Erro no login:', { error: error.message });
    throw new APIError('Erro interno no login', 500);
  }
};

/**
 * Etapa 2 — gera código de 6 dígitos e envia pelo método escolhido (sms|email).
 * Retorna novo challenge_token contendo hash do código.
 */
const enviarCodigo2FA = async (challengeToken, metodo) => {
  if (!challengeToken) throw new APIError('challenge_token é obrigatório', 400);
  if (!['sms', 'email'].includes(metodo)) {
    throw new APIError('Método inválido — use sms ou email', 400);
  }

  let payload;
  try {
    payload = jwt.verify(challengeToken, JWT_SECRET);
  } catch {
    throw new APIError('Sessão de login expirada — faça login novamente', 401);
  }
  if (payload.phase !== 'choose-method') {
    throw new APIError('Token de etapa inválido', 400);
  }

  const usuario = await authRepository.buscarUsuarioPorCodigo(payload.usr_codigo);
  if (!usuario) throw new APIError('Usuário não encontrado', 404);

  // O login do usuário é o próprio email
  const emailEfetivo = usuario.usr_email || usuario.usr_login;

  if (metodo === 'sms' && !usuario.usr_celular) {
    throw new APIError('Usuário sem celular cadastrado', 400);
  }

  const codigo = gerarCodigo2FA();
  const codeHash = md5(`${usuario.usr_codigo}:${codigo}`);

  if (metodo === 'email') {
    await enviarCodigoPorEmail({ ...usuario, usr_email: emailEfetivo }, codigo);
  } else {
    await enviarSMS(usuario.usr_celular, `BR Gorjeta — seu código de verificação é ${codigo}. Expira em 5 minutos.`);
  }

  const novoChallenge = jwt.sign(
    { phase: 'verify', usr_codigo: usuario.usr_codigo, code_hash: codeHash, metodo },
    JWT_SECRET,
    { expiresIn: '5m' }
  );

  logger.info('Código 2FA enviado:', { usr_codigo: usuario.usr_codigo, metodo });

  return ok({ challenge_token: novoChallenge, metodo });
};

/**
 * Etapa 3 — verifica código de 6 dígitos. Se ok, retorna JWT final + dados do usuário.
 */
const verificarCodigo2FA = async (challengeToken, codigo) => {
  if (!challengeToken) throw new APIError('challenge_token é obrigatório', 400);
  if (!codigo || !/^\d{6}$/.test(codigo)) {
    throw new APIError('Código inválido — informe os 6 dígitos', 400);
  }

  let payload;
  try {
    payload = jwt.verify(challengeToken, JWT_SECRET);
  } catch {
    throw new APIError('Código expirado — solicite um novo', 401);
  }
  if (payload.phase !== 'verify') {
    throw new APIError('Token de etapa inválido', 400);
  }

  const codeHash = md5(`${payload.usr_codigo}:${codigo}`);
  if (codeHash !== payload.code_hash) {
    throw new APIError('Código incorreto', 401);
  }

  // Reproduz a lógica do login original com o usuário já autenticado pelo 2FA
  const usuario = await authRepository.buscarUsuarioPorCodigo(payload.usr_codigo);
  if (!usuario) throw new APIError('Usuário não encontrado', 404);

  const senhaTemporaria = usuario.usr_senha_temporaria === true || usuario.usr_senha_temporaria === 'S';

  const restaurantes = await obterRestaurantesDoUsuario(usuario);
  if (!restaurantes || restaurantes.length === 0) {
    throw new APIError('Nenhum restaurante vinculado a este usuário — contate o suporte', 403);
  }

  const padrao = restaurantes[0];

  const token = jwt.sign(
    {
      usr_codigo: usuario.usr_codigo,
      usr_login: usuario.usr_login,
      usr_nome: usuario.usr_nome,
      crd_cli_id: padrao.crd_cli_id,
      cliente_nome: padrao.crd_cli_nome_fantasia,
      cliente_cnpj: padrao.crd_cli_cnpj,
      usr_administrador: usuario.usr_administrador,
      total_restaurantes: restaurantes.length,
      senha_temporaria: senhaTemporaria
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  logger.info('Login 2FA concluído:', { usr_codigo: usuario.usr_codigo, metodo: payload.metodo });

  const termsAccepted = await authRepository.termosForamAceitos(usuario.usr_codigo);

  return ok({
    token,
    senha_temporaria: senhaTemporaria,
    terms_accepted: termsAccepted,
    usuario: {
      usr_codigo: usuario.usr_codigo,
      usr_login: usuario.usr_login,
      usr_nome: usuario.usr_nome,
      usr_email: usuario.usr_email,
      crd_cli_id: padrao.crd_cli_id,
      cliente_nome: padrao.crd_cli_nome_fantasia,
      cliente_cnpj: padrao.crd_cli_cnpj,
      usr_administrador: usuario.usr_administrador,
      total_restaurantes: restaurantes.length
    },
    restaurantes: restaurantes.map(r => ({
      crd_cli_id: r.crd_cli_id,
      crd_cli_nome_fantasia: r.crd_cli_nome_fantasia,
      crd_cli_cnpj: r.crd_cli_cnpj
    }))
  });
};

/**
 * Registra o aceite dos termos de uso pelo usuário logado.
 */
const aceitarTermos = async (usuario) => {
  const usrCodigo = usuario?.codigo || usuario?.usr_codigo;
  if (!usrCodigo) throw new APIError('Usuário não autenticado', 401);
  await authRepository.registrarAceiteTermos(usrCodigo);
  logger.info('Termos aceitos:', { usr_codigo: usrCodigo });
  return ok({ aceito: true });
};

/**
 * Verifica e decodifica token JWT
 */
const verificarToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new APIError('Token inválido ou expirado', 401);
  }
};

/**
 * Recuperação de senha — gera senha temporária, salva com MD5 e envia por email
 */
const gerarSenhaTemporaria = (tamanho = 8) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let senha = '';
  for (let i = 0; i < tamanho; i++) {
    senha += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return senha;
};

const recuperarSenha = async (email) => {
  if (!email) {
    throw new APIError('Email é obrigatório', 400);
  }

  try {
    // 1. Buscar usuário pelo email
    const usuario = await authRepository.buscarUsuarioPorEmail(email);
    if (!usuario) {
      logger.info('Tentativa de recuperação para email não encontrado:', { email });
      return ok(null, 'Se o email estiver cadastrado, você receberá uma senha temporária em instantes.');
    }

    // 2. Buscar config SMTP do banco (pk=1)
    const smtp = await authRepository.buscarConfigSMTP(1);
    if (!smtp) {
      logger.error('Config SMTP não encontrada no banco (crd_dados_sensiveis pk=1)');
      throw new APIError('Configuração de email não disponível. Contate o administrador.', 500);
    }

    // 3. Gerar senha temporária
    const senhaTemporaria = gerarSenhaTemporaria();

    // 4. Salvar nova senha com MD5(usr_codigo + senha) + marcar como temporária
    const hashNovo = md5(String(usuario.usr_codigo) + senhaTemporaria);
    await authRepository.atualizarSenhaComFlag(usuario.usr_codigo, hashNovo, true);

    // 5. Configurar transporter nodemailer
    const portaNum = parseInt(smtp.porta, 10) || 587;
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: portaNum,
      secure: portaNum === 465,
      auth: {
        user: smtp.usuario,
        pass: smtp.senha
      },
      tls: { rejectUnauthorized: false }
    });

    // 6. Enviar email
    const htmlEmail = `
      <div style="font-family: 'Nunito', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px;">
        <div style="background: #4A1D4F; border-radius: 12px; padding: 30px; text-align: center;">
          ${smtp.logo_url ? `<img src="${smtp.logo_url}" alt="Logo" style="max-height: 50px; margin-bottom: 20px;" />` : ''}
          <h2 style="color: #fff; margin: 0 0 10px; font-size: 22px;">Recuperação de Senha</h2>
          <p style="color: rgba(255,255,255,0.8); font-size: 14px; margin: 0 0 25px;">
            Olá <strong>${usuario.usr_nome}</strong>, recebemos sua solicitação.
          </p>
          <div style="background: rgba(255,255,255,0.1); border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <p style="color: rgba(255,255,255,0.7); font-size: 12px; margin: 0 0 8px;">Sua nova senha temporária:</p>
            <p style="color: #F9678C; font-size: 28px; font-weight: 800; letter-spacing: 3px; margin: 0; font-family: monospace;">
              ${senhaTemporaria}
            </p>
          </div>
          <p style="color: rgba(255,255,255,0.6); font-size: 12px; margin: 0;">
            Você será solicitado a criar uma nova senha ao fazer login.
          </p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"BR Gorjeta" <${smtp.remetente || smtp.usuario}>`,
      to: usuario.usr_email || usuario.usr_login,
      subject: 'Recuperação de Senha - BR Gorjeta',
      html: htmlEmail
    });

    const emailDestino = usuario.usr_email || usuario.usr_login;
    logger.info('Senha temporária enviada por email:', { usr_codigo: usuario.usr_codigo, email: emailDestino });

    return {
      success: true,
      message: 'Se o email estiver cadastrado, você receberá uma senha temporária em instantes.'
    };
  } catch (error) {
    if (error instanceof APIError) throw error;
    logger.error('Erro na recuperação de senha:', { error: error.message });
    throw new APIError('Erro ao processar recuperação de senha. Tente novamente.', 500);
  }
};

/**
 * Troca de senha (obrigatória após senha temporária ou voluntária)
 */
const trocarSenha = async (usrCodigo, senhaAtual, novaSenha) => {
  if (!senhaAtual || !novaSenha) {
    throw new APIError('Senha atual e nova senha são obrigatórias', 400);
  }

  if (novaSenha.length < 6) {
    throw new APIError('A nova senha deve ter pelo menos 6 caracteres', 400);
  }

  if (!/[A-Z]/.test(novaSenha)) {
    throw new APIError('A nova senha deve ter pelo menos uma letra maiúscula', 400);
  }

  if (!/[0-9]/.test(novaSenha)) {
    throw new APIError('A nova senha deve ter pelo menos um número', 400);
  }

  if (!/[^A-Za-z0-9]/.test(novaSenha)) {
    throw new APIError('A nova senha deve ter pelo menos um caractere especial', 400);
  }

  try {
    const usuario = await authRepository.buscarUsuarioPorCodigo(usrCodigo);
    if (!usuario) {
      throw new APIError('Usuário não encontrado', 404);
    }

    // Verificar senha atual via MD5
    const valido = verificarSenha(usuario, senhaAtual);
    if (!valido) {
      throw new APIError('Senha atual incorreta', 401);
    }

    // Salvar nova senha como MD5(usr_codigo + novaSenha) e limpar flag
    const hashNovo = md5(String(usrCodigo) + novaSenha);
    await authRepository.atualizarSenhaComFlag(usrCodigo, hashNovo, false);

    // Gerar novo token sem flag de senha temporária
    const token = jwt.sign(
      {
        usr_codigo: usuario.usr_codigo,
        usr_login: usuario.usr_login,
        usr_nome: usuario.usr_nome,
        crd_cli_id: usuario.crd_cli_id,
        cliente_nome: usuario.cliente_nome,
        cliente_cnpj: usuario.cliente_cnpj,
        usr_administrador: usuario.usr_administrador,
        senha_temporaria: false
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    logger.info('Senha alterada com sucesso:', { usr_codigo: usrCodigo });

    return ok({ token }, 'Senha alterada com sucesso');
  } catch (error) {
    if (error instanceof APIError) throw error;
    logger.error('Erro ao trocar senha:', { error: error.message });
    throw new APIError('Erro ao alterar senha', 500);
  }
};

/**
 * Lista os restaurantes vinculados ao usuário logado via fr_usuario_role.
 */
const listarClientes = async (usuario) => {
  const usrCodigo = usuario?.codigo || usuario?.usr_codigo;
  if (!usrCodigo) throw new APIError('Usuário não autenticado', 401);

  try {
    const usuarioDb = await authRepository.buscarUsuarioPorCodigo(usrCodigo);
    if (!usuarioDb) throw new APIError('Usuário não encontrado', 404);
    const restaurantes = await obterRestaurantesDoUsuario(usuarioDb);
    return ok(restaurantes.map(c => ({
      crd_cli_id: c.crd_cli_id,
      crd_cli_nome_fantasia: c.crd_cli_nome_fantasia,
      crd_cli_cnpj: c.crd_cli_cnpj
    })));
  } catch (error) {
    if (error instanceof APIError) throw error;
    logger.error('Erro ao listar restaurantes do usuário:', { error: error.message });
    throw new APIError('Erro ao listar restaurantes', 500);
  }
};

/**
 * Troca o restaurante ativo. Valida que o id pertence aos vínculos do usuário
 * em fr_usuario_role e gera um novo token JWT com o novo crd_cli_id.
 */
const trocarCliente = async (usuario, novoClienteId) => {
  if (!novoClienteId) {
    throw new APIError('cliente_id é obrigatório', 400);
  }

  const usrCodigo = usuario?.codigo || usuario?.usr_codigo;
  if (!usrCodigo) throw new APIError('Usuário não autenticado', 401);

  try {
    const usuarioDb = await authRepository.buscarUsuarioPorCodigo(usrCodigo);
    if (!usuarioDb) {
      throw new APIError('Usuário não encontrado', 404);
    }

    // Restaurantes que esse usuário pode acessar (Master sem vínculo → todos)
    const restaurantes = await obterRestaurantesDoUsuario(usuarioDb);
    const cliente = restaurantes.find(r => r.crd_cli_id === parseInt(novoClienteId, 10));
    if (!cliente) {
      throw new APIError('Restaurante não vinculado a este usuário', 403);
    }

    const token = jwt.sign(
      {
        usr_codigo: usuarioDb.usr_codigo,
        usr_login: usuarioDb.usr_login,
        usr_nome: usuarioDb.usr_nome,
        crd_cli_id: cliente.crd_cli_id,
        cliente_nome: cliente.crd_cli_nome_fantasia,
        cliente_cnpj: cliente.crd_cli_cnpj,
        usr_administrador: usuarioDb.usr_administrador,
        total_restaurantes: restaurantes.length,
        senha_temporaria: false
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    logger.info('Usuário trocou de restaurante:', {
      usr_codigo: usuarioDb.usr_codigo,
      novoClienteId: cliente.crd_cli_id
    });

    return ok({
      token,
      usuario: {
        usr_codigo: usuarioDb.usr_codigo,
        usr_login: usuarioDb.usr_login,
        usr_nome: usuarioDb.usr_nome,
        usr_email: usuarioDb.usr_email,
        crd_cli_id: cliente.crd_cli_id,
        cliente_nome: cliente.crd_cli_nome_fantasia,
        cliente_cnpj: cliente.crd_cli_cnpj,
        usr_administrador: usuarioDb.usr_administrador,
        total_restaurantes: restaurantes.length
      }
    }, 'Cliente alterado com sucesso');
  } catch (error) {
    if (error instanceof APIError) throw error;
    logger.error('Erro ao trocar cliente:', { error: error.message });
    throw new APIError('Erro ao trocar cliente', 500);
  }
};

module.exports = {
  login,
  enviarCodigo2FA,
  verificarCodigo2FA,
  aceitarTermos,
  verificarToken,
  recuperarSenha,
  trocarSenha,
  listarClientes,
  trocarCliente
};
