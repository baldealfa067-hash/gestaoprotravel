-- 1) Coluna acumulada de taxa de mudanças em bilhetes
ALTER TABLE public.bilhetes
  ADD COLUMN IF NOT EXISTS taxa_mudancas_total numeric NOT NULL DEFAULT 0;

-- 2) Tabela de mudanças de rota
CREATE TABLE IF NOT EXISTS public.mudancas_rota (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bilhete_id uuid REFERENCES public.bilhetes(id) ON DELETE CASCADE,
  reserva_id uuid REFERENCES public.reservas(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  rota_antiga text,
  rota_nova text,
  classe_antiga public.bilhete_classe,
  classe_nova public.bilhete_classe,
  data_viagem_antiga date,
  data_viagem_nova date,
  taxa_mudanca numeric NOT NULL CHECK (taxa_mudanca > 0),
  motivo text,
  responsavel_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mudancas_rota_alvo_ck CHECK (bilhete_id IS NOT NULL OR reserva_id IS NOT NULL)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mudancas_rota TO authenticated;
GRANT ALL ON public.mudancas_rota TO service_role;

ALTER TABLE public.mudancas_rota ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mudancas_rota select autenticados"
  ON public.mudancas_rota FOR SELECT TO authenticated USING (true);
CREATE POLICY "mudancas_rota insert autenticados"
  ON public.mudancas_rota FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "mudancas_rota update admin"
  ON public.mudancas_rota FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "mudancas_rota delete admin"
  ON public.mudancas_rota FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_mudancas_rota_updated
  BEFORE UPDATE ON public.mudancas_rota
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS mudancas_rota_bilhete_idx ON public.mudancas_rota(bilhete_id);
CREATE INDEX IF NOT EXISTS mudancas_rota_reserva_idx ON public.mudancas_rota(reserva_id);

-- 3) Atualiza bilhete_auto_taxa para incluir taxa_mudancas_total
CREATE OR REPLACE FUNCTION public.bilhete_auto_taxa()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.continente_origem IS NOT NULL AND NEW.continente_destino IS NOT NULL THEN
    NEW.taxa_agencia := public.calcular_taxa_agencia(
      NEW.continente_origem, NEW.continente_destino, NEW.classe, NEW.custo
    );
    NEW.valor_cobrado := COALESCE(NEW.custo,0) + NEW.taxa_agencia + COALESCE(NEW.taxa_mudancas_total,0);
    NEW.lucro := NEW.taxa_agencia + COALESCE(NEW.taxa_mudancas_total,0);
  END IF;
  RETURN NEW;
END;
$function$;

-- 4) Trigger para aplicar mudança de rota
CREATE OR REPLACE FUNCTION public.aplicar_mudanca_rota()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pago numeric;
  v_novo_total numeric;
BEGIN
  -- Aplicar em bilhete (INSERT com bilhete_id, ou UPDATE que passa a ter bilhete_id)
  IF NEW.bilhete_id IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.bilhete_id IS DISTINCT FROM NEW.bilhete_id) THEN
    UPDATE public.bilhetes
      SET taxa_mudancas_total = COALESCE(taxa_mudancas_total,0) + NEW.taxa_mudanca,
          origem = COALESCE(split_part(NEW.rota_nova,'→',1), origem),
          destino = COALESCE(NULLIF(trim(split_part(NEW.rota_nova,'→',2)),''), destino),
          classe = COALESCE(NEW.classe_nova, classe),
          data_viagem = COALESCE(NEW.data_viagem_nova, data_viagem)
      WHERE id = NEW.bilhete_id;

    -- recalcular pago vs total
    SELECT COALESCE(SUM(valor),0) INTO v_pago
      FROM public.movimentacoes_capital
      WHERE bilhete_id = NEW.bilhete_id AND tipo = 'pagamento_cliente';

    SELECT valor_cobrado INTO v_novo_total FROM public.bilhetes WHERE id = NEW.bilhete_id;

    IF v_pago + 0.01 < COALESCE(v_novo_total,0) THEN
      UPDATE public.bilhetes
        SET pago = false,
            status = CASE WHEN status = 'pago' THEN 'pendente'::public.ticket_status ELSE status END
        WHERE id = NEW.bilhete_id;
    END IF;
  END IF;

  -- Aplicar em reserva (rota/classe/data)
  IF NEW.reserva_id IS NOT NULL AND TG_OP = 'INSERT' THEN
    UPDATE public.reservas
      SET origem = COALESCE(split_part(NEW.rota_nova,'→',1), origem),
          destino = COALESCE(NULLIF(trim(split_part(NEW.rota_nova,'→',2)),''), destino),
          classe = COALESCE(NEW.classe_nova, classe),
          data_viagem = COALESCE(NEW.data_viagem_nova, data_viagem),
          updated_at = now()
      WHERE id = NEW.reserva_id;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_aplicar_mudanca_rota ON public.mudancas_rota;
CREATE TRIGGER trg_aplicar_mudanca_rota
  AFTER INSERT OR UPDATE ON public.mudancas_rota
  FOR EACH ROW EXECUTE FUNCTION public.aplicar_mudanca_rota();

-- 5) Atualiza rateio de pagamento para tratar taxa_mudancas como lucro
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

  ELSIF NEW.tipo = 'pagamento_cliente' THEN
    v_credito_conta := NEW.valor;
    v_credito_lucro := 0;
    IF NEW.bilhete_id IS NOT NULL THEN
      SELECT custo, taxa_agencia, COALESCE(taxa_mudancas_total,0), valor_cobrado
        INTO v_custo, v_taxa, v_taxa_mud, v_total
      FROM public.bilhetes WHERE id = NEW.bilhete_id;
      v_lucro := COALESCE(v_taxa,0) + COALESCE(v_taxa_mud,0);
      IF v_custo IS NOT NULL AND (v_custo + v_lucro) > 0 THEN
        v_credito_conta := ROUND(NEW.valor * (v_custo / (v_custo + v_lucro)), 2);
        v_credito_lucro := NEW.valor - v_credito_conta;
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

    IF NEW.bilhete_id IS NOT NULL AND v_total IS NOT NULL AND v_total > 0 THEN
      SELECT COALESCE(SUM(valor),0) INTO v_pago_ate_agora
        FROM public.movimentacoes_capital
        WHERE bilhete_id = NEW.bilhete_id AND tipo = 'pagamento_cliente';
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