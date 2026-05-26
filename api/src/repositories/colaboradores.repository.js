/**
 * Repositório de Colaboradores
 * Consultas ao banco de dados (pattern Repository)
 *
 * NOTA: Usa JOIN direto com crd_cliente_setor para categorias
 * (NÃO usa functions do banco)
 */

const db = require('../config/database');
const logger = require('../utils/logger');

// =============================================
// CONSULTAS PARA TELA DE CRÉDITOS (existentes)
// =============================================

/**
 * Busca colaboradores ativos com filtros (para tela de créditos)
 */
const buscarColaboradores = async (clienteId, search = '', setorId = null, limit = 50, offset = 0) => {
  const searchPattern = `%${search}%`;

  let sql = `
    SELECT
      u.crd_usr_id AS id,
      u.crd_usr_nome AS nome,
      u.crd_usr_cpf AS cpf,
      c.crd_cli_nome_fantasia AS restaurante,
      COALESCE(s.crd_set_setor, 'Sem categoria') AS categoria,
      COALESCE(s.crd_set_id, 0) AS setor_id,
      sit.crd_sit_situacao AS status,
      COALESCE(c.crd_cli_manutencao_usuario, 0) AS taxa_convenio
    FROM crd_usuario u
    INNER JOIN crd_cliente c ON c.crd_cli_id = u.crd_cli_id
    INNER JOIN crd_situacao sit ON sit.crd_sit_id = u.crd_sit_id
    LEFT JOIN crd_cliente_setor s ON s.crd_set_id = u.crd_set_id
    WHERE u.crd_sit_id = 1
      AND u.crd_cli_id = $1
      AND (
        u.crd_usr_nome ILIKE $2
        OR u.crd_usr_cpf LIKE $2
      )
  `;

  const params = [clienteId, searchPattern];
  let paramCount = 3;

  if (setorId) {
    sql += ` AND (
      EXISTS (
        SELECT 1 FROM pgt_categoria_de_colaborador pc
        WHERE pc.crd_usr_id = u.crd_usr_id AND pc.crd_set_id = $${paramCount}
      )
      OR u.crd_set_id = $${paramCount}
    )`;
    params.push(setorId);
    paramCount++;
  }

  sql += `
    ORDER BY u.crd_usr_nome ASC
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;
  params.push(limit, offset);

  try {
    const result = await db.query(sql, params);

    let countSql = `
      SELECT COUNT(*) AS total
      FROM crd_usuario u
      INNER JOIN crd_cliente c ON c.crd_cli_id = u.crd_cli_id
      LEFT JOIN crd_cliente_setor s ON s.crd_set_id = u.crd_set_id
      WHERE u.crd_sit_id = 1
        AND u.crd_cli_id = $1
        AND (
          u.crd_usr_nome ILIKE $2
          OR u.crd_usr_cpf LIKE $2
        )
    `;

    const countParams = [clienteId, searchPattern];

    if (setorId) {
      countSql += ` AND (
        EXISTS (
          SELECT 1 FROM pgt_categoria_de_colaborador pc
          WHERE pc.crd_usr_id = u.crd_usr_id AND pc.crd_set_id = $3
        )
        OR u.crd_set_id = $3
      )`;
      countParams.push(setorId);
    }

    const countResult = await db.query(countSql, countParams);
    const total = parseInt(countResult.rows[0].total);

    return {
      colaboradores: result.rows,
      total,
      limit,
      offset,
      page: Math.floor(offset / limit)
    };
  } catch (error) {
    logger.error('Erro ao buscar colaboradores:', { error: error.message });
    throw error;
  }
};

/**
 * Busca um colaborador específico pelo ID (para tela de créditos - só ativos)
 */
const buscarColaboradorPorId = async (userId, clienteId) => {
  const sql = `
    SELECT
      u.crd_usr_id AS id,
      u.crd_usr_nome AS nome,
      u.crd_usr_cpf AS cpf,
      c.crd_cli_nome_fantasia AS restaurante,
      COALESCE(s.crd_set_setor, 'Sem categoria') AS categoria,
      COALESCE(s.crd_set_id, 0) AS setor_id,
      sit.crd_sit_situacao AS status,
      COALESCE(c.crd_cli_manutencao_usuario, 0) AS taxa_convenio
    FROM crd_usuario u
    INNER JOIN crd_cliente c ON c.crd_cli_id = u.crd_cli_id
    INNER JOIN crd_situacao sit ON sit.crd_sit_id = u.crd_sit_id
    LEFT JOIN crd_cliente_setor s ON s.crd_set_id = u.crd_set_id
    WHERE u.crd_usr_id = $1
      AND u.crd_cli_id = $2
      AND u.crd_sit_id = 1
  `;

  try {
    const result = await db.query(sql, [userId, clienteId]);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Erro ao buscar colaborador por ID:', { error: error.message });
    throw error;
  }
};

/**
 * Busca múltiplos colaboradores pelos IDs (para geração de crédito)
 */
const buscarColaboradoresPorIds = async (userIds, clienteId) => {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return [];
  }

  const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
  const sql = `
    SELECT
      u.crd_usr_id AS id,
      u.crd_usr_nome AS nome,
      u.crd_usr_cpf AS cpf,
      u.crd_cli_id AS cliente_id,
      c.crd_cli_nome_fantasia AS restaurante,
      COALESCE(s.crd_set_setor, 'Sem categoria') AS categoria,
      COALESCE(s.crd_set_id, 0) AS setor_id,
      sit.crd_sit_situacao AS status,
      COALESCE(c.crd_cli_manutencao_usuario, 0) AS taxa_convenio
    FROM crd_usuario u
    INNER JOIN crd_cliente c ON c.crd_cli_id = u.crd_cli_id
    INNER JOIN crd_situacao sit ON sit.crd_sit_id = u.crd_sit_id
    LEFT JOIN crd_cliente_setor s ON s.crd_set_id = u.crd_set_id
    WHERE u.crd_usr_id IN (${placeholders})
      AND u.crd_cli_id = $${userIds.length + 1}
      AND u.crd_sit_id = 1
  `;

  try {
    const result = await db.query(sql, [...userIds, clienteId]);
    return result.rows;
  } catch (error) {
    logger.error('Erro ao buscar colaboradores por IDs:', { error: error.message });
    throw error;
  }
};

/**
 * Busca setores/categorias de um cliente
 */
const buscarSetores = async (clienteId) => {
  const sql = `
    SELECT
      cs.crd_set_id AS id,
      cs.crd_set_setor AS nome
    FROM crd_cliente_setor cs
    WHERE cs.crd_cli_id = $1
    ORDER BY cs.crd_set_setor ASC
  `;

  try {
    const result = await db.query(sql, [clienteId]);
    return result.rows;
  } catch (error) {
    logger.error('Erro ao buscar setores:', { error: error.message });
    throw error;
  }
};

/**
 * Busca colaboradores ativos por CPF (para importação de crédito via Excel)
 */
const buscarColaboradoresPorCpfs = async (cpfs, clienteId) => {
  if (!Array.isArray(cpfs) || cpfs.length === 0) {
    return [];
  }

  const placeholders = cpfs.map((_, i) => `$${i + 1}`).join(',');
  const sql = `
    SELECT
      u.crd_usr_id AS id,
      u.crd_usr_nome AS nome,
      u.crd_usr_cpf AS cpf,
      u.crd_cli_id AS cliente_id,
      COALESCE(s.crd_set_setor, 'Sem categoria') AS categoria,
      COALESCE(c.crd_cli_manutencao_usuario, 0) AS taxa_convenio
    FROM crd_usuario u
    INNER JOIN crd_cliente c ON c.crd_cli_id = u.crd_cli_id
    LEFT JOIN crd_cliente_setor s ON s.crd_set_id = u.crd_set_id
    WHERE REPLACE(REPLACE(u.crd_usr_cpf, '.', ''), '-', '') IN (${placeholders})
      AND u.crd_cli_id = $${cpfs.length + 1}
      AND u.crd_sit_id = 1
  `;

  try {
    const result = await db.query(sql, [...cpfs, clienteId]);
    return result.rows;
  } catch (error) {
    logger.error('Erro ao buscar colaboradores por CPFs:', { error: error.message });
    throw error;
  }
};

/**
 * Busca todos os colaboradores ativos para gerar planilha de importação
 */
const buscarColaboradoresParaPlanilha = async (clienteId) => {
  const sql = `
    SELECT
      u.crd_usr_nome AS nome,
      u.crd_usr_cpf AS cpf
    FROM crd_usuario u
    LEFT JOIN crd_agendamentos a ON u.crd_usr_id = a.crd_usr_id
    WHERE u.crd_cli_id = $1
      AND u.crd_sit_id = 1
      AND a.crd_age_id IS NULL
    GROUP BY u.crd_usr_nome, u.crd_usr_cpf
    ORDER BY u.crd_usr_nome
  `;

  try {
    const result = await db.query(sql, [clienteId]);
    return result.rows;
  } catch (error) {
    logger.error('Erro ao buscar colaboradores para planilha:', { error: error.message });
    throw error;
  }
};

/**
 * Busca a taxa do cliente e o tipo de aplicação dela.
 * - taxa: percentual (crd_cli_manutencao_usuario)
 * - tipo: 'D' = desconto (sai do colaborador, boleto = bruto)
 *         'A' = acréscimo (restaurante paga por cima, boleto = bruto + taxa)
 * Clientes sem tipo definido seguem o comportamento histórico ('D').
 */
const buscarTaxaCliente = async (clienteId) => {
  const sql = `
    SELECT COALESCE(crd_cli_manutencao_usuario, 0) AS taxa,
           COALESCE(NULLIF(crd_cli_tipo_taxa, ''), 'D') AS tipo
    FROM crd_cliente
    WHERE crd_cli_id = $1
  `;

  try {
    const result = await db.query(sql, [clienteId]);
    if (result.rows.length === 0) return { taxa: 0, tipo: 'D' };
    const tipo = result.rows[0].tipo === 'A' ? 'A' : 'D';
    return { taxa: parseFloat(result.rows[0].taxa) || 0, tipo };
  } catch (error) {
    logger.error('Erro ao buscar taxa do cliente:', { error: error.message });
    throw error;
  }
};

// =============================================
// CONSULTAS PARA TELA DE COLABORADORES (CRUD)
// =============================================

/**
 * Busca todos os colaboradores de um cliente (ATIVOS + BLOQUEADOS)
 * Para a tela de gestão de colaboradores
 */
const buscarTodosColaboradores = async (clienteId, search = '', limit = 100, offset = 0) => {
  const searchPattern = `%${search}%`;

  const sql = `
    SELECT
      u.crd_usr_id AS id,
      u.crd_usr_nome AS nome,
      u.crd_usr_cpf AS cpf,
      c.crd_cli_nome_fantasia AS restaurante,
      sit.crd_sit_situacao AS situacao,
      u.crd_sit_id AS situacao_id
    FROM crd_usuario u
    INNER JOIN crd_cliente c ON c.crd_cli_id = u.crd_cli_id
    INNER JOIN crd_situacao sit ON sit.crd_sit_id = u.crd_sit_id
    WHERE u.crd_cli_id = $1
      AND (
        u.crd_usr_nome ILIKE $2
        OR REPLACE(REPLACE(u.crd_usr_cpf, '.', ''), '-', '') LIKE $3
        OR u.crd_usr_cpf ILIKE $2
        OR sit.crd_sit_situacao ILIKE $2
        OR c.crd_cli_nome_fantasia ILIKE $2
      )
    ORDER BY u.crd_usr_nome ASC
    LIMIT $4 OFFSET $5
  `;

  const searchClean = `%${search.replace(/\D/g, '')}%`;

  try {
    const result = await db.query(sql, [clienteId, searchPattern, searchClean, limit, offset]);

    const countSql = `
      SELECT COUNT(*) AS total
      FROM crd_usuario u
      INNER JOIN crd_cliente c ON c.crd_cli_id = u.crd_cli_id
      INNER JOIN crd_situacao sit ON sit.crd_sit_id = u.crd_sit_id
      WHERE u.crd_cli_id = $1
        AND (
          u.crd_usr_nome ILIKE $2
          OR REPLACE(REPLACE(u.crd_usr_cpf, '.', ''), '-', '') LIKE $3
          OR u.crd_usr_cpf ILIKE $2
          OR sit.crd_sit_situacao ILIKE $2
          OR c.crd_cli_nome_fantasia ILIKE $2
        )
    `;

    const countResult = await db.query(countSql, [clienteId, searchPattern, searchClean]);
    const total = parseInt(countResult.rows[0].total);

    return { colaboradores: result.rows, total };
  } catch (error) {
    logger.error('Erro ao buscar todos colaboradores:', { error: error.message });
    throw error;
  }
};

/**
 * Busca dados completos de um colaborador (para formulário de edição)
 */
const buscarColaboradorCompleto = async (userId, clienteId) => {
  const sql = `
    SELECT
      u.crd_usr_id AS id,
      u.crd_usr_nome AS nome,
      u.crd_usr_cpf AS cpf,
      u.crd_usu_email AS email,
      u.crd_mot_celular AS celular,
      u.crd_usr_nascimento AS nascimento,
      u.crd_usr_sexo AS sexo,
      u.crd_sit_id AS situacao_id,
      u.crd_cli_id AS cliente_id,
      u.crd_set_id AS setor_id,
      u.crd_usu_data_inclusao AS data_cadastro,
      c.crd_cli_nome_fantasia AS restaurante,
      COALESCE(s.crd_set_setor, '') AS categoria,
      sit.crd_sit_situacao AS situacao
    FROM crd_usuario u
    INNER JOIN crd_cliente c ON c.crd_cli_id = u.crd_cli_id
    INNER JOIN crd_situacao sit ON sit.crd_sit_id = u.crd_sit_id
    LEFT JOIN crd_cliente_setor s ON s.crd_set_id = u.crd_set_id
    WHERE u.crd_usr_id = $1
      AND u.crd_cli_id = $2
  `;

  try {
    const result = await db.query(sql, [userId, clienteId]);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Erro ao buscar colaborador completo:', { error: error.message });
    throw error;
  }
};

/**
 * Obtém próximo ID para crd_usuario
 */
const obterProximoId = async () => {
  const sql = `SELECT COALESCE(MAX(crd_usr_id), 0) + 1 AS proximo_id FROM crd_usuario`;
  try {
    const result = await db.query(sql);
    return parseInt(result.rows[0].proximo_id);
  } catch (error) {
    logger.error('Erro ao obter próximo ID:', { error: error.message });
    throw error;
  }
};

/**
 * Cria um novo colaborador
 */
const criarColaborador = async (dados) => {
  const id = await obterProximoId();
  const sql = `
    INSERT INTO crd_usuario (
      crd_usr_id,
      crd_usr_nome,
      crd_usr_cpf,
      crd_usu_email,
      crd_mot_celular,
      crd_usr_nascimento,
      crd_usr_sexo,
      crd_sit_id,
      crd_cli_id,
      crd_usu_data_inclusao,
      crd_usr_arranjo_fechado,
      crd_usr_arranjo_aberto
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, true, false)
    RETURNING crd_usr_id AS id
  `;

  const params = [
    id,
    dados.nome,
    dados.cpf,
    dados.email || null,
    dados.celular ? dados.celular.replace(/\D/g, '') : null,
    dados.nascimento || null,
    dados.sexo || null,
    dados.situacao_id || 1,
    dados.cliente_id
  ];

  try {
    const result = await db.query(sql, params);
    return result.rows[0];
  } catch (error) {
    logger.error('Erro ao criar colaborador:', { error: error.message });
    throw error;
  }
};

/**
 * Atualiza um colaborador existente
 */
const atualizarColaborador = async (userId, clienteId, dados) => {
  const sql = `
    UPDATE crd_usuario SET
      crd_usr_nome = $3,
      crd_usr_cpf = $4,
      crd_usu_email = $5,
      crd_mot_celular = $6,
      crd_usr_nascimento = $7,
      crd_usr_sexo = $8,
      crd_cli_id = $9
    WHERE crd_usr_id = $1
      AND crd_cli_id = $2
    RETURNING crd_usr_id AS id
  `;

  const params = [
    userId,
    clienteId,
    dados.nome,
    dados.cpf,
    dados.email || null,
    dados.celular ? dados.celular.replace(/\D/g, '') : null,
    dados.nascimento || null,
    dados.sexo || null,
    dados.novo_cliente_id || clienteId
  ];

  try {
    const result = await db.query(sql, params);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Erro ao atualizar colaborador:', { error: error.message });
    throw error;
  }
};

/**
 * Altera situação de um colaborador (Ativar/Bloquear)
 */
const alterarSituacao = async (userId, clienteId, novaSituacaoId) => {
  const sql = `
    UPDATE crd_usuario
    SET crd_sit_id = $3
    WHERE crd_usr_id = $1
      AND crd_cli_id = $2
    RETURNING crd_usr_id AS id, crd_sit_id AS situacao_id
  `;

  try {
    const result = await db.query(sql, [userId, clienteId, novaSituacaoId]);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Erro ao alterar situação:', { error: error.message });
    throw error;
  }
};

/**
 * Busca restaurantes (clientes) filtrados pelo cliente_id
 */
const buscarRestaurantes = async (clienteId) => {
  const sql = `
    SELECT
      crd_cli_id AS id,
      crd_cli_nome_fantasia AS nome
    FROM crd_cliente
    WHERE crd_cli_id = $1
    ORDER BY crd_cli_nome_fantasia ASC
  `;

  try {
    const result = await db.query(sql, [clienteId]);
    return result.rows;
  } catch (error) {
    logger.error('Erro ao buscar restaurantes:', { error: error.message });
    throw error;
  }
};

/**
 * Busca situações disponíveis
 */
const buscarSituacoes = async () => {
  const sql = `
    SELECT
      crd_sit_id AS id,
      crd_sit_situacao AS nome
    FROM crd_situacao
    ORDER BY crd_sit_id ASC
  `;

  try {
    const result = await db.query(sql);
    return result.rows;
  } catch (error) {
    logger.error('Erro ao buscar situações:', { error: error.message });
    throw error;
  }
};

/**
 * Importação em lote de colaboradores via Excel
 * Usa transação para garantir atomicidade
 */
const importarColaboradoresEmLote = async (colaboradores, clienteId) => {
  const client = await db.getClient();
  const resultados = [];

  try {
    await client.query('BEGIN');

    for (const colab of colaboradores) {
      // Verifica se CPF já existe para este cliente
      const existeResult = await client.query(
        `SELECT crd_usr_id AS id FROM crd_usuario
         WHERE REPLACE(REPLACE(crd_usr_cpf, '.', ''), '-', '') = $1
         AND crd_cli_id = $2`,
        [colab.cpf.replace(/\D/g, ''), clienteId]
      );

      if (existeResult.rows.length > 0) {
        resultados.push({
          nome: colab.nome,
          cpf: colab.cpf,
          status: 'existente',
          id: existeResult.rows[0].id
        });
        continue;
      }

      // Obtém próximo ID
      const maxResult = await client.query('SELECT COALESCE(MAX(crd_usr_id), 0) + 1 AS id FROM crd_usuario');
      const novoId = parseInt(maxResult.rows[0].id);

      await client.query(
        `INSERT INTO crd_usuario (
          crd_usr_id, crd_usr_nome, crd_usr_cpf, crd_usu_email,
          crd_mot_celular, crd_usr_nascimento, crd_usr_sexo,
          crd_sit_id, crd_cli_id, crd_usu_data_inclusao,
          crd_usr_arranjo_fechado, crd_usr_arranjo_aberto
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, CURRENT_TIMESTAMP, true, false)`,
        [
          novoId,
          colab.nome,
          colab.cpf,
          colab.email || null,
          colab.celular ? colab.celular.replace(/\D/g, '') : null,
          colab.nascimento || null,
          colab.sexo || null,
          clienteId
        ]
      );

      resultados.push({
        nome: colab.nome,
        cpf: colab.cpf,
        status: 'criado',
        id: novoId
      });
    }

    await client.query('COMMIT');
    return resultados;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Erro na importação em lote:', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

// =============================================
// CATEGORIAS (junction table pgt_categoria_de_colaborador)
// =============================================

/**
 * Busca categorias vinculadas a um usuário
 */
const buscarCategoriasDoUsuario = async (userId) => {
  const sql = `
    SELECT
      s.crd_set_id AS id,
      s.crd_set_setor AS nome
    FROM pgt_categoria_de_colaborador pc
    INNER JOIN crd_cliente_setor s ON s.crd_set_id = pc.crd_set_id
    WHERE pc.crd_usr_id = $1
    ORDER BY s.crd_set_setor ASC
  `;
  try {
    const result = await db.query(sql, [userId]);
    return result.rows;
  } catch (error) {
    logger.error('Erro ao buscar categorias do usuário:', { error: error.message });
    throw error;
  }
};

/**
 * Vincula categorias a um usuário (insere múltiplas)
 */
const vincularCategorias = async (userId, categoriaIds) => {
  if (!Array.isArray(categoriaIds) || categoriaIds.length === 0) return;

  const values = categoriaIds.map((catId, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
  const params = [];
  categoriaIds.forEach(catId => {
    params.push(catId, userId);
  });

  const sql = `
    INSERT INTO pgt_categoria_de_colaborador (crd_set_id, crd_usr_id)
    VALUES ${values}
    ON CONFLICT DO NOTHING
  `;

  try {
    await db.query(sql, params);
  } catch (error) {
    logger.error('Erro ao vincular categorias:', { error: error.message });
    throw error;
  }
};

/**
 * Remove todas as categorias de um usuário
 */
const desvincularTodasCategorias = async (userId) => {
  const sql = `DELETE FROM pgt_categoria_de_colaborador WHERE crd_usr_id = $1`;
  try {
    await db.query(sql, [userId]);
  } catch (error) {
    logger.error('Erro ao desvincular categorias:', { error: error.message });
    throw error;
  }
};

/**
 * Cria uma nova categoria (setor) para o cliente
 */
const criarCategoria = async (clienteId, nomeCategoria) => {
  // Obtém próximo ID
  const maxResult = await db.query('SELECT COALESCE(MAX(crd_set_id), 0) + 1 AS id FROM crd_cliente_setor');
  const novoId = parseInt(maxResult.rows[0].id);

  const sql = `
    INSERT INTO crd_cliente_setor (crd_set_id, crd_set_setor, crd_cli_id)
    VALUES ($1, $2, $3)
    RETURNING crd_set_id AS id, crd_set_setor AS nome
  `;

  try {
    const result = await db.query(sql, [novoId, nomeCategoria.toUpperCase(), clienteId]);
    return result.rows[0];
  } catch (error) {
    logger.error('Erro ao criar categoria:', { error: error.message });
    throw error;
  }
};

/**
 * Conta quantos usuários estão vinculados a uma categoria
 */
const contarVinculosCategoria = async (categoriaId) => {
  const sql = `SELECT COUNT(*) AS total FROM pgt_categoria_de_colaborador WHERE crd_set_id = $1`;
  try {
    const result = await db.query(sql, [categoriaId]);
    return parseInt(result.rows[0].total);
  } catch (error) {
    logger.error('Erro ao contar vínculos da categoria:', { error: error.message });
    throw error;
  }
};

/**
 * Deleta uma categoria e remove todos os vínculos na junction table
 */
const deletarCategoria = async (categoriaId, clienteId) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Remove vínculos na junction table
    await client.query(
      'DELETE FROM pgt_categoria_de_colaborador WHERE crd_set_id = $1',
      [categoriaId]
    );

    // Remove a categoria
    const result = await client.query(
      'DELETE FROM crd_cliente_setor WHERE crd_set_id = $1 AND crd_cli_id = $2 RETURNING crd_set_id AS id, crd_set_setor AS nome',
      [categoriaId, clienteId]
    );

    await client.query('COMMIT');
    return result.rows[0] || null;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Erro ao deletar categoria:', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  // Créditos (existentes)
  buscarColaboradores,
  buscarColaboradorPorId,
  buscarColaboradoresPorIds,
  buscarColaboradoresPorCpfs,
  buscarSetores,
  buscarColaboradoresParaPlanilha,
  buscarTaxaCliente,
  // CRUD Colaboradores (novos)
  buscarTodosColaboradores,
  buscarColaboradorCompleto,
  criarColaborador,
  atualizarColaborador,
  alterarSituacao,
  buscarRestaurantes,
  buscarSituacoes,
  importarColaboradoresEmLote,
  // Categorias (junction table)
  buscarCategoriasDoUsuario,
  vincularCategorias,
  desvincularTodasCategorias,
  criarCategoria,
  deletarCategoria,
  contarVinculosCategoria
};
