-- =====================================================================
-- Trigger: baixa automatica quando boleto passa a "paid"
-- Tabela: public.crd_nota_fiscal
-- Campo monitorado: crd_not_boleto_status
--
-- Quando crd_not_boleto_status muda para 'paid':
--   1. Atualiza a nota:
--        crd_not_situacao       = 'BT'
--        crd_not_valor_pago     = crd_not_valor_nota_fiscal (valor cobrado)
--        crd_not_data_liquidacao= CURRENT_DATE
--   2. Insere movimentacao bancaria (operacao 'P', usuario 'Webhook')
--   3. Atualiza creditos da nota em crd_usuario_credito para crd_sit_id = 1
--   4. Reabre remessas que estavam canceladas (crd_rem_status = 'C' -> NULL)
--      caso o pagamento tenha chegado depois de um cancelamento indevido
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_nota_fiscal_baixa_boleto_pago()
    RETURNS trigger
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE NOT LEAKPROOF
AS $BODY$
BEGIN
    -- Dispara apenas quando o status do boleto transita para 'paid'
    IF NEW.crd_not_boleto_status IS DISTINCT FROM OLD.crd_not_boleto_status
       AND LOWER(COALESCE(NEW.crd_not_boleto_status, '')) = 'paid' THEN

        -- 1) Atualiza a propria nota (BEFORE UPDATE: altera NEW in-place)
        NEW.crd_not_situacao        := 'BT';
        NEW.crd_not_valor_pago      := COALESCE(NEW.crd_not_valor_pago,
                                                NEW.crd_not_valor_nota_fiscal);
        NEW.crd_not_data_liquidacao := COALESCE(NEW.crd_not_data_liquidacao,
                                                CURRENT_DATE);

        -- 2) Insere a movimentacao bancaria correspondente ao recebimento
        INSERT INTO public.crd_movimentacao_bancaria (
            crd_mov_documento, crd_mov_valor, crd_mov_data,
            crd_not_id, crd_mov_operacao, crd_ctb_id,
            crd_con_usuario, crd_mov_info
        ) VALUES (
            NEW.crd_not_id,
            NEW.crd_not_valor_pago,
            NEW.crd_not_data_liquidacao,
            NEW.crd_not_id,
            'P',
            NEW.crd_ctb_id,
            'Webhook',
            'Baixa automatica boleto paid - nota ' || NEW.crd_not_id
        );

        -- 3) Libera os creditos vinculados a essa nota
        UPDATE public.crd_usuario_credito
           SET crd_sit_id = 1
         WHERE crd_not_id = NEW.crd_not_id
           AND crd_sit_id <> 1;

        -- 4) Reabre remessas canceladas vinculadas aos creditos desta nota.
        --    Cobre o caso em que a remessa foi cancelada por engano antes do
        --    pagamento ser confirmado pelo gateway.
        UPDATE public.crd_usuario_credito_remessa r
           SET crd_rem_status = NULL
         WHERE r.crd_rem_status = 'C'
           AND r.crd_usucrerem_id IN (
               SELECT DISTINCT c.crd_usucrerem_id
                 FROM public.crd_usuario_credito c
                WHERE c.crd_not_id = NEW.crd_not_id
                  AND c.crd_usucrerem_id IS NOT NULL
           );

    END IF;

    RETURN NEW;
END;
$BODY$;

ALTER FUNCTION public.fn_nota_fiscal_baixa_boleto_pago()
    OWNER TO justadmin;

GRANT EXECUTE ON FUNCTION public.fn_nota_fiscal_baixa_boleto_pago() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_nota_fiscal_baixa_boleto_pago() TO "just.sentinel";
GRANT EXECUTE ON FUNCTION public.fn_nota_fiscal_baixa_boleto_pago() TO justadmin;
GRANT EXECUTE ON FUNCTION public.fn_nota_fiscal_baixa_boleto_pago() TO "justpay.siembra.api";
GRANT EXECUTE ON FUNCTION public.fn_nota_fiscal_baixa_boleto_pago() TO "justpay.siembra.api2";
GRANT EXECUTE ON FUNCTION public.fn_nota_fiscal_baixa_boleto_pago() TO "justpay.siembra.cadbrgorj";

-- Remove a trigger antiga (idempotente) e recria apontando para a coluna correta
DROP TRIGGER IF EXISTS trg_nota_fiscal_baixa_boleto_pago ON public.crd_nota_fiscal;

CREATE TRIGGER trg_nota_fiscal_baixa_boleto_pago
    BEFORE UPDATE OF crd_not_boleto_status
    ON public.crd_nota_fiscal
    FOR EACH ROW
    WHEN (LOWER(COALESCE(NEW.crd_not_boleto_status, '')) = 'paid'
          AND NEW.crd_not_boleto_status IS DISTINCT FROM OLD.crd_not_boleto_status)
    EXECUTE FUNCTION public.fn_nota_fiscal_baixa_boleto_pago();
