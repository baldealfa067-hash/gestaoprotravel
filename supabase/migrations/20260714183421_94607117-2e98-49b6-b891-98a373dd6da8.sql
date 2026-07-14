
-- Tabela para histórico de mudanças de rota e taxa acumulada em bilhetes
ALTER TABLE public.bilhetes
  ADD COLUMN IF NOT EXISTS taxa_mudancas_total NUMERIC NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.mudancas_rota (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bilhete_id UUID REFERENCES public.bilhetes(id) ON DELETE CASCADE,
  reserva_id UUID REFERENCES public.reservas(id) ON DELETE SET NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  rota_antiga TEXT,
  rota_nova TEXT NOT NULL,
  classe_antiga public.bilhete_classe,
  classe_nova public.bilhete_classe,
  data_viagem_antiga DATE,
  data_viagem_nova DATE,
  taxa_mudanca NUMERIC NOT NULL CHECK (taxa_mudanca > 0),
  motivo TEXT,
  responsavel_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mudancas_rota TO authenticated;
GRANT ALL ON public.mudancas_rota TO service_role;

ALTER TABLE public.mudancas_rota ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem mudancas" ON public.mudancas_rota
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados criam mudancas" ON public.mudancas_rota
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = responsavel_id OR responsavel_id IS NULL);
CREATE POLICY "Admin edita mudancas" ON public.mudancas_rota
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (true);
CREATE POLICY "Admin apaga mudancas" ON public.mudancas_rota
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Trigger: ao inserir/atualizar mudança com bilhete_id, aplicar taxa e rota no bilhete
CREATE OR REPLACE FUNCTION public.aplicar_mudanca_rota()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_old_taxa NUMERIC := 0;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Se transitou de reserva-only (bilhete_id NULL) para bilhete_id definido, aplicar
    IF OLD.bilhete_id IS NULL AND NEW.bilhete_id IS NOT NULL THEN
      v_old_taxa := 0;
    ELSIF OLD.bilhete_id = NEW.bilhete_id THEN
      RETURN NEW; -- não reaplica se apenas edições cosméticas
    ELSE
      v_old_taxa := 0;
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
  END IF;

  -- Também atualiza a reserva vinculada (se houver) para refletir nova rota/data
  IF NEW.reserva_id IS NOT NULL THEN
    UPDATE public.reservas
      SET origem = COALESCE(split_part(NEW.rota_nova, ' → ', 1), origem),
          destino = COALESCE(split_part(NEW.rota_nova, ' → ', 2), destino),
          classe = COALESCE(NEW.classe_nova, classe),
          data_viagem = COALESCE(NEW.data_viagem_nova, data_viagem),
          updated_at = now()
      WHERE id = NEW.reserva_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aplicar_mudanca_rota_ins ON public.mudancas_rota;
CREATE TRIGGER trg_aplicar_mudanca_rota_ins
  AFTER INSERT ON public.mudancas_rota
  FOR EACH ROW EXECUTE FUNCTION public.aplicar_mudanca_rota();

DROP TRIGGER IF EXISTS trg_aplicar_mudanca_rota_upd ON public.mudancas_rota;
CREATE TRIGGER trg_aplicar_mudanca_rota_upd
  AFTER UPDATE OF bilhete_id ON public.mudancas_rota
  FOR EACH ROW EXECUTE FUNCTION public.aplicar_mudanca_rota();
