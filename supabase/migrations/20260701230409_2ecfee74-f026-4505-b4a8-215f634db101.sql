
ALTER TYPE mov_tipo ADD VALUE IF NOT EXISTS 'aporte_capital';

CREATE OR REPLACE FUNCTION public.aplicar_movimentacao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
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
    IF NEW.conta_destino_id IS NOT NULL THEN
      UPDATE public.contas_financeiras SET saldo_inicial = saldo_inicial + NEW.valor WHERE id = NEW.conta_destino_id;
    END IF;
    IF NEW.bilhete_id IS NOT NULL THEN
      UPDATE public.bilhetes SET pago = true WHERE id = NEW.bilhete_id;
    END IF;
  ELSIF NEW.tipo = 'transferencia_lucro' THEN
    IF NEW.conta_origem_id IS NOT NULL THEN
      UPDATE public.contas_financeiras SET saldo_inicial = saldo_inicial - NEW.valor WHERE id = NEW.conta_origem_id;
    END IF;
    UPDATE public.fundo_lucro SET saldo = saldo + NEW.valor, updated_at = now();
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
