
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'vendedor');
CREATE TYPE public.ticket_status AS ENUM ('pedido_criado', 'pendente', 'pago', 'emitido', 'cancelado');

-- =====================
-- profiles
-- =====================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  cargo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =====================
-- user_roles
-- =====================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid() ORDER BY (role = 'admin') DESC LIMIT 1;
$$;

-- Policies for profiles
CREATE POLICY "Users see own profile or admin sees all" ON public.profiles
FOR SELECT TO authenticated
USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users update own profile" ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert profiles" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete profiles" ON public.profiles
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Policies for user_roles
CREATE POLICY "Users see own roles or admin sees all" ON public.user_roles
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- =====================
-- agency_settings (singleton)
-- =====================
CREATE TABLE public.agency_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_name TEXT NOT NULL DEFAULT 'Gestão Pro Travel',
  currency TEXT NOT NULL DEFAULT 'AOA',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agency_settings TO authenticated;
GRANT ALL ON public.agency_settings TO service_role;
ALTER TABLE public.agency_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read settings" ON public.agency_settings
FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins update settings" ON public.agency_settings
FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert settings" ON public.agency_settings
FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.agency_settings (agency_name, currency) VALUES ('Gestão Pro Travel', 'AOA');

-- =====================
-- clientes
-- =====================
CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  passport_number TEXT,
  nationality TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT ALL ON public.clientes TO service_role;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read clientes" ON public.clientes
FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert clientes" ON public.clientes
FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated update clientes" ON public.clientes
FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admins delete clientes" ON public.clientes
FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX clientes_full_name_idx ON public.clientes USING gin (to_tsvector('simple', full_name));

-- =====================
-- bilhetes
-- =====================
CREATE TABLE public.bilhetes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  vendedor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  origem TEXT NOT NULL,
  destino TEXT NOT NULL,
  companhia TEXT NOT NULL,
  data_viagem DATE NOT NULL,
  pnr TEXT,
  custo NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_cobrado NUMERIC(14,2) NOT NULL DEFAULT 0,
  lucro NUMERIC(14,2) GENERATED ALWAYS AS (valor_cobrado - custo) STORED,
  status public.ticket_status NOT NULL DEFAULT 'pedido_criado',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bilhetes TO authenticated;
GRANT ALL ON public.bilhetes TO service_role;
ALTER TABLE public.bilhetes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read bilhetes" ON public.bilhetes
FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert own bilhetes" ON public.bilhetes
FOR INSERT TO authenticated WITH CHECK (vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Update own or admin bilhetes" ON public.bilhetes
FOR UPDATE TO authenticated
USING (vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete bilhetes" ON public.bilhetes
FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX bilhetes_vendedor_idx ON public.bilhetes(vendedor_id);
CREATE INDEX bilhetes_cliente_idx ON public.bilhetes(cliente_id);
CREATE INDEX bilhetes_created_at_idx ON public.bilhetes(created_at DESC);
CREATE INDEX bilhetes_data_viagem_idx ON public.bilhetes(data_viagem);

-- =====================
-- updated_at trigger
-- =====================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_clientes_updated BEFORE UPDATE ON public.clientes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_bilhetes_updated BEFORE UPDATE ON public.bilhetes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_agency_updated BEFORE UPDATE ON public.agency_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================
-- handle_new_user: cria profile + atribui role
-- =====================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INT;
  assigned_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, cargo)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'cargo'
  );

  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    assigned_role := 'admin';
  ELSE
    -- Se o admin criar via Auth Admin API com meta role
    IF NEW.raw_user_meta_data->>'role' = 'admin' THEN
      assigned_role := 'admin';
    ELSE
      assigned_role := 'vendedor';
    END IF;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
