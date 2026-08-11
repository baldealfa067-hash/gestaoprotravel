CREATE TABLE IF NOT EXISTS public.superadmins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.superadmins TO authenticated;
GRANT ALL ON public.superadmins TO service_role;
ALTER TABLE public.superadmins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sa_select_self ON public.superadmins;
CREATE POLICY sa_select_self ON public.superadmins FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.superadmins WHERE user_id = _user_id);
$$;

DROP POLICY IF EXISTS ag_select ON public.agency_settings;
CREATE POLICY ag_select ON public.agency_settings FOR SELECT TO authenticated
USING (id = public.current_agency_id() OR public.is_superadmin(auth.uid()));