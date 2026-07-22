
-- 1. Novo valor do enum
ALTER TYPE public.mov_tipo ADD VALUE IF NOT EXISTS 'adianto_mudanca_rota';

-- 2. Remover trigger que debitava Circulante ao mexer na companhia
DROP TRIGGER IF EXISTS trg_registar_carregamento_por_saldo_companhia ON public.companhias_aereas;
DROP TRIGGER IF EXISTS trg_registar_carregamento_por_saldo_companhia_ins ON public.companhias_aereas;
DROP TRIGGER IF EXISTS trg_registar_carregamento_por_saldo_companhia_upd ON public.companhias_aereas;
DROP TRIGGER IF EXISTS registar_carregamento_por_saldo_companhia_trigger ON public.companhias_aereas;

-- 3. Rótulo do novo tipo em MOV_TIPO_LABEL fica no frontend.

-- 4. aplicar_movimentacao — nova lógica
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
  v_credito_lucro NUMERIC;
  v_fundo_id UUID;
  v_saldo_origem NUMERIC;
  v_pago_ate_agora NUMERIC;
  v_conta_sistema UUID;
BEGIN
  IF NEW.valor IS NULL OR NEW.valor < 0 THEN
    RAISE EXCEPTION 'Valor inválido na movimentação';
  END IF;

  IF NEW.tipo = 'aporte_capital' THEN
    IF NEW.conta_destino_id IS NOT NULL THEN
      UPDATE public.contas_financeiras SET saldo_inicial = saldo_inicial + NEW.valor WHERE id = NEW.conta_destino_id;
    END IF;

  ELSIF NEW.tipo = 'carregamento_companhia' THEN
    -- Recarga da companhia é totalmente independente do Capital Circulante.
    -- Não debita nenhuma conta. Apenas atualiza o saldo da companhia quando pedido.
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
    -- Adiantamento do Circulante para pagar mudança de rota do cliente.
    -- Debita a conta sistema (Capital Circulante).
    IF NEW.conta_origem_id IS NULL THEN
      SELECT id INTO NEW.conta_origem_id FROM public.contas_financeiras
        WHERE COALESCE(sistema,false) = true AND ativa = true LIMIT 1;
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
    -- Pagamento da taxa de mudança devolve ao Capital Circulante (repõe o adiantamento).
    IF NEW.conta_destino_id IS NULL THEN
      SELECT id INTO v_conta_sistema FROM public.contas_financeiras
        WHERE COALESCE(sistema,false) = true AND ativa = true LIMIT 1;
      NEW.conta_destino_id := v_conta_sistema;
    END IF;
    IF NEW.conta_destino_id IS NOT NULL THEN
      UPDATE public.contas_financeiras SET saldo_inicial = saldo_inicial + NEW.valor WHERE id = NEW.conta_destino_id;
    END IF;
    IF NEW.bilhete_id IS NOT NULL THEN
      SELECT valor_cobrado INTO v_total FROM public.bilhetes WHERE id = NEW.bilhete_id;
      SELECT COALESCE(SUM(valor),0) INTO v_pago_ate_agora
        FROM public.movimentacoes_capital
        WHERE bilhete_id = NEW.bilhete_id
          AND tipo IN ('pagamento_cliente','pagamento_taxa_mudanca');
      IF v_total IS NOT NULL AND v_total > 0 AND v_pago_ate_agora + NEW.valor + 0.01 >= v_total THEN
        UPDATE public.bilhetes
          SET pago = true,
              status = CASE WHEN status IN ('pedido_criado','pendente','pago') THEN 'pago'::public.ticket_status ELSE status END
          WHERE id = NEW.bilhete_id;
      END IF;
    END IF;

  ELSIF NEW.tipo = 'pagamento_cliente' THEN
    -- Apenas o lucro (taxa_agencia + taxa_mudancas_total) vai para o Fundo.
    -- A parte do custo NÃO volta ao Capital Circulante nem à companhia
    -- (companhias são geridas manualmente, sem relação com o Circulante).
    v_credito_lucro := 0;
    IF NEW.bilhete_id IS NOT NULL THEN
      SELECT custo, taxa_agencia, COALESCE(taxa_mudancas_total,0), valor_cobrado
        INTO v_custo, v_taxa, v_taxa_mud, v_total
      FROM public.bilhetes WHERE id = NEW.bilhete_id;
      v_lucro := COALESCE(v_taxa,0) + COALESCE(v_taxa_mud,0);
      IF v_custo IS NOT NULL AND (v_custo + v_lucro) > 0 THEN
        v_credito_lucro := ROUND(NEW.valor * (v_lucro / (v_custo + v_lucro)), 2);
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

-- 5. aplicar_mudanca_rota — cria adiantamento automático a partir do Circulante
CREATE OR REPLACE FUNCTION public.aplicar_mudanca_rota()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_conta_sistema UUID;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.bilhete_id IS NULL AND NEW.bilhete_id IS NOT NULL THEN
      NULL;
    ELSIF OLD.bilhete_id = NEW.bilhete_id THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.bilhete_id IS NOT NULL THEN
    UPDATE public.bilhetes
      SET taxa_mudancas_total = COALESCE(taxa_mudancas_total,0) + NEW.taxa_mudanca,
          valor_cobrado = COALESCE(valor_cobrado,0) + NEW.taxa_mudanca,
          origem = COALESCE(split_part(NEW.rota_nova, ' → ', 1), origem),
          destino = COALESCE(split_part(NEW.rota_nova, ' → ', 2), destino),
          classe = COALESCE(NEW.classe_nova, classe),
          data_viagem = COALESCE(NEW.data_viagem_nova, data_viagem),
          pago = false,
          updated_at = now()
      WHERE id = NEW.bilhete_id;

    -- Adiantamento automático do Capital Circulante
    IF COALESCE(NEW.taxa_mudanca,0) > 0 THEN
      SELECT id INTO v_conta_sistema FROM public.contas_financeiras
        WHERE COALESCE(sistema,false) = true AND ativa = true LIMIT 1;
      IF v_conta_sistema IS NULL THEN
        RAISE EXCEPTION 'Capital Circulante não configurado — não é possível adiantar a mudança';
      END IF;
      INSERT INTO public.movimentacoes_capital
        (tipo, valor, conta_origem_id, bilhete_id, responsavel_id, observacao)
      VALUES
        ('adianto_mudanca_rota', NEW.taxa_mudanca, v_conta_sistema,
         NEW.bilhete_id, NEW.responsavel_id,
         'Adiantamento mudança rota: ' || COALESCE(NEW.rota_antiga,'?') || ' → ' || COALESCE(NEW.rota_nova,'?'));
    END IF;
  END IF;

  IF NEW.reserva_id IS NOT NULL THEN
    UPDATE public.reservas
      SET origem = COALESCE(split_part(NEW.rota_nova, ' → ', 1), origem),
          destino = COALESCE(split_part(NEW.rota_nova, ' → ', 2), destino),
          classe = COALESCE(NEW.classe_nova::text, classe),
          data_viagem = COALESCE(NEW.data_viagem_nova, data_viagem),
          updated_at = now()
      WHERE id = NEW.reserva_id;
  END IF;

  RETURN NEW;
END;
$function$;
