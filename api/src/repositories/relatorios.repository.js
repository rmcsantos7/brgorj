/**
 * Repositório de Relatórios
 * Consultas ao banco de dados para geração de relatórios em PDF
 */

const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * Determina o status consolidado de uma remessa para o relatório.
 * Mesma lógica usada no frontend (Lista/Detalhe): boleto pago vence sobre
 * remessa cancelada — se o cliente pagou, a verdade é "Pago".
 */
const determinarStatusRemessa = (row) => {
  const bs = (row.boleto_status || '').toLowerCase();
  if (bs === 'paid' || bs === 'settled') return 'pago';
  if (row.rem_status === 'C') return 'cancelado';
  if (row.rem_status === 'E') return 'erro';
  if (bs === 'canceled' || bs === 'cancelled') return 'cancelado';
  if (bs === 'expired') return 'vencido';
  if (bs === 'waiting' || bs === 'active' || bs === 'pending') return 'pendente';
  return 'pendente';
};

const STATUS_LABEL = {
  pago: 'Pago',
  cancelado: 'Cancelada',
  erro: 'Erro no boleto',
  vencido: 'Vencido',
  pendente: 'Aguardando pagamento'
};

/**
 * Relatório 1: Recargas no período
 * Retorna apenas remessas pagas dentro de um intervalo de datas. Remessas
 * canceladas, com erro, pendentes ou vencidas são excluídas do relatório.
 */
const buscarRecargasPeriodo = async (clienteId, dataInicio, dataFim) => {
  // Info do cliente
  const clienteSql = `
    SELECT
      crd_cli_nome_fantasia AS nome,
      crd_cli_cnpj AS cnpj
    FROM crd_cliente
    WHERE crd_cli_id = $1
  `;

  // Remessas no período — agrega valor, vencimento, boleto_status e data de pagamento
  const remessasSql = `
    SELECT
      r.crd_usucrerem_id AS remessa_id,
      r.crd_usu_data_import AS data_recarga,
      r.crd_rem_status AS rem_status,
      COALESCE(SUM(c.crd_usu_valor), 0) AS valor_recarga,
      MAX(nf.crd_not_data_vencimento) AS data_vencimento,
      COALESCE(
        MAX(nf.crd_not_boleto_status) FILTER (WHERE nf.crd_not_situacao = 'A'),
        MAX(nf.crd_not_boleto_status)
      ) AS boleto_status,
      MAX(CASE WHEN LOWER(nf.crd_not_boleto_status) IN ('paid', 'settled')
               THEN nf.crd_not_boleto_status_atualizado_em END) AS data_pagamento
    FROM crd_usuario_credito_remessa r
    LEFT JOIN crd_usuario_credito c ON c.crd_usucrerem_id = r.crd_usucrerem_id
    LEFT JOIN crd_nota_fiscal nf ON nf.crd_not_id = c.crd_not_id
    WHERE r.crd_cli_id = $1
      AND r.crd_usu_data_import >= $2::date
      AND r.crd_usu_data_import < ($3::date + INTERVAL '1 day')
    GROUP BY r.crd_usucrerem_id, r.crd_usu_data_import, r.crd_rem_status
    ORDER BY r.crd_usucrerem_id ASC
  `;

  try {
    const [clienteRes, remessasRes] = await Promise.all([
      db.query(clienteSql, [clienteId]),
      db.query(remessasSql, [clienteId, dataInicio, dataFim])
    ]);

    const cliente = clienteRes.rows[0] || {};
    const remessas = remessasRes.rows
      .map(row => {
        const status = determinarStatusRemessa(row);
        return {
          remessa_id: row.remessa_id,
          data_recarga: row.data_recarga,
          data_vencimento: row.data_vencimento,
          data_pagamento: row.data_pagamento,
          valor_recarga: parseFloat(row.valor_recarga || 0),
          status,
          status_label: STATUS_LABEL[status]
        };
      })
      .filter(r => r.status === 'pago');

    const valorEfetuado = remessas.filter(r => r.status === 'pago').reduce((acc, r) => acc + r.valor_recarga, 0);
    const valorCancelado = remessas.filter(r => r.status === 'cancelado' || r.status === 'erro').reduce((acc, r) => acc + r.valor_recarga, 0);
    const valorPendente = remessas.filter(r => r.status === 'pendente' || r.status === 'vencido').reduce((acc, r) => acc + r.valor_recarga, 0);

    return {
      cliente,
      remessas,
      // valor_total = soma das efetuadas (canceladas não entram). Mantido para retrocompat.
      valor_total: valorEfetuado,
      valor_efetuado: valorEfetuado,
      valor_cancelado: valorCancelado,
      valor_pendente: valorPendente,
      total_recargas: remessas.length,
      total_efetuadas: remessas.filter(r => r.status === 'pago').length,
      total_canceladas: remessas.filter(r => r.status === 'cancelado' || r.status === 'erro').length,
      total_pendentes: remessas.filter(r => r.status === 'pendente' || r.status === 'vencido').length,
      periodo: { inicio: dataInicio, fim: dataFim }
    };
  } catch (error) {
    logger.error('Erro ao buscar recargas do período:', { error: error.message });
    throw error;
  }
};

/**
 * Relatório 2: Colaboradores cadastrados
 * Retorna todos os colaboradores com status, agrupados por ativo/inativo
 */
const buscarColaboradoresCadastrados = async (clienteId) => {
  const clienteSql = `
    SELECT
      crd_cli_nome_fantasia AS nome,
      crd_cli_cnpj AS cnpj
    FROM crd_cliente
    WHERE crd_cli_id = $1
  `;

  const colabSql = `
    SELECT
      u.crd_usr_nome AS nome,
      u.crd_usr_cpf AS cpf,
      u.crd_mot_celular AS telefone,
      COALESCE(u.crd_usr_nascimento, u.crd_usu_data_nascimento) AS data_nascimento,
      COALESCE(
        (SELECT STRING_AGG(s.crd_set_setor, ', ' ORDER BY s.crd_set_setor)
         FROM pgt_categoria_de_colaborador pc
         INNER JOIN crd_cliente_setor s ON s.crd_set_id = pc.crd_set_id
         WHERE pc.crd_usr_id = u.crd_usr_id),
        'Sem categoria'
      ) AS categoria,
      u.crd_usu_data_inclusao AS criado_em,
      u.crd_sit_id AS situacao_id,
      CASE WHEN u.crd_sit_id = 1 THEN 'Ativo' ELSE 'Inativo' END AS status
    FROM crd_usuario u
    WHERE u.crd_cli_id = $1
    ORDER BY u.crd_sit_id ASC, u.crd_usr_nome ASC
  `;

  try {
    const [clienteRes, colabRes] = await Promise.all([
      db.query(clienteSql, [clienteId]),
      db.query(colabSql, [clienteId])
    ]);

    const cliente = clienteRes.rows[0] || {};
    const todos = colabRes.rows;
    const ativos = todos.filter(c => c.situacao_id === 1);
    const inativos = todos.filter(c => c.situacao_id !== 1);

    return {
      cliente,
      ativos,
      inativos,
      total_ativos: ativos.length,
      total_inativos: inativos.length
    };
  } catch (error) {
    logger.error('Erro ao buscar colaboradores cadastrados:', { error: error.message });
    throw error;
  }
};

/**
 * Relatório 3: Histórico total por colaborador
 * Retorna créditos de um colaborador agrupados por mês. Apenas créditos
 * vindos de remessas pagas são considerados (mesma regra do relatório de
 * recargas): a remessa precisa ter pelo menos uma NF com boleto em
 * paid/settled — canceladas, pendentes e vencidas ficam de fora.
 */
const buscarHistoricoColaborador = async (clienteId, colaboradorId, dataInicio, dataFim) => {
  const clienteSql = `
    SELECT
      crd_cli_nome_fantasia AS nome,
      crd_cli_cnpj AS cnpj
    FROM crd_cliente
    WHERE crd_cli_id = $1
  `;

  const colabSql = `
    SELECT
      crd_usr_id AS id,
      crd_usr_nome AS nome,
      crd_usr_cpf AS cpf
    FROM crd_usuario
    WHERE crd_usr_id = $1 AND crd_cli_id = $2
  `;

  const creditosSql = `
    SELECT
      c.crd_usu_valor AS valor,
      c.crd_usu_data_credito AS data_credito,
      c.crd_usucrerem_id AS remessa_id
    FROM crd_usuario_credito c
    WHERE c.crd_usr_id = $1
      AND c.crd_cli_id = $2
      AND c.crd_usu_data_credito >= $3::date
      AND c.crd_usu_data_credito < ($4::date + INTERVAL '1 day')
      AND EXISTS (
        SELECT 1
        FROM crd_usuario_credito c2
        INNER JOIN crd_nota_fiscal nf ON nf.crd_not_id = c2.crd_not_id
        WHERE c2.crd_usucrerem_id = c.crd_usucrerem_id
          AND LOWER(nf.crd_not_boleto_status) IN ('paid', 'settled')
      )
    ORDER BY c.crd_usu_data_credito DESC
  `;

  try {
    const [clienteRes, colabRes, creditosRes] = await Promise.all([
      db.query(clienteSql, [clienteId]),
      db.query(colabSql, [colaboradorId, clienteId]),
      db.query(creditosSql, [colaboradorId, clienteId, dataInicio, dataFim])
    ]);

    const cliente = clienteRes.rows[0] || {};
    const colaborador = colabRes.rows[0] || {};
    const creditos = creditosRes.rows;

    // Agrupar por mês
    const meses = {};
    const nomesMeses = [
      'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];

    creditos.forEach(c => {
      const d = new Date(c.data_credito);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${nomesMeses[d.getMonth()]} de ${d.getFullYear()}`;
      if (!meses[key]) {
        meses[key] = { label, total: 0, creditos: [] };
      }
      meses[key].total += parseFloat(c.valor || 0);
      meses[key].creditos.push({
        valor: parseFloat(c.valor || 0),
        data: c.data_credito,
        remessa_id: c.remessa_id
      });
    });

    // Ordenar meses decrescente
    const mesesOrdenados = Object.entries(meses)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, val]) => val);

    const totalGeral = creditos.reduce((acc, c) => acc + parseFloat(c.valor || 0), 0);

    return {
      cliente,
      colaborador,
      meses: mesesOrdenados,
      total_geral: totalGeral,
      periodo: { inicio: dataInicio, fim: dataFim }
    };
  } catch (error) {
    logger.error('Erro ao buscar histórico do colaborador:', { error: error.message });
    throw error;
  }
};

/**
 * Lista colaboradores para seleção no relatório 3
 */
const listarColaboradoresParaRelatorio = async (clienteId, search = '') => {
  let sql = `
    SELECT
      u.crd_usr_id AS id,
      u.crd_usr_nome AS nome,
      u.crd_usr_cpf AS cpf
    FROM crd_usuario u
    WHERE u.crd_cli_id = $1
      AND u.crd_sit_id = 1
  `;
  const params = [clienteId];

  if (search.trim()) {
    const somenteDigitos = search.replace(/\D/g, '');
    if (somenteDigitos.length > 0) {
      // Busca por CPF ou nome
      sql += ` AND (u.crd_usr_nome ILIKE $2 OR REPLACE(REPLACE(u.crd_usr_cpf, '.', ''), '-', '') LIKE $3)`;
      params.push(`%${search}%`, `%${somenteDigitos}%`);
    } else {
      // Busca apenas por nome (sem dígitos, CPF LIKE '%%' matcharia tudo)
      sql += ` AND u.crd_usr_nome ILIKE $2`;
      params.push(`%${search}%`);
    }
  }

  sql += ` ORDER BY u.crd_usr_nome ASC LIMIT 50`;

  try {
    const result = await db.query(sql, params);
    return result.rows;
  } catch (error) {
    logger.error('Erro ao listar colaboradores para relatório:', { error: error.message });
    throw error;
  }
};

module.exports = {
  buscarRecargasPeriodo,
  buscarColaboradoresCadastrados,
  buscarHistoricoColaborador,
  listarColaboradoresParaRelatorio
};
