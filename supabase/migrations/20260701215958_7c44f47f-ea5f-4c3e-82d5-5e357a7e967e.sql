
-- =========================================================
-- CAPITAL: infraestrutura de rastreamento operacional
-- =========================================================

-- Enums
CREATE TYPE public.conta_tipo AS ENUM ('caixa','banco');
CREATE TYPE public.continente AS ENUM ('africa','europa','america','asia','oceania');
CREATE TYPE public.bilhete_classe AS ENUM ('economica','executiva');
CREATE TYPE public.mov_tipo AS ENUM (
  'carregamento_companhia',
  'emissao_bilhete',
  'pagamento_cliente',
  'transferencia_lucro',
  'despesa_operacional',
  'transferencia_interna'
);

-- Contas financeiras (caixa e bancos)
CREATE TABLE public.contas_financeiras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  tipo public.conta_tipo NOT NULL,
  saldo_inicial NUMERIC(14,2) NOT NULL DEFAULT 0,
  ativa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contas_financeiras TO authenticated;
GRANT ALL ON public.contas_financeiras TO service_role;
ALTER TABLE public.contas_financeiras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read contas" ON public.contas_financeiras FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage contas" ON public.contas_financeiras FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_contas_upd BEFORE UPDATE ON public.contas_financeiras
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Companhias aéreas
CREATE TABLE public.companhias_aereas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  codigo TEXT,
  saldo NUMERIC(14,2) NOT NULL DEFAULT 0,
  alerta_minimo NUMERIC(14,2) NOT NULL DEFAULT 0,
  ativa BOOLEAN NOT NULL DEFAULT true,
  ultimo_carregamento TIMESTAMPTZ,
  ultimo_consumo TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companhias_aereas TO authenticated;
GRANT ALL ON public.companhias_aereas TO service_role;
ALTER TABLE public.companhias_aereas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read cias" ON public.companhias_aereas FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage cias" ON public.companhias_aereas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_cias_upd BEFORE UPDATE ON public.companhias_aereas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Fundo de lucro (linha única)
CREATE TABLE public.fundo_lucro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  saldo NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.fundo_lucro TO authenticated;
GRANT ALL ON public.fundo_lucro TO service_role;
ALTER TABLE public.fundo_lucro ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read fundo" ON public.fundo_lucro FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin update fundo" ON public.fundo_lucro FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.fundo_lucro (saldo) VALUES (0);

-- Movimentações de capital
CREATE TABLE public.movimentacoes_capital (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo public.mov_tipo NOT NULL,
  conta_origem_id UUID REFERENCES public.contas_financeiras(id) ON DELETE SET NULL,
  conta_destino_id UUID REFERENCES public.contas_financeiras(id) ON DELETE SET NULL,
  companhia_id UUID REFERENCES public.companhias_aereas(id) ON DELETE SET NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  bilhete_id UUID REFERENCES public.bilhetes(id) ON DELETE SET NULL,
  valor NUMERIC(14,2) NOT NULL,
  referencia TEXT,
  observacao TEXT,
  responsavel_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mov_tipo ON public.movimentacoes_capital(tipo);
CREATE INDEX idx_mov_created ON public.movimentacoes_capital(created_at DESC);
CREATE INDEX idx_mov_cia ON public.movimentacoes_capital(companhia_id);
CREATE INDEX idx_mov_bilhete ON public.movimentacoes_capital(bilhete_id);
GRANT SELECT, INSERT ON public.movimentacoes_capital TO authenticated;
GRANT ALL ON public.movimentacoes_capital TO service_role;
ALTER TABLE public.movimentacoes_capital ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read mov" ON public.movimentacoes_capital FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert mov" ON public.movimentacoes_capital FOR INSERT TO authenticated
  WITH CHECK (responsavel_id = auth.uid());
CREATE POLICY "admin update mov" ON public.movimentacoes_capital FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin delete mov" ON public.movimentacoes_capital FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- Extensões na tabela bilhetes
ALTER TABLE public.bilhetes
  ADD COLUMN IF NOT EXISTS continente_origem public.continente,
  ADD COLUMN IF NOT EXISTS continente_destino public.continente,
  ADD COLUMN IF NOT EXISTS classe public.bilhete_classe NOT NULL DEFAULT 'economica',
  ADD COLUMN IF NOT EXISTS taxa_agencia NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS companhia_id UUID REFERENCES public.companhias_aereas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pago BOOLEAN NOT NULL DEFAULT false;

-- Backfill: taxa_agencia = lucro existente (sem continente conhecido)
UPDATE public.bilhetes SET taxa_agencia = COALESCE(lucro,0) WHERE taxa_agencia = 0;
UPDATE public.bilhetes SET pago = true WHERE status IN ('pago','emitido');

-- Função de cálculo de taxa
CREATE OR REPLACE FUNCTION public.calcular_taxa_agencia(
  _origem public.continente,
  _destino public.continente,
  _classe public.bilhete_classe,
  _custo NUMERIC
) RETURNS NUMERIC LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF _origem IS NULL OR _destino IS NULL THEN
    RETURN 0;
  END IF;
  IF _origem = _destino THEN
    RETURN ROUND(COALESCE(_custo,0) * 0.06, 2);
  END IF;
  IF _classe = 'executiva' THEN
    RETURN 50000;
  END IF;
  RETURN 30000;
END;
$$;

-- Trigger para calcular taxa e total automaticamente no bilhete
CREATE OR REPLACE FUNCTION public.bilhete_auto_taxa()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.continente_origem IS NOT NULL AND NEW.continente_destino IS NOT NULL THEN
    NEW.taxa_agencia := public.calcular_taxa_agencia(
      NEW.continente_origem, NEW.continente_destino, NEW.classe, NEW.custo
    );
    NEW.valor_cobrado := COALESCE(NEW.custo,0) + NEW.taxa_agencia;
    NEW.lucro := NEW.taxa_agencia;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_bilhete_auto_taxa ON public.bilhetes;
CREATE TRIGGER trg_bilhete_auto_taxa BEFORE INSERT OR UPDATE ON public.bilhetes
  FOR EACH ROW EXECUTE FUNCTION public.bilhete_auto_taxa();

-- Trigger para aplicar movimentações ao saldo das contas/companhias
CREATE OR REPLACE FUNCTION public.aplicar_movimentacao()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.tipo = 'carregamento_companhia' THEN
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
$$;
DROP TRIGGER IF EXISTS trg_aplicar_mov ON public.movimentacoes_capital;
CREATE TRIGGER trg_aplicar_mov AFTER INSERT ON public.movimentacoes_capital
  FOR EACH ROW EXECUTE FUNCTION public.aplicar_movimentacao();

-- Verificação de consistência do capital
CREATE OR REPLACE FUNCTION public.verificar_consistencia_capital()
RETURNS TABLE (
  capital_contas NUMERIC,
  capital_companhias NUMERIC,
  capital_dividas NUMERIC,
  capital_total NUMERIC,
  fundo_lucro NUMERIC,
  taxa_acumulada NUMERIC,
  diferenca NUMERIC,
  consistente BOOLEAN
) LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_contas NUMERIC; v_cias NUMERIC; v_div NUMERIC; v_fundo NUMERIC; v_taxa NUMERIC;
BEGIN
  SELECT COALESCE(SUM(saldo_inicial),0) INTO v_contas FROM public.contas_financeiras WHERE ativa;
  SELECT COALESCE(SUM(saldo),0) INTO v_cias FROM public.companhias_aereas WHERE ativa;
  SELECT COALESCE(SUM(valor_cobrado),0) INTO v_div FROM public.bilhetes
    WHERE pago = false AND status IN ('emitido','pendente','pedido_criado');
  SELECT COALESCE(saldo,0) INTO v_fundo FROM public.fundo_lucro LIMIT 1;
  SELECT COALESCE(SUM(taxa_agencia),0) INTO v_taxa FROM public.bilhetes WHERE status <> 'cancelado';
  RETURN QUERY SELECT
    v_contas, v_cias, v_div, v_contas + v_cias + v_div, v_fundo, v_taxa,
    (v_contas + v_cias + v_div + v_fundo) - v_taxa AS diferenca,
    ABS((v_contas + v_cias + v_div + v_fundo) - v_taxa) < 1 AS consistente;
END;
$$;
GRANT EXECUTE ON FUNCTION public.verificar_consistencia_capital() TO authenticated;
GRANT EXECUTE ON FUNCTION public.calcular_taxa_agencia(public.continente,public.continente,public.bilhete_classe,NUMERIC) TO authenticated;
