-- Trigger: ao reduzir crd_cliente.crd_cli_pix_limite, ajusta automaticamente
-- crd_usr_valor_escolhido_diurno/noturno dos usuários daquele cliente que
-- estiverem acima do novo limite. Não toca em registros NULL.
--
-- Idempotente: usa CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS.

CREATE OR REPLACE FUNCTION public.fn_ajustar_valores_escolhidos_pix()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Só age quando o limite foi REDUZIDO. Se aumentou, virou NULL ou ficou igual, ignora.
  IF NEW.crd_cli_pix_limite IS NOT NULL
     AND OLD.crd_cli_pix_limite IS NOT NULL
     AND NEW.crd_cli_pix_limite < OLD.crd_cli_pix_limite
  THEN
    UPDATE crd_usuario
    SET
      crd_usr_valor_escolhido_diurno = CASE
        WHEN crd_usr_valor_escolhido_diurno IS NOT NULL
         AND crd_usr_valor_escolhido_diurno > NEW.crd_cli_pix_limite
        THEN NEW.crd_cli_pix_limite
        ELSE crd_usr_valor_escolhido_diurno
      END,
      crd_usr_valor_escolhido_noturno = CASE
        WHEN crd_usr_valor_escolhido_noturno IS NOT NULL
         AND crd_usr_valor_escolhido_noturno > NEW.crd_cli_pix_limite
        THEN NEW.crd_cli_pix_limite
        ELSE crd_usr_valor_escolhido_noturno
      END
    WHERE crd_cli_id = NEW.crd_cli_id
      AND (
        (crd_usr_valor_escolhido_diurno IS NOT NULL AND crd_usr_valor_escolhido_diurno > NEW.crd_cli_pix_limite)
        OR
        (crd_usr_valor_escolhido_noturno IS NOT NULL AND crd_usr_valor_escolhido_noturno > NEW.crd_cli_pix_limite)
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ajustar_valores_escolhidos_pix ON public.crd_cliente;

CREATE TRIGGER trg_ajustar_valores_escolhidos_pix
AFTER UPDATE OF crd_cli_pix_limite ON public.crd_cliente
FOR EACH ROW
EXECUTE FUNCTION public.fn_ajustar_valores_escolhidos_pix();
