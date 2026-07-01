
-- 1) Corrigir aplicar_movimentacao: adicionar WHERE em fundo_lucro
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
BEGIN
  IF NEW.tipo = 'aporte_capital' THEN
    IF NEW.conta_destino_id IS NOT NULL THEN
      UPDATE public.contas_financeiras SET saldo_inicial = saldo_inicial + NEW.valor WHERE id = NEW.conta_destino_id;
    END IF;
  ELSIF NEW.tipo = 'carregamento_companhia' THEN
    IF NEW.conta_origem_id IS NOT NULL THEN
      UPDATE public.contas_financeiras SET saldo_inicial = saldo_inicial - NEW.valor WHERE id = NEW.conta_origem_id;
    END IF;
    IF NEW.companhia_id IS NOT NULL THEN
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
      UPDATE public.contas_financeiras SET saldo_inicial = saldo_inicial + v_credito_conta WHERE id = NEW.conta_destino_id;
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

-- 2) Automação: reserva vinculada -> emitida quando o bilhete for emitido
CREATE OR REPLACE FUNCTION public.sync_reserva_on_bilhete_emitido()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'emitido' AND (OLD.status IS DISTINCT FROM 'emitido') THEN
    UPDATE public.reservas
      SET status = 'emitida', updated_at = now()
      WHERE bilhete_id = NEW.id AND status <> 'emitida';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_reserva_bilhete_emitido ON public.bilhetes;
CREATE TRIGGER trg_sync_reserva_bilhete_emitido
AFTER UPDATE OF status ON public.bilhetes
FOR EACH ROW EXECUTE FUNCTION public.sync_reserva_on_bilhete_emitido();
