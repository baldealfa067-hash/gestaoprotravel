CREATE OR REPLACE FUNCTION public.bilhete_debita_companhia()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_fundo_id uuid;
BEGIN
  v_user := auth.uid();

  IF NEW.status = 'emitido'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'emitido')
     AND NEW.companhia_id IS NOT NULL
     AND COALESCE(NEW.custo, 0) > 0 THEN
    INSERT INTO public.movimentacoes_capital
      (tipo, valor, companhia_id, bilhete_id, responsavel_id, observacao, agency_id)
    VALUES
      ('emissao_bilhete', NEW.custo, NEW.companhia_id, NEW.id, v_user,
       'Emissão automática de bilhete '||COALESCE(NEW.pnr,'')||' — desconto do saldo da companhia', NEW.agency_id);
  END IF;

  -- Lucro (taxa da agência) reconhecido imediatamente na emissão
  IF NEW.status = 'emitido'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'emitido')
     AND COALESCE(NEW.taxa_agencia, 0) > 0 THEN
    SELECT id INTO v_fundo_id FROM public.fundo_lucro WHERE agency_id = NEW.agency_id LIMIT 1;
    IF v_fundo_id IS NULL THEN
      INSERT INTO public.fundo_lucro (saldo, agency_id) VALUES (NEW.taxa_agencia, NEW.agency_id);
    ELSE
      UPDATE public.fundo_lucro SET saldo = saldo + NEW.taxa_agencia, updated_at = now() WHERE id = v_fundo_id;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status = 'emitido'
     AND NEW.status = 'cancelado' THEN
    IF NEW.companhia_id IS NOT NULL AND COALESCE(NEW.custo, 0) > 0 THEN
      INSERT INTO public.movimentacoes_capital
        (tipo, valor, companhia_id, conta_origem_id, bilhete_id, responsavel_id, observacao, agency_id)
      VALUES
        ('carregamento_companhia', NEW.custo, NEW.companhia_id, NULL, NEW.id, v_user,
         'Estorno de bilhete cancelado '||COALESCE(NEW.pnr,'')||' — devolução ao saldo da companhia', NEW.agency_id);
    END IF;
    IF COALESCE(OLD.taxa_agencia, 0) > 0 THEN
      UPDATE public.fundo_lucro SET saldo = saldo - OLD.taxa_agencia, updated_at = now()
        WHERE agency_id = NEW.agency_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.aplicar_movimentacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total NUMERIC; v_fundo_id UUID; v_saldo_origem NUMERIC; v_pago_ate_agora NUMERIC; v_conta_sistema UUID;
BEGIN
  IF NEW.valor IS NULL OR NEW.valor < 0 THEN
    RAISE EXCEPTION 'Valor inválido na movimentação';
  END IF;

  IF NEW.tipo = 'aporte_capital' THEN
    IF NEW.conta_destino_id IS NOT NULL THEN
      UPDATE public.contas_financeiras SET saldo_inicial = saldo_inicial + NEW.valor WHERE id = NEW.conta_destino_id;
    END IF;

  ELSIF NEW.tipo = 'carregamento_companhia' THEN
    IF COALESCE(NEW.aplicar_saldo, true) AND NEW.companhia_id IS NOT NULL THEN
      UPDATE public.companhias_aereas SET saldo = saldo + NEW.valor, ultimo_carregamento = now() WHERE id = NEW.companhia_id;
    END IF;

  ELSIF NEW.tipo = 'pagamento_companhia' THEN
    IF NEW.companhia_id IS NOT NULL THEN
      UPDATE public.companhias_aereas SET saldo = saldo + NEW.valor, updated_at = now() WHERE id = NEW.companhia_id;
    END IF;

  ELSIF NEW.tipo = 'emissao_bilhete' THEN
    IF NEW.companhia_id IS NOT NULL THEN
      UPDATE public.companhias_aereas SET saldo = saldo - NEW.valor, ultimo_consumo = now() WHERE id = NEW.companhia_id;
    END IF;

  ELSIF NEW.tipo = 'adianto_mudanca_rota' THEN
    IF NEW.conta_origem_id IS NULL THEN
      SELECT id INTO NEW.conta_origem_id FROM public.contas_financeiras
        WHERE COALESCE(sistema,false) = true AND ativa = true AND agency_id = NEW.agency_id LIMIT 1;
    END IF;
    IF NEW.conta_origem_id IS NULL THEN
      RAISE EXCEPTION 'Capital Circulante não configurado';
    END IF;
    SELECT saldo_inicial INTO v_saldo_origem FROM public.contas_financeiras WHERE id = NEW.conta_origem_id FOR UPDATE;
    IF v_saldo_origem < NEW.valor THEN
      RAISE EXCEPTION 'Saldo insuficiente no Capital Circulante para adiantar mudança de rota';
    END IF;
    UPDATE public.contas_financeiras SET saldo_inicial = saldo_inicial - NEW.valor WHERE id = NEW.conta_origem_id;

  ELSIF NEW.tipo = 'pagamento_taxa_mudanca' THEN
    IF NEW.conta_destino_id IS NULL THEN
      SELECT id INTO v_conta_sistema FROM public.contas_financeiras
        WHERE COALESCE(sistema,false) = true AND ativa = true AND agency_id = NEW.agency_id LIMIT 1;
      NEW.conta_destino_id := v_conta_sistema;
    END IF;
    IF NEW.conta_destino_id IS NOT NULL THEN
      UPDATE public.contas_financeiras SET saldo_inicial = saldo_inicial + NEW.valor WHERE id = NEW.conta_destino_id;
    END IF;
    IF NEW.bilhete_id IS NOT NULL THEN
      SELECT valor_cobrado INTO v_total FROM public.bilhetes WHERE id = NEW.bilhete_id;
      SELECT COALESCE(SUM(valor),0) INTO v_pago_ate_agora
        FROM public.movimentacoes_capital
        WHERE bilhete_id = NEW.bilhete_id AND tipo IN ('pagamento_cliente','pagamento_taxa_mudanca');
      IF v_total IS NOT NULL AND v_total > 0 AND v_pago_ate_agora + NEW.valor + 0.01 >= v_total THEN
        UPDATE public.bilhetes
          SET pago = true,
              status = CASE WHEN status IN ('pedido_criado','pendente','pago') THEN 'pago'::public.ticket_status ELSE status END
          WHERE id = NEW.bilhete_id;
      END IF;
    END IF;

  ELSIF NEW.tipo = 'pagamento_cliente' THEN
    IF NEW.bilhete_id IS NOT NULL THEN
      SELECT valor_cobrado INTO v_total FROM public.bilhetes WHERE id = NEW.bilhete_id;
      IF v_total IS NOT NULL AND v_total > 0 THEN
        SELECT COALESCE(SUM(valor),0) INTO v_pago_ate_agora
          FROM public.movimentacoes_capital
          WHERE bilhete_id = NEW.bilhete_id AND tipo IN ('pagamento_cliente','pagamento_taxa_mudanca');
        IF v_pago_ate_agora + NEW.valor + 0.01 >= v_total THEN
          UPDATE public.bilhetes
            SET pago = true,
                status = CASE WHEN status IN ('pedido_criado','pendente','pago') THEN 'pago'::public.ticket_status ELSE status END
            WHERE id = NEW.bilhete_id;
        ELSE
          UPDATE public.bilhetes
            SET pago = false,
                status = CASE WHEN status = 'pago' THEN 'pendente'::public.ticket_status ELSE status END
            WHERE id = NEW.bilhete_id;
        END IF;
      END IF;
    END IF;

  ELSIF NEW.tipo = 'transferencia_lucro' THEN
    IF NEW.conta_origem_id IS NOT NULL THEN
      UPDATE public.contas_financeiras SET saldo_inicial = saldo_inicial - NEW.valor WHERE id = NEW.conta_origem_id;
    END IF;
    SELECT id INTO v_fundo_id FROM public.fundo_lucro WHERE agency_id = NEW.agency_id LIMIT 1;
    IF v_fundo_id IS NULL THEN
      INSERT INTO public.fundo_lucro (saldo, agency_id) VALUES (NEW.valor, NEW.agency_id);
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

CREATE OR REPLACE FUNCTION public.verificar_consistencia_capital()
 RETURNS TABLE(capital_contas numeric, capital_companhias numeric, capital_dividas numeric, capital_total numeric, capital_base numeric, fundo_lucro numeric, taxa_acumulada numeric, diferenca numeric, consistente boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE v_contas NUMERIC; v_cias NUMERIC; v_div NUMERIC; v_fundo NUMERIC; v_taxa NUMERIC; v_base NUMERIC; v_total NUMERIC; v_ag uuid;
BEGIN
  v_ag := public.current_agency_id();
  SELECT COALESCE(SUM(saldo_inicial),0) INTO v_contas FROM public.contas_financeiras WHERE ativa AND agency_id = v_ag;
  SELECT COALESCE(SUM(GREATEST(saldo, 0)),0) INTO v_cias
    FROM public.companhias_aereas WHERE ativa AND COALESCE(modo,'saldo') = 'saldo' AND agency_id = v_ag;
  SELECT COALESCE(SUM(GREATEST(0, COALESCE(b.custo,0) + COALESCE(b.taxa_mudancas_total,0) - COALESCE(p.total_pago,0))),0) INTO v_div
  FROM public.bilhetes b
  LEFT JOIN (
    SELECT bilhete_id, SUM(valor) AS total_pago FROM public.movimentacoes_capital
    WHERE tipo IN ('pagamento_cliente','pagamento_taxa_mudanca') AND bilhete_id IS NOT NULL
    GROUP BY bilhete_id
  ) p ON p.bilhete_id = b.id
  WHERE b.status <> 'cancelado' AND b.agency_id = v_ag;
  SELECT COALESCE(saldo,0) INTO v_fundo FROM public.fundo_lucro WHERE agency_id = v_ag LIMIT 1;
  SELECT COALESCE(SUM(taxa_agencia),0) INTO v_taxa FROM public.bilhetes WHERE status <> 'cancelado' AND agency_id = v_ag;
  SELECT COALESCE(capital_base_operacional,0) INTO v_base FROM public.agency_settings WHERE id = v_ag;
  v_total := v_contas + v_cias + v_div;
  RETURN QUERY SELECT v_contas, v_cias, v_div, v_total, COALESCE(v_base,0), COALESCE(v_fundo,0), v_taxa,
    v_total - COALESCE(v_base,0), ABS(v_total - COALESCE(v_base,0)) < 1;
END; $function$;