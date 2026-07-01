
-- Recreate trigger for new users, and backfill missing profiles/roles
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill profiles
INSERT INTO public.profiles (id, full_name, cargo)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'full_name', u.email),
       u.raw_user_meta_data->>'cargo'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Backfill roles: earliest user = admin, rest = vendedor
WITH ordered AS (
  SELECT u.id, ROW_NUMBER() OVER (ORDER BY u.created_at) AS rn
  FROM auth.users u
  LEFT JOIN public.user_roles r ON r.user_id = u.id
  WHERE r.user_id IS NULL
)
INSERT INTO public.user_roles (user_id, role)
SELECT id, CASE WHEN rn = 1 AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role='admin') THEN 'admin'::app_role ELSE 'vendedor'::app_role END
FROM ordered;
