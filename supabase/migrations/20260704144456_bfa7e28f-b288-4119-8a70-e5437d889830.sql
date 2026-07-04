ALTER TABLE public.movimentacoes_capital
ADD COLUMN IF NOT EXISTS aplicar_saldo boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.aplicar_movimentacao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_custo NUMERIC;
  v_taxa NUMERIC;
  v_credito_conta NUMERIC;
  v_credito_lucro NUMERIC;
  v_fundo_id UUID;
  v_saldo_origem NUMERIC;
BEGIN
  IF NEW.valor IS NULL OR NEW.valor < 0 THEN
    RAISE EXCEPTION 'Valor inválido na movimentação';
  END IF;

  IF NEW.tipo = 'aporte_capital' THEN
    IF NEW.conta_destino_id IS NOT NULL THEN
      UPDATE public.contas_financeiras
        SET saldo_inicial = saldo_inicial + NEW.valor
        WHERE id = NEW.conta_destino_id;
    END IF;

  ELSIF NEW.tipo = 'carregamento_companhia' THEN
    IF NEW.conta_origem_id IS NOT NULL THEN
      SELECT saldo_inicial INTO v_saldo_origem
      FROM public.contas_financeiras
      WHERE id = NEW.conta_origem_id
      FOR UPDATE;

      IF v_saldo_origem IS NULL THEN
        RAISE EXCEPTION 'Conta de origem não encontrada';
      END IF;
      IF v_saldo_origem < NEW.valor THEN
        RAISE EXCEPTION 'Saldo insuficiente no Capital Circulante';
      END IF;

      UPDATE public.contas_financeiras
        SET saldo_inicial = saldo_inicial - NEW.valor
        WHERE id = NEW.conta_origem_id;
    END IF;

    IF COALESCE(NEW.aplicar_saldo, true) AND NEW.companhia_id IS NOT NULL THEN
      UPDATE public.companhias_aereas
        SET saldo = saldo + NEW.valor, ultimo_carregamento = now()
        WHERE id = NEW.companhia_id;
    END IF;

  ELSIF NEW.tipo = 'emissao_bilhete' THEN
    IF NEW.companhia_id IS NOT NULL THEN
      UPDATE public.companhias_aereas
        SET saldo = saldo - NEW.valor, ultimo_consumo = now()
        WHERE id = NEW.companhia_id;
    END IF;

  ELSIF NEW.tipo = 'pagamento_cliente' THEN
    v_credito_conta := NEW.valor;
    v_credito_lucro := 0;
    IF NEW.bilhete_id IS NOT NULL THEN
      SELECT custo, taxa_agencia INTO v_custo, v_taxa
      FROM public.bilhetes WHERE id = NEW.bilhete_id;
      IF v_custo IS NOT NULL AND v_taxa IS NOT NULL AND (v_custo + v_taxa) > 0 THEN
        IF ABS(NEW.valor - (v_custo + v_taxa)) < 0.01 THEN
          v_credito_conta := v_custo;
          v_credito_lucro := v_taxa;
        ELSE
          v_credito_conta := ROUND(NEW.valor * (v_custo / (v_custo + v_taxa)), 2);
          v_credito_lucro := NEW.valor - v_credito_conta;
        END IF;
      END IF;
    END IF;
    IF NEW.conta_destino_id IS NOT NULL AND v_credito_conta > 0 THEN
      UPDATE public.contas_financeiras
        SET saldo_inicial = saldo_inicial + v_credito_conta
        WHERE id = NEW.conta_destino_id;
    END IF;
    IF v_credito_lucro > 0 THEN
      SELECT id INTO v_fundo_id FROM public.fundo_lucro LIMIT 1;
      IF v_fundo_id IS NULL THEN
        INSERT INTO public.fundo_lucro (saldo) VALUES (v_credito_lucro) RETURNING id INTO v_fundo_id;
      ELSE
        UPDATE public.fundo_lucro SET saldo = saldo + v_credito_lucro, updated_at = now() WHERE id = v_fundo_id;
      END IF;
    END IF;
    IF NEW.bilhete_id IS NOT NULL THEN
      UPDATE public.bilhetes SET pago = true WHERE id = NEW.bilhete_id;
    END IF;

  ELSIF NEW.tipo = 'transferencia_lucro' THEN
    IF NEW.conta_origem_id IS NOT NULL THEN
      UPDATE public.contas_financeiras SET saldo_inicial = saldo_inicial - NEW.valor WHERE id = NEW.conta_origem_id;
    END IF;
    SELECT id INTO v_fundo_id FROM public.fundo_lucro LIMIT 1;
    IF v_fundo_id IS NULL THEN
      INSERT INTO public.fundo_lucro (saldo) VALUES (NEW.valor);
    ELSE
      UPDATE public.fundo_lucro SET saldo = saldo + NEW.valor, updated_at = now() WHERE id = v_fundo_id;
    END IF;

  ELSIF NEW.tipo = 'despesa_operacional' THEN
    IF NEW.conta_origem_id IS NOT NULL THEN
      UPDATE public.contas_financeiras SET saldo_inicial = saldo_inicial - NEW.valor WHERE id = NEW.conta_origem_id;
    END IF;

  ELSIF NEW.tipo = 'transferencia_interna' THEN
    IF NEW.conta_origem_id IS NOT NULL THEN
      UPDATE public.contas_financeiras SET saldo_inicial = saldo_inicial - NEW.valor WHERE id = NEW.conta_origem_id;
    END IF;
    IF NEW.conta_destino_id IS NOT NULL THEN
      UPDATE public.contas_financeiras SET saldo_inicial = saldo_inicial + NEW.valor WHERE id = NEW.conta_destino_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

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

  NEW.ultimo_carregamento := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_registar_carregamento_por_saldo_companhia ON public.companhias_aereas;
CREATE TRIGGER trg_registar_carregamento_por_saldo_companhia
AFTER INSERT OR UPDATE OF saldo ON public.companhias_aereas
FOR EACH ROW
EXECUTE FUNCTION public.registar_carregamento_por_saldo_companhia();