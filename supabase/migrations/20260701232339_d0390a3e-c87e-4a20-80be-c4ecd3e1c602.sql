
-- 1) Proteção de conta sistema
ALTER TABLE public.contas_financeiras
  ADD COLUMN IF NOT EXISTS sistema BOOLEAN NOT NULL DEFAULT false;

-- 2) Seed do Capital Circulante (idempotente)
INSERT INTO public.contas_financeiras (nome, tipo, saldo_inicial, ativa, sistema)
SELECT 'Capital Circulante', 'banco', 0, true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.contas_financeiras WHERE sistema = true
);

-- 3) Ligação Reservas -> Bilhetes
ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS bilhete_id UUID REFERENCES public.bilhetes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS reservas_bilhete_id_idx ON public.reservas(bilhete_id);

-- 4) Trigger de fundo_lucro: garantir singleton
INSERT INTO public.fundo_lucro (saldo)
SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM public.fundo_lucro);

-- 5) Atualização do trigger aplicar_movimentacao
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
    -- Divide o pagamento: custo -> conta (capital circulante), taxa -> fundo de lucro
    v_credito_conta := NEW.valor;
    v_credito_lucro := 0;
    IF NEW.bilhete_id IS NOT NULL THEN
      SELECT custo, taxa_agencia INTO v_custo, v_taxa
      FROM public.bilhetes WHERE id = NEW.bilhete_id;
      IF v_custo IS NOT NULL AND v_taxa IS NOT NULL AND (v_custo + v_taxa) > 0 THEN
        -- Se valor pago == custo+taxa, split direto; caso contrário, proporcional
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
      UPDATE public.fundo_lucro SET saldo = saldo + v_credito_lucro, updated_at = now();
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
