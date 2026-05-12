-- =============================================================================
-- Backfill crd_usuario_credito.crd_not_id em recargas antigas
-- =============================================================================
-- Liga cada crédito (crd_usuario_credito) à sua nota fiscal (crd_nota_fiscal)
-- quando crd_not_id ainda está NULL.
--
-- Estratégia:
--   - Casa por (crd_cli_id, data) onde:
--       data do crédito = crd_usu_data_import::date (dia em que a remessa rodou;
--       esse campo ERA preenchido com CURRENT_DATE, mesmo dia em que a nota
--       foi criada, então bate 1-a-1).
--   - Quando há >1 remessa e >1 nota no mesmo (cliente, dia), pareia em ordem
--     crescente de crd_usucrerem_id ↔ crd_not_id (ambas sequências monotônicas
--     criadas na mesma transação).
--
-- RECOMENDADO: rodar dentro de transação e revisar o SELECT antes do UPDATE.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Preview: quantos créditos seriam atualizados e quais pares (remessa, nota)
-- ---------------------------------------------------------------------------
WITH remessas_ord AS (
    SELECT
        r.crd_usucrerem_id                                  AS remessa_id,
        r.crd_cli_id,
        r.crd_usu_data_import::date                         AS data,
        ROW_NUMBER() OVER (
            PARTITION BY r.crd_cli_id, r.crd_usu_data_import::date
            ORDER BY r.crd_usucrerem_id
        )                                                    AS rn
    FROM crd_usuario_credito_remessa r
    WHERE EXISTS (
        SELECT 1 FROM crd_usuario_credito c
        WHERE c.crd_usucrerem_id = r.crd_usucrerem_id
          AND c.crd_not_id IS NULL
    )
),
notas_ord AS (
    SELECT
        nf.crd_not_id,
        nf.crd_cli_id,
        nf.crd_not_data_emissao                              AS data,
        ROW_NUMBER() OVER (
            PARTITION BY nf.crd_cli_id, nf.crd_not_data_emissao
            ORDER BY nf.crd_not_id
        )                                                    AS rn
    FROM crd_nota_fiscal nf
    WHERE nf.crd_not_situacao = 'A'
),
pares AS (
    SELECT r.remessa_id, r.crd_cli_id, r.data, n.crd_not_id
    FROM remessas_ord r
    INNER JOIN notas_ord n
        ON n.crd_cli_id = r.crd_cli_id
       AND n.data       = r.data
       AND n.rn         = r.rn
)
SELECT
    COUNT(*)                            AS total_pares,
    SUM((SELECT COUNT(*) FROM crd_usuario_credito c
         WHERE c.crd_usucrerem_id = p.remessa_id
           AND c.crd_not_id IS NULL))  AS creditos_a_atualizar
FROM pares p;

-- ---------------------------------------------------------------------------
-- 2) UPDATE propriamente dito
-- ---------------------------------------------------------------------------
WITH remessas_ord AS (
    SELECT
        r.crd_usucrerem_id                                  AS remessa_id,
        r.crd_cli_id,
        r.crd_usu_data_import::date                         AS data,
        ROW_NUMBER() OVER (
            PARTITION BY r.crd_cli_id, r.crd_usu_data_import::date
            ORDER BY r.crd_usucrerem_id
        )                                                    AS rn
    FROM crd_usuario_credito_remessa r
    WHERE EXISTS (
        SELECT 1 FROM crd_usuario_credito c
        WHERE c.crd_usucrerem_id = r.crd_usucrerem_id
          AND c.crd_not_id IS NULL
    )
),
notas_ord AS (
    SELECT
        nf.crd_not_id,
        nf.crd_cli_id,
        nf.crd_not_data_emissao                              AS data,
        ROW_NUMBER() OVER (
            PARTITION BY nf.crd_cli_id, nf.crd_not_data_emissao
            ORDER BY nf.crd_not_id
        )                                                    AS rn
    FROM crd_nota_fiscal nf
    WHERE nf.crd_not_situacao = 'A'
),
pares AS (
    SELECT r.remessa_id, n.crd_not_id
    FROM remessas_ord r
    INNER JOIN notas_ord n
        ON n.crd_cli_id = r.crd_cli_id
       AND n.data       = r.data
       AND n.rn         = r.rn
)
UPDATE crd_usuario_credito c
SET crd_not_id = p.crd_not_id
FROM pares p
WHERE c.crd_usucrerem_id = p.remessa_id
  AND c.crd_not_id IS NULL;

-- ---------------------------------------------------------------------------
-- 3) Verificação pós-UPDATE: créditos que seguem sem nota
--    (remessas sem nota correspondente na mesma data/cliente)
-- ---------------------------------------------------------------------------
SELECT
    c.crd_cli_id,
    c.crd_usucrerem_id,
    c.crd_usu_data_import::date         AS data,
    COUNT(*)                            AS creditos_sem_nota
FROM crd_usuario_credito c
WHERE c.crd_not_id IS NULL
  AND c.crd_usucrerem_id IS NOT NULL
GROUP BY c.crd_cli_id, c.crd_usucrerem_id, c.crd_usu_data_import::date
ORDER BY c.crd_cli_id, c.crd_usucrerem_id;

-- Se estiver tudo certo:
-- COMMIT;
-- Se quiser desfazer:
-- ROLLBACK;
