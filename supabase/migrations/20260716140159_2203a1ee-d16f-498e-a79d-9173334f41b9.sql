
-- Move the trigger to AFTER so companhias_aereas row exists before we
-- insert into movimentacoes_capital (which has FK to companhias_aereas).
DROP TRIGGER IF EXISTS trg_registar_carregamento_por_saldo_companhia ON public.companhias_aereas;

CREATE OR REPLACE FUNCTION public.registar_carregamento_por_saldo_companhia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_delta numeric;
  v_capital_id uuid;
  v_saldo_capital numeric;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Skip for credito (intermediary) companies — they don't consume circulante
  IF COALESCE(NEW.modo, 'saldo') = 'credito' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_delta := COALESCE(NEW.saldo, 0);
  ELSE
    v_delta := COALESCE(NEW.saldo, 0) - COALESCE(OLD.saldo, 0);
  END IF;

  IF v_delta <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT id, saldo_inicial INTO v_capital_id, v_saldo_capital
  FROM public.contas_financeiras
  WHERE COALESCE(sistema, false) = true AND ativa = true
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;

  IF v_capital_id IS NULL THEN
    RAISE EXCEPTION 'Conta Capital Circulante não encontrada';
  END IF;

  IF v_saldo_capital < v_delta THEN
    RAISE EXCEPTION 'Saldo insuficiente no Capital Circulante';
  END IF;

  INSERT INTO public.movimentacoes_capital
    (tipo, valor, conta_origem_id, companhia_id, responsavel_id, observacao, aplicar_saldo)
  VALUES
    ('carregamento_companhia', v_delta, v_capital_id, NEW.id, auth.uid(),
     CASE
       WHEN TG_OP = 'INSERT' THEN 'Carregamento inicial registado ao criar companhia'
       ELSE 'Carregamento registado ao aumentar saldo da companhia'
     END,
     false);

  -- Recursion is prevented by pg_trigger_depth guard above.
  UPDATE public.companhias_aereas
    SET ultimo_carregamento = now()
    WHERE id = NEW.id;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_registar_carregamento_por_saldo_companhia
AFTER INSERT OR UPDATE OF saldo ON public.companhias_aereas
FOR EACH ROW EXECUTE FUNCTION public.registar_carregamento_por_saldo_companhia();
