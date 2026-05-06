/**
 * Repositório de Autenticação
 * Consultas ao banco para login (fr_usuario)
 */

const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * Busca usuário pelo login
 */
const buscarUsuarioPorLogin = async (login) => {
  const sql = `
    SELECT
      u.usr_codigo,
      u.usr_login,
      u.usr_senha,
      u.usr_nome,
      u.usr_email,
      u.usr_celular,
      u.usr_administrador,
      u.usr_senha_temporaria,
      u.crd_cli_id,
      c.crd_cli_nome_fantasia AS cliente_nome,
      c.crd_cli_cnpj AS cliente_cnpj
    FROM fr_usuario u
    LEFT JOIN crd_cliente c ON c.crd_cli_id = u.crd_cli_id
    WHERE LOWER(u.usr_login) = LOWER($1)
  `;

  try {
    const result = await db.query(sql, [login]);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Erro ao buscar usuário por login:', { error: error.message });
    throw error;
  }
};

/**
 * Atualiza senha e flag de senha temporária
 */
const atualizarSenhaComFlag = async (usrCodigo, novoHash, temporaria = false) => {
  const sql = `UPDATE fr_usuario SET usr_senha = $1, usr_senha_temporaria = $2 WHERE usr_codigo = $3`;
  try {
    await db.query(sql, [novoHash, temporaria ? 'S' : 'N', usrCodigo]);
  } catch (error) {
    logger.error('Erro ao atualizar senha:', { error: error.message });
    throw error;
  }
};

/**
 * Busca usuário pelo código (para troca de senha)
 */
const buscarUsuarioPorCodigo = async (usrCodigo) => {
  const sql = `
    SELECT
      u.usr_codigo,
      u.usr_login,
      u.usr_senha,
      u.usr_nome,
      u.usr_email,
      u.usr_celular,
      u.usr_administrador,
      u.usr_senha_temporaria,
      u.crd_cli_id,
      c.crd_cli_nome_fantasia AS cliente_nome,
      c.crd_cli_cnpj AS cliente_cnpj
    FROM fr_usuario u
    LEFT JOIN crd_cliente c ON c.crd_cli_id = u.crd_cli_id
    WHERE u.usr_codigo = $1
  `;
  try {
    const result = await db.query(sql, [usrCodigo]);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Erro ao buscar usuário por código:', { error: error.message });
    throw error;
  }
};

/**
 * Busca usuário pelo email
 */
const buscarUsuarioPorEmail = async (email) => {
  const sql = `
    SELECT
      u.usr_codigo,
      u.usr_login,
      u.usr_nome,
      u.usr_email
    FROM fr_usuario u
    WHERE LOWER(u.usr_login) = LOWER($1)
       OR LOWER(u.usr_email) = LOWER($1)
  `;

  try {
    const result = await db.query(sql, [email]);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Erro ao buscar usuário por email:', { error: error.message });
    throw error;
  }
};

/**
 * Lista os restaurantes vinculados a um usuário do Portal via fr_usuario_role.
 * Fallback: se o usuário não tem nenhuma linha em fr_usuario_role mas tem
 * fr_usuario.crd_cli_id setado (legado), retorna esse único cliente.
 */
const listarRestaurantesDoUsuario = async (usrCodigo) => {
  const sql = `
    SELECT c.crd_cli_id, c.crd_cli_nome_fantasia, c.crd_cli_cnpj
      FROM fr_usuario_role r
      JOIN crd_cliente c ON c.crd_cli_id = r.crd_cli_id
     WHERE r.usr_codigo = $1
       AND r.crd_cli_id IS NOT NULL
     ORDER BY c.crd_cli_nome_fantasia ASC
  `;

  try {
    const result = await db.query(sql, [usrCodigo]);
    if (result.rows.length > 0) return result.rows;

    const fallbackSql = `
      SELECT c.crd_cli_id, c.crd_cli_nome_fantasia, c.crd_cli_cnpj
        FROM fr_usuario u
        JOIN crd_cliente c ON c.crd_cli_id = u.crd_cli_id
       WHERE u.usr_codigo = $1
         AND u.crd_cli_id IS NOT NULL
    `;
    const fallback = await db.query(fallbackSql, [usrCodigo]);
    return fallback.rows;
  } catch (error) {
    logger.error('Erro ao listar restaurantes do usuário:', { error: error.message });
    throw error;
  }
};

/**
 * Lista todos os restaurantes (clientes) cadastrados.
 * Usado como fallback para usuários Master (usr_administrador='S') que não
 * estão vinculados a nenhum restaurante via fr_usuario_role.
 */
const listarTodosRestaurantes = async () => {
  const sql = `
    SELECT c.crd_cli_id, c.crd_cli_nome_fantasia, c.crd_cli_cnpj
      FROM crd_cliente c
     ORDER BY c.crd_cli_nome_fantasia ASC
  `;
  try {
    const result = await db.query(sql);
    return result.rows;
  } catch (error) {
    logger.error('Erro ao listar todos os restaurantes:', { error: error.message });
    throw error;
  }
};

/**
 * Busca um cliente pelo id (para validação de troca por admin)
 */
const buscarClientePorId = async (clienteId) => {
  const sql = `
    SELECT
      crd_cli_id,
      crd_cli_nome_fantasia,
      crd_cli_cnpj
    FROM crd_cliente
    WHERE crd_cli_id = $1
  `;

  try {
    const result = await db.query(sql, [clienteId]);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Erro ao buscar cliente por id:', { error: error.message });
    throw error;
  }
};

/**
 * Verifica se o usuário já aceitou os termos de uso (fr_usuario.usr_termos_aceitos).
 */
const termosForamAceitos = async (usrCodigo) => {
  const sql = `SELECT usr_termos_aceitos FROM fr_usuario WHERE usr_codigo = $1`;
  try {
    const result = await db.query(sql, [usrCodigo]);
    return result.rows[0]?.usr_termos_aceitos === true;
  } catch (error) {
    logger.error('Erro ao verificar aceite de termos:', { error: error.message });
    throw error;
  }
};

/**
 * Registra o aceite dos termos de uso pelo usuário (idempotente).
 */
const registrarAceiteTermos = async (usrCodigo) => {
  const sql = `
    UPDATE fr_usuario
    SET usr_termos_aceitos = true,
        usr_data_de_aceite = CURRENT_TIMESTAMP
    WHERE usr_codigo = $1
  `;
  try {
    await db.query(sql, [usrCodigo]);
  } catch (error) {
    logger.error('Erro ao registrar aceite de termos:', { error: error.message });
    throw error;
  }
};

/**
 * Busca configuração SMS (Brasilfone) — crd_dados_sensiveis pk=2
 */
const buscarConfigSMS = async () => {
  const sql = `
    SELECT
      crd_dad_host AS host,
      crd_dad_senha AS token,
      crd_dad_tipo_comunicacao AS servico,
      crd_dad_usuario AS parceiro_id
    FROM crd_dados_sensiveis
    WHERE crd_dad_id = 2
  `;
  try {
    const result = await db.query(sql);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Erro ao buscar config SMS:', { error: error.message });
    throw error;
  }
};

/**
 * Busca configuração SMTP da tabela crd_dados_sensiveis
 */
const buscarConfigSMTP = async (pk = 1) => {
  const sql = `
    SELECT
      crd_dad_host AS host,
      crd_dad_porta AS porta,
      crd_dad_usuario AS usuario,
      crd_dad_senha AS senha,
      crd_dad_remetente_principal AS remetente,
      crd_dad_tipo_comunicacao AS tipo_comunicacao,
      crd_dad_url_logo_empresa AS logo_url
    FROM crd_dados_sensiveis
    WHERE crd_dad_id = $1
  `;

  try {
    const result = await db.query(sql, [pk]);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Erro ao buscar config SMTP:', { error: error.message });
    throw error;
  }
};

module.exports = {
  buscarUsuarioPorLogin,
  atualizarSenhaComFlag,
  buscarUsuarioPorEmail,
  buscarUsuarioPorCodigo,
  buscarConfigSMTP,
  buscarConfigSMS,
  listarRestaurantesDoUsuario,
  listarTodosRestaurantes,
  termosForamAceitos,
  registrarAceiteTermos,
  buscarClientePorId
};
