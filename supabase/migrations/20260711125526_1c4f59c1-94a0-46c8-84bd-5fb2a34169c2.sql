REVOKE ALL ON FUNCTION public.ajustar_capital(text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ajustar_capital(text, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.ajustar_capital(text, numeric, text) TO authenticated;

REVOKE ALL ON FUNCTION public.definir_capital_circulante(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.definir_capital_circulante(numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.definir_capital_circulante(numeric) TO authenticated;