DROP TRIGGER IF EXISTS trg_movimentacoes_capital_updated_at ON public.movimentacoes_capital;
DROP TRIGGER IF EXISTS set_updated_at_movimentacoes_capital ON public.movimentacoes_capital;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.movimentacoes_capital'::regclass AND NOT tgisinternal AND tgname LIKE '%updated%'
  LOOP
    EXECUTE 'DROP TRIGGER ' || quote_ident(r.tgname) || ' ON public.movimentacoes_capital';
  END LOOP;
END $$;