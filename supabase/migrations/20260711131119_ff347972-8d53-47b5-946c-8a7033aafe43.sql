
-- 1. Add 'pagamento_companhia' to mov_tipo enum
ALTER TYPE public.mov_tipo ADD VALUE IF NOT EXISTS 'pagamento_companhia';

-- 2. Add 'modo' column to companhias_aereas
ALTER TABLE public.companhias_aereas
  ADD COLUMN IF NOT EXISTS modo text NOT NULL DEFAULT 'saldo'
  CHECK (modo IN ('saldo','credito'));

-- 3. Update carregamento trigger to skip credito mode
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

  NEW.ultimo_carregamento := now();
  RETURN NEW;
END;
$function$;

-- 4. Update aplicar_movimentacao to handle pagamento_companhia
CREATE OR REPLACE FUNCTION public.aplicar_movimentacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_custo NUMERIC;
  v_taxa NUMERIC;
  v_total NUMERIC;
  v_credito_conta NUMERIC;
  v_credito_lucro NUMERIC;
  v_fundo_id UUID;
  v_saldo_origem NUMERIC;
  v_pago_ate_agora NUMERIC;
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

  ELSIF NEW.tipo = 'pagamento_companhia' THEN
    -- Payment to an intermediary company: reduces our debt (increases their saldo toward 0)
    IF NEW.companhia_id IS NOT NULL THEN
      UPDATE public.companhias_aereas
        SET saldo = saldo + NEW.valor, updated_at = now()
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
      SELECT custo, taxa_agencia, valor_cobrado INTO v_custo, v_taxa, v_total
      FROM public.bilhetes WHERE id = NEW.bilhete_id;
      IF v_custo IS NOT NULL AND v_taxa IS NOT NULL AND (v_custo + v_taxa) > 0 THEN
        v_credito_conta := ROUND(NEW.valor * (v_custo / (v_custo + v_taxa)), 2);
        v_credito_lucro := NEW.valor - v_credito_conta;
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

    IF NEW.bilhete_id IS NOT NULL AND v_total IS NOT NULL AND v_total > 0 THEN
      SELECT COALESCE(SUM(valor),0) INTO v_pago_ate_agora
        FROM public.movimentacoes_capital
        WHERE bilhete_id = NEW.bilhete_id AND tipo = 'pagamento_cliente';

      IF v_pago_ate_agora + 0.01 >= v_total THEN
        UPDATE public.bilhetes
          SET pago = true,
              status = CASE
                WHEN status IN ('pedido_criado','pendente','pago') THEN 'pago'::public.ticket_status
                ELSE status
              END
          WHERE id = NEW.bilhete_id;
      ELSE
        UPDATE public.bilhetes
          SET pago = false,
              status = CASE WHEN status = 'pago' THEN 'pendente'::public.ticket_status ELSE status END
          WHERE id = NEW.bilhete_id;
      END IF;
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

-- 5. Update verificar_consistencia_capital to exclude negative saldos (debts) of credito companies
CREATE OR REPLACE FUNCTION public.verificar_consistencia_capital()
 RETURNS TABLE(capital_contas numeric, capital_companhias numeric, capital_dividas numeric, capital_total numeric, capital_base numeric, fundo_lucro numeric, taxa_acumulada numeric, diferenca numeric, consistente boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contas NUMERIC;
  v_cias NUMERIC;
  v_div NUMERIC;
  v_fundo NUMERIC;
  v_taxa NUMERIC;
  v_base NUMERIC;
  v_total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(saldo_inicial),0) INTO v_contas FROM public.contas_financeiras WHERE ativa;
  -- Only count positive balances of 'saldo' mode companies as capital
  SELECT COALESCE(SUM(GREATEST(saldo, 0)),0) INTO v_cias
    FROM public.companhias_aereas WHERE ativa AND COALESCE(modo,'saldo') = 'saldo';

  SELECT COALESCE(SUM(GREATEST(0, COALESCE(b.valor_cobrado,0) - COALESCE(p.total_pago,0))),0)
    INTO v_div
  FROM public.bilhetes b
  LEFT JOIN (
    SELECT bilhete_id, SUM(valor) AS total_pago
    FROM public.movimentacoes_capital
    WHERE tipo = 'pagamento_cliente' AND bilhete_id IS NOT NULL
    GROUP BY bilhete_id
  ) p ON p.bilhete_id = b.id
  WHERE b.status <> 'cancelado';

  SELECT COALESCE(saldo,0) INTO v_fundo FROM public.fundo_lucro LIMIT 1;
  SELECT COALESCE(SUM(taxa_agencia),0) INTO v_taxa FROM public.bilhetes WHERE status <> 'cancelado';
  SELECT COALESCE(capital_base_operacional,0) INTO v_base FROM public.agency_settings LIMIT 1;
  v_total := v_contas + v_cias + v_div;

  RETURN QUERY SELECT
    v_contas, v_cias, v_div, v_total, COALESCE(v_base,0), v_fundo, v_taxa,
    v_total - COALESCE(v_base,0) AS diferenca,
    ABS(v_total - COALESCE(v_base,0)) < 1 AS consistente;
END;
$function$;
