/**
 * Repositório de Créditos
 * Consultas ao banco de dados (pattern Repository)
 *
 * NOTA: Replica lógica dos MKFs "Insere Remessa de Importacao" e "Importar Creditos"
 * diretamente na API (sem usar functions do banco)
 */

const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * Cria uma remessa de importação e retorna o ID gerado automaticamente
 * Replica o MKF "Insere Remessa de Importacao":
 *   INSERT INTO crd_usuario_credito_remessa (crd_usu_data_import, crd_usu_login, crd_cli_id)
 * O crd_usucrerem_id é gerado automaticamente pela sequence DEFAULT do banco
 *
 * @param {object} client - Client de transação
 * @param {number} clienteId - ID do cliente
 * @param {string} login - Login do usuário que criou
 * @returns {Promise<number>} ID da remessa criada
 */
const criarRemessa = async (client, clienteId, login, titulo = null) => {
  const sql = `
    INSERT INTO crd_usuario_credito_remessa (
      crd_usu_data_import,
      crd_usu_login,
      crd_cli_id,
      crd_usucrerem_titulo
    ) VALUES (CURRENT_TIMESTAMP, $1, $2, $3)
    RETURNING crd_usucrerem_id
  `;

  try {
    const result = await client.query(sql, [login, clienteId, titulo]);
    const id = result.rows[0].crd_usucrerem_id;
    logger.info('Remessa criada:', { remessaId: id, clienteId });
    return id;
  } catch (error) {
    logger.error('Erro ao criar remessa:', { error: error.message });
    throw error;
  }
};

/**
 * Insere crédito para um colaborador
 * Replica exatamente o MKF "Importar Creditos":
 *   INSERT INTO crd_usuario_credito (
 *     crd_usr_id, crd_pro_id, crd_usu_valor, crd_usu_data_credito,
 *     crd_usucre_cpf, crd_cli_id, crd_usu_login, crd_usu_data_import,
 *     crd_usucrerem_id, crd_sit_id
 *   )
 *
 * @param {object} client - Client de transação
 * @param {number} usuarioId - ID do usuário (crd_usr_id)
 * @param {number} valor - Valor do crédito (crd_usu_valor) — valor direto, sem cálculo de taxa
 * @param {string} cpf - CPF do colaborador (crd_usucre_cpf)
 * @param {number} remessaId - ID da remessa (crd_usucrerem_id)
 * @param {number} clienteId - ID do cliente (crd_cli_id)
 * @param {string} login - Login do usuário que criou (crd_usu_login)
 * @param {string|null} dataDisponibilizacao - Data de disponibilização (YYYY-MM-DD), padrão CURRENT_DATE
 * @returns {Promise<number>} ID do crédito criado
 */
const inserirCredito = async (client, usuarioId, valor, cpf, remessaId, clienteId, login, dataDisponibilizacao = null) => {
  const dataCredito = dataDisponibilizacao || 'CURRENT_DATE';
  const usaParametro = !!dataDisponibilizacao;

  const sql = `
    INSERT INTO crd_usuario_credito (
      crd_usr_id,
      crd_pro_id,
      crd_usu_valor,
      crd_usu_data_credito,
      crd_usucre_cpf,
      crd_cli_id,
      crd_usu_login,
      crd_usu_data_import,
      crd_usucrerem_id,
      crd_sit_id
    ) VALUES ($1, 201, $2, ${usaParametro ? '$7' : 'CURRENT_DATE'}, $3, $4, $5, CURRENT_DATE, $6, 2)
    RETURNING crd_usucre_id
  `;

  const params = [usuarioId, valor, cpf, clienteId, login, remessaId];
  if (usaParametro) params.push(dataDisponibilizacao);

  try {
    const result = await client.query(sql, params);
    return result.rows[0].crd_usucre_id;
  } catch (error) {
    logger.error('Erro ao inserir crédito:', { error: error.message });
    throw error;
  }
};

/**
 * Busca histórico de gerações de crédito (remessas)
 *
 * @param {number} clienteId - ID do cliente
 * @param {number} limit - Limite de resultados
 * @param {number} offset - Offset para paginação
 * @param {string} dataInicio - Data início (opcional)
 * @param {string} dataFim - Data fim (opcional)
 * @returns {Promise<object>} Histórico e total
 */
const buscarHistorico = async (clienteId, limit = 50, offset = 0, dataInicio = null, dataFim = null) => {
  let sql = `
    SELECT
      r.crd_usucrerem_id AS remessa_id,
      r.crd_usu_data_import AS data_criacao,
      r.crd_usu_login AS criado_por,
      r.crd_rem_status AS status,
      cli.crd_cli_nome_fantasia AS restaurante,
      COALESCE(cli.crd_cli_manutencao_usuario, 0) AS taxa,
      COALESCE(NULLIF(cli.crd_cli_tipo_taxa, ''), 'D') AS tipo_taxa,
      r.crd_usucrerem_titulo AS titulo,
      COUNT(c.crd_usucre_id) AS total_colaboradores,
      COALESCE(SUM(c.crd_usu_valor), 0) AS valor_bruto,
      nf.crd_not_id AS nota_fiscal_id,
      nf.crd_not_boleto_status AS boleto_status,
      nf.crd_not_qr_code AS boleto_pix_qrcode,
      nf.crd_not_linha_digitavel_boleto AS boleto_linha_digitavel
    FROM crd_usuario_credito_remessa r
    LEFT JOIN crd_usuario_credito c ON c.crd_usucrerem_id = r.crd_usucrerem_id
    INNER JOIN crd_cliente cli ON cli.crd_cli_id = r.crd_cli_id
    LEFT JOIN crd_nota_fiscal nf
      ON nf.crd_not_id = c.crd_not_id
      AND nf.crd_not_situacao IS DISTINCT FROM 'C'
    WHERE r.crd_cli_id = $1
  `;

  const params = [clienteId];
  let paramCount = 2;

  if (dataInicio) {
    sql += ` AND r.crd_usu_data_import >= $${paramCount}::date`;
    params.push(dataInicio);
    paramCount++;
  }

  if (dataFim) {
    sql += ` AND r.crd_usu_data_import <= ($${paramCount}::date + INTERVAL '1 day')`;
    params.push(dataFim);
    paramCount++;
  }

  sql += `
    GROUP BY r.crd_usucrerem_id, r.crd_usu_data_import, r.crd_usu_login, r.crd_rem_status, cli.crd_cli_nome_fantasia, cli.crd_cli_manutencao_usuario, cli.crd_cli_tipo_taxa, r.crd_usucrerem_titulo, nf.crd_not_id, nf.crd_not_boleto_status, nf.crd_not_qr_code, nf.crd_not_linha_digitavel_boleto
    ORDER BY r.crd_usucrerem_id DESC
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;

  params.push(limit, offset);

  try {
    const result = await db.query(sql, params);

    // Conta total de remessas
    let countSql = `
      SELECT COUNT(*) AS total
      FROM crd_usuario_credito_remessa r
      WHERE r.crd_cli_id = $1
    `;

    const countParams = [clienteId];
    let countParamCount = 2;

    if (dataInicio) {
      countSql += ` AND r.crd_usu_data_import >= $${countParamCount}::date`;
      countParams.push(dataInicio);
      countParamCount++;
    }

    if (dataFim) {
      countSql += ` AND r.crd_usu_data_import <= ($${countParamCount}::date + INTERVAL '1 day')`;
      countParams.push(dataFim);
    }

    const countResult = await db.query(countSql, countParams);
    const total = parseInt(countResult.rows[0].total);

    return {
      historico: result.rows,
      total,
      limit,
      offset,
      page: Math.floor(offset / limit)
    };
  } catch (error) {
    logger.error('Erro ao buscar histórico:', { error: error.message });
    throw error;
  }
};

/**
 * Busca detalhes de uma remessa específica (créditos individuais)
 * @param {number} remessaId - ID da remessa
 * @param {number} clienteId - ID do cliente (segurança)
 * @returns {Promise<object>} Detalhes da remessa com colaboradores
 */
const buscarDetalheRemessa = async (remessaId, clienteId) => {
  const sql = `
    SELECT
      c.crd_usucre_id AS credito_id,
      u.crd_usr_id AS colaborador_id,
      u.crd_usr_nome AS nome,
      u.crd_usr_cpf AS cpf,
      c.crd_usu_valor AS valor_bruto,
      c.crd_usu_data_credito AS data_credito,
      COALESCE(cli.crd_cli_manutencao_usuario, 0) AS taxa,
      COALESCE(NULLIF(cli.crd_cli_tipo_taxa, ''), 'D') AS tipo_taxa,
      r.crd_usu_login AS criado_por,
      r.crd_usu_data_import AS data_criacao,
      r.crd_rem_status AS status,
      cli.crd_cli_nome_fantasia AS restaurante,
      r.crd_usucrerem_titulo AS titulo,
      nf.crd_not_id AS nota_fiscal_id,
      nf.crd_not_charge_id AS boleto_charge_id,
      nf.crd_not_codigo_barras AS boleto_codigo_barras,
      nf.crd_not_linha_digitavel_boleto AS boleto_linha_digitavel,
      nf.crd_not_qr_code AS boleto_pix_qrcode,
      nf.crd_not_pdf_url AS boleto_pdf_url,
      nf.crd_not_qr_code_url AS boleto_qrcode_image_url,
      nf.crd_not_boleto_status AS boleto_status
    FROM crd_usuario_credito c
    INNER JOIN crd_usuario u ON u.crd_usr_id = c.crd_usr_id
    INNER JOIN crd_cliente cli ON cli.crd_cli_id = c.crd_cli_id
    INNER JOIN crd_usuario_credito_remessa r ON r.crd_usucrerem_id = c.crd_usucrerem_id
    LEFT JOIN crd_nota_fiscal nf
      ON nf.crd_not_id = c.crd_not_id
      AND nf.crd_not_situacao IS DISTINCT FROM 'C'
    WHERE c.crd_usucrerem_id = $1
      AND c.crd_cli_id = $2
    ORDER BY u.crd_usr_nome ASC
  `;

  try {
    const result = await db.query(sql, [remessaId, clienteId]);
    return result.rows;
  } catch (error) {
    logger.error('Erro ao buscar detalhe da remessa:', { error: error.message });
    throw error;
  }
};

/**
 * Cria nota fiscal vinculada à remessa
 *
 * @param {object} client - Client de transação
 * @param {number} clienteId - ID do cliente
 * @param {number} valorNotaFiscal - Valor do boleto que o restaurante paga
 *   (taxa 'D': = bruto; taxa 'A': = bruto + serviço)
 * @param {number} valorServico - Valor da taxa (bruto * taxa / 100)
 * @param {number} valorMovimentacao - Valor distribuído aos colaboradores
 *   (taxa 'D': = bruto - serviço; taxa 'A': = bruto)
 * @returns {Promise<number>} ID da nota fiscal criada
 */
const criarNotaFiscal = async (client, clienteId, valorNotaFiscal, valorServico, valorMovimentacao) => {
  const sql = `
    INSERT INTO crd_nota_fiscal (
      crd_cli_id,
      crd_not_data_emissao,
      crd_not_data_vencimento,
      crd_not_valor_nota_fiscal,
      crd_not_valor_servico,
      crd_not_valor_movimentacao,
      crd_not_situacao
    ) VALUES (
      $1,
      CURRENT_DATE,
      CURRENT_DATE + INTERVAL '10 days',
      $2,
      $3,
      $4,
      'A'
    )
    RETURNING crd_not_id
  `;

  try {
    const result = await client.query(sql, [
      clienteId,
      valorNotaFiscal,
      valorServico,
      valorMovimentacao
    ]);
    const id = result.rows[0].crd_not_id;
    logger.info('Nota fiscal criada:', { notaId: id, clienteId, valorNotaFiscal, valorServico, valorMovimentacao });
    return id;
  } catch (error) {
    logger.error('Erro ao criar nota fiscal:', { error: error.message });
    throw error;
  }
};

/**
 * Associa todos os créditos de uma remessa à nota fiscal recém-criada.
 * Grava crd_not_id em cada crd_usuario_credito da remessa.
 *
 * @param {object} client - Client de transação
 * @param {number} remessaId - ID da remessa
 * @param {number} clienteId - ID do cliente (segurança)
 * @param {number} notaId - ID da nota fiscal
 * @returns {Promise<number>} Quantidade de créditos atualizados
 */
const associarCreditosANota = async (client, remessaId, clienteId, notaId) => {
  const sql = `
    UPDATE crd_usuario_credito
    SET crd_not_id = $1
    WHERE crd_usucrerem_id = $2 AND crd_cli_id = $3
  `;

  try {
    const result = await client.query(sql, [notaId, remessaId, clienteId]);
    logger.info('Créditos associados à nota:', { remessaId, clienteId, notaId, count: result.rowCount });
    return result.rowCount;
  } catch (error) {
    logger.error('Erro ao associar créditos à nota:', { error: error.message });
    throw error;
  }
};

/**
 * Atualiza nota fiscal com dados do boleto retornados pela API EFI
 *
 * @param {number} notaId - ID da nota fiscal
 * @param {object} boleto - Dados do boleto da API EFI
 * @returns {Promise<void>}
 */
const atualizarNotaComBoleto = async (notaId, boleto) => {
  const sql = `
    UPDATE crd_nota_fiscal SET
      crd_not_charge_id = $1,
      crd_not_codigo_barras = $2,
      crd_not_linha_digitavel_boleto = $3,
      crd_not_qr_code = $4,
      crd_not_pdf_url = $5,
      crd_not_qr_code_url = $6,
      crd_not_boleto_status = $7,
      crd_not_boleto_status_atualizado_em = NOW()
    WHERE crd_not_id = $8
  `;

  try {
    await db.query(sql, [
      boleto.charge_id,
      boleto.codigo_barras,
      boleto.linha_digitavel,
      boleto.pix?.qrcode || null,
      boleto.links?.pdf_url || null,
      boleto.links?.qrcode_image_url || null,
      boleto.status,
      notaId
    ]);
    logger.info('Nota fiscal atualizada com boleto:', { notaId, chargeId: boleto.charge_id });
  } catch (error) {
    logger.error('Erro ao atualizar nota com boleto:', { error: error.message });
    throw error;
  }
};

/**
 * Atualiza apenas o status do boleto de uma nota fiscal (sem mexer nos demais
 * campos). Usado pela sincronização com a EFI ao abrir o detalhe da remessa.
 */
const atualizarBoletoStatus = async (notaId, novoStatus) => {
  const sql = `
    UPDATE crd_nota_fiscal SET
      crd_not_boleto_status = $1,
      crd_not_boleto_status_atualizado_em = NOW()
    WHERE crd_not_id = $2
  `;
  try {
    await db.query(sql, [novoStatus, notaId]);
    logger.info('Status do boleto atualizado:', { notaId, novoStatus });
  } catch (error) {
    logger.error('Erro ao atualizar status do boleto:', { error: error.message });
    throw error;
  }
};

/**
 * Busca nota fiscal vinculada a uma remessa (pela data de crédito e cliente)
 * @param {number} remessaId - ID da remessa
 * @param {number} clienteId - ID do cliente
 * @returns {Promise<object|null>} Dados da nota fiscal ou null
 */
const buscarNotaFiscalPorRemessa = async (remessaId, clienteId) => {
  const sql = `
    SELECT DISTINCT nf.crd_not_id AS nota_fiscal_id,
           nf.crd_not_charge_id AS charge_id,
           nf.crd_not_boleto_status AS boleto_status
    FROM crd_nota_fiscal nf
    INNER JOIN crd_usuario_credito c ON c.crd_not_id = nf.crd_not_id
    WHERE c.crd_usucrerem_id = $1
      AND c.crd_cli_id = $2
      AND nf.crd_not_situacao IS DISTINCT FROM 'C'
    ORDER BY nf.crd_not_id DESC
    LIMIT 1
  `;

  try {
    const result = await db.query(sql, [remessaId, clienteId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Erro ao buscar nota fiscal por remessa:', { error: error.message });
    throw error;
  }
};

/**
 * Retorna o crd_cli_id dono de uma nota fiscal. Usado para autorização
 * dos endpoints de boleto (PDF/QR), que precisam validar tenant antes
 * de fazer proxy para o Hub-BaaS.
 *
 * @param {number} notaId
 * @returns {Promise<number|null>}
 */
const buscarClienteIdDaNota = async (notaId) => {
  const sql = `
    SELECT DISTINCT c.crd_cli_id
    FROM crd_usuario_credito c
    WHERE c.crd_not_id = $1
    LIMIT 1
  `;
  try {
    const result = await db.query(sql, [notaId]);
    return result.rows.length > 0 ? Number(result.rows[0].crd_cli_id) : null;
  } catch (error) {
    logger.error('Erro ao buscar cliente_id da nota:', { error: error.message });
    throw error;
  }
};

/**
 * Cancela todos os créditos de uma remessa (crd_sit_id = 3)
 */
const cancelarCreditosPorRemessa = async (client, remessaId, clienteId) => {
  const sql = `
    UPDATE crd_usuario_credito
    SET crd_sit_id = 3
    WHERE crd_usucrerem_id = $1 AND crd_cli_id = $2
  `;

  try {
    const result = await client.query(sql, [remessaId, clienteId]);
    logger.info('Créditos cancelados:', { remessaId, clienteId, count: result.rowCount });
    return result.rowCount;
  } catch (error) {
    logger.error('Erro ao cancelar créditos:', { error: error.message });
    throw error;
  }
};

/**
 * Atualiza status da remessa (usa client opcional para participar de transação)
 */
const atualizarStatusRemessa = async (remessaId, clienteId, status, client = null) => {
  const sql = `
    UPDATE crd_usuario_credito_remessa
    SET crd_rem_status = $1
    WHERE crd_usucrerem_id = $2 AND crd_cli_id = $3
  `;
  const executor = client || db;
  try {
    const result = await executor.query(sql, [status, remessaId, clienteId]);
    logger.info('Status da remessa atualizado:', { remessaId, clienteId, status });
    return result.rowCount;
  } catch (error) {
    logger.error('Erro ao atualizar status da remessa:', { error: error.message });
    throw error;
  }
};

/**
 * Cancela a remessa (crd_rem_status = 'C')
 */
const cancelarRemessaRepo = async (client, remessaId, clienteId) => {
  const sql = `
    UPDATE crd_usuario_credito_remessa
    SET crd_rem_status = 'C'
    WHERE crd_usucrerem_id = $1 AND crd_cli_id = $2
  `;

  try {
    const result = await client.query(sql, [remessaId, clienteId]);
    logger.info('Remessa cancelada:', { remessaId, clienteId });
    return result.rowCount;
  } catch (error) {
    logger.error('Erro ao cancelar remessa:', { error: error.message });
    throw error;
  }
};

/**
 * Cancela a nota fiscal (crd_not_situacao = 'C')
 */
const cancelarNotaFiscal = async (client, notaId, canceladoPor = null) => {
  const sql = `
    UPDATE crd_nota_fiscal
    SET crd_not_situacao = 'C',
        crd_not_data_cancelamento = CURRENT_DATE,
        crd_not_cancelado_por = $2
    WHERE crd_not_id = $1
  `;

  const quem = canceladoPor ? String(canceladoPor).slice(0, 20) : null;

  try {
    const result = await client.query(sql, [notaId, quem]);
    logger.info('Nota fiscal cancelada:', { notaId });
    return result.rowCount;
  } catch (error) {
    logger.error('Erro ao cancelar nota fiscal:', { error: error.message });
    throw error;
  }
};

/**
 * Lista remessas com nota fiscal ativa cuja data de vencimento já passou
 * e cujo boleto não foi pago/cancelado. Usado pelo job de cancelamento automático.
 *
 * @returns {Promise<Array<{remessa_id:number, cliente_id:number, nota_fiscal_id:number, data_vencimento:string, boleto_status:string|null}>>}
 */
const listarRemessasVencidasAbertas = async () => {
  const sql = `
    SELECT DISTINCT
      r.crd_usucrerem_id AS remessa_id,
      r.crd_cli_id       AS cliente_id,
      nf.crd_not_id      AS nota_fiscal_id,
      nf.crd_not_data_vencimento AS data_vencimento,
      nf.crd_not_boleto_status   AS boleto_status
    FROM crd_usuario_credito_remessa r
    INNER JOIN crd_usuario_credito c ON c.crd_usucrerem_id = r.crd_usucrerem_id
    INNER JOIN crd_nota_fiscal nf
      ON nf.crd_not_id = c.crd_not_id
      AND nf.crd_not_situacao = 'A'
    WHERE r.crd_rem_status IS DISTINCT FROM 'C'
      AND nf.crd_not_data_vencimento < CURRENT_DATE
      AND (nf.crd_not_boleto_status IS NULL
           OR LOWER(nf.crd_not_boleto_status) NOT IN ('paid', 'settled', 'canceled', 'cancelled'))
    ORDER BY r.crd_usucrerem_id ASC
  `;

  try {
    const result = await db.query(sql);
    return result.rows;
  } catch (error) {
    logger.error('Erro ao listar remessas vencidas abertas:', { error: error.message });
    throw error;
  }
};

module.exports = {
  criarRemessa,
  inserirCredito,
  criarNotaFiscal,
  associarCreditosANota,
  atualizarNotaComBoleto,
  atualizarBoletoStatus,
  buscarHistorico,
  buscarDetalheRemessa,
  buscarNotaFiscalPorRemessa,
  buscarClienteIdDaNota,
  cancelarCreditosPorRemessa,
  cancelarRemessaRepo,
  cancelarNotaFiscal,
  atualizarStatusRemessa,
  listarRemessasVencidasAbertas
};
