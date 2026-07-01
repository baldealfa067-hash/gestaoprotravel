-- Reservas table
CREATE TABLE public.reservas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  pnr TEXT NOT NULL,
  companhia TEXT NOT NULL,
  origem TEXT NOT NULL,
  destino TEXT NOT NULL,
  continente_origem TEXT,
  continente_destino TEXT,
  classe TEXT NOT NULL DEFAULT 'economica',
  data_viagem DATE NOT NULL,
  data_limite TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','emitida','expirada','cancelada')),
  observacoes TEXT,
  cliente_contactado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservas TO authenticated;
GRANT ALL ON public.reservas TO service_role;

ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "Admins podem tudo em reservas"
ON public.reservas FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Vendedor: only own
CREATE POLICY "Vendedores veem próprias reservas"
ON public.reservas FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Vendedores criam próprias reservas"
ON public.reservas FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Vendedores editam próprias reservas"
ON public.reservas FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Vendedores eliminam próprias reservas"
ON public.reservas FOR DELETE
TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER reservas_set_updated_at
BEFORE UPDATE ON public.reservas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_reservas_user_id ON public.reservas(user_id);
CREATE INDEX idx_reservas_data_limite ON public.reservas(data_limite);
CREATE INDEX idx_reservas_status ON public.reservas(status);