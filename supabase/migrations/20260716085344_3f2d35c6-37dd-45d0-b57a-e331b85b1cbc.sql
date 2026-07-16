CREATE OR REPLACE FUNCTION public.aplicar_movimentacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_custo NUMERIC;
  v_taxa NUMERIC;
  v_taxa_mud NUMERIC;
  v_lucro NUMERIC;
  v_total NUMERIC;
  v_credito_conta NUMERIC;
  v_credito_lucro NUMERIC;
  v_fundo_id UUID;
  v_saldo_origem NUMERIC;
  v_pago_ate_agora NUMERIC;
  v_bilhete_companhia UUID;
  v_bilhete_modo TEXT;
BEGIN
  IF NEW.valor IS NULL OR NEW.valor < 0 THEN
    RAISE EXCEPTION 'Valor inválido na movimentação';
  END IF;

  IF NEW.tipo = 'aporte_capital' THEN
    IF NEW.conta_destino_id IS NOT NULL THEN
      UPDATE public.contas_financeiras SET saldo_inicial = saldo_inicial + NEW.valor WHERE id = NEW.conta_destino_id;
    END IF;

  ELSIF NEW.tipo = 'carregamento_companhia' THEN
    IF NEW.conta_origem_id IS NOT NULL THEN
      SELECT saldo_inicial INTO v_saldo_origem FROM public.contas_financeiras WHERE id = NEW.conta_origem_id FOR UPDATE;
      IF v_saldo_origem IS NULL THEN RAISE EXCEPTION 'Conta de origem não encontrada'; END IF;
      IF v_saldo_origem < NEW.valor THEN RAISE EXCEPTION 'Saldo insuficiente no Capital Circulante'; END IF;
      UPDATE public.contas_financeiras SET saldo_inicial = saldo_inicial - NEW.valor WHERE id = NEW.conta_origem_id;
    END IF;
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

  ELSIF NEW.tipo = 'pagamento_taxa_mudanca' THEN
    SELECT id INTO v_fundo_id FROM public.fundo_lucro LIMIT 1;
    IF v_fundo_id IS NULL THEN
      INSERT INTO public.fundo_lucro (saldo) VALUES (NEW.valor) RETURNING id INTO v_fundo_id;
    ELSE
      UPDATE public.fundo_lucro SET saldo = saldo + NEW.valor, updated_at = now() WHERE id = v_fundo_id;
    END IF;
    IF NEW.bilhete_id IS NOT NULL THEN
      SELECT valor_cobrado INTO v_total FROM public.bilhetes WHERE id = NEW.bilhete_id;
      SELECT COALESCE(SUM(valor),0) INTO v_pago_ate_agora
        FROM public.movimentacoes_capital
        WHERE bilhete_id = NEW.bilhete_id
          AND tipo IN ('pagamento_cliente','pagamento_taxa_mudanca');
      IF v_total IS NOT NULL AND v_total > 0 AND v_pago_ate_agora + 0.01 >= v_total THEN
        UPDATE public.bilhetes
          SET pago = true,
              status = CASE WHEN status IN ('pedido_criado','pendente','pago') THEN 'pago'::public.ticket_status ELSE status END
          WHERE id = NEW.bilhete_id;
      END IF;
    END IF;

  ELSIF NEW.tipo = 'pagamento_cliente' THEN
    v_credito_conta := NEW.valor;
    v_credito_lucro := 0;
    IF NEW.bilhete_id IS NOT NULL THEN
      SELECT custo, taxa_agencia, COALESCE(taxa_mudancas_total,0), valor_cobrado, companhia_id
        INTO v_custo, v_taxa, v_taxa_mud, v_total, v_bilhete_companhia
      FROM public.bilhetes WHERE id = NEW.bilhete_id;
      v_lucro := COALESCE(v_taxa,0) + COALESCE(v_taxa_mud,0);
      IF v_custo IS NOT NULL AND (v_custo + v_lucro) > 0 THEN
        v_credito_conta := ROUND(NEW.valor * (v_custo / (v_custo + v_lucro)), 2);
        v_credito_lucro := NEW.valor - v_credito_conta;
      END IF;

      IF v_bilhete_companhia IS NOT NULL THEN
        SELECT COALESCE(modo,'saldo') INTO v_bilhete_modo
          FROM public.companhias_aereas WHERE id = v_bilhete_companhia;
      END IF;
    END IF;

    -- Parte do custo:
    -- Companhia intermediária (credito): NÃO faz nada automaticamente.
    --   A dívida à companhia mantém-se e é liquidada manualmente na aba
    --   "Dívidas a companhias intermediárias" (pagamento_companhia).
    -- Companhia com saldo próprio (recarregada): volta ao Capital Circulante.
    IF v_credito_conta > 0 AND v_bilhete_modo <> 'credito' THEN
      IF NEW.conta_destino_id IS NOT NULL THEN
        UPDATE public.contas_financeiras SET saldo_inicial = saldo_inicial + v_credito_conta WHERE id = NEW.conta_destino_id;
      END IF;
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
        WHERE bilhete_id = NEW.bilhete_id
          AND tipo IN ('pagamento_cliente','pagamento_taxa_mudanca');
      IF v_pago_ate_agora + 0.01 >= v_total THEN
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