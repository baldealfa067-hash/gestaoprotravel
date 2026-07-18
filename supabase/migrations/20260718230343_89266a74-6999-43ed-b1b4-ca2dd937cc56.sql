-- Fix 1: verificar_consistencia_capital considera pagamento_taxa_mudanca
CREATE OR REPLACE FUNCTION public.verificar_consistencia_capital()
 RETURNS TABLE(capital_contas numeric, capital_companhias numeric, capital_dividas numeric, capital_total numeric, capital_base numeric, fundo_lucro numeric, taxa_acumulada numeric, diferenca numeric, consistente boolean)
 LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $function$
DECLARE
  v_contas NUMERIC; v_cias NUMERIC; v_div NUMERIC;
  v_fundo NUMERIC; v_taxa NUMERIC; v_base NUMERIC; v_total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(saldo_inicial),0) INTO v_contas FROM public.contas_financeiras WHERE ativa;
  SELECT COALESCE(SUM(GREATEST(saldo, 0)),0) INTO v_cias
    FROM public.companhias_aereas WHERE ativa AND COALESCE(modo,'saldo') = 'saldo';
  SELECT COALESCE(SUM(GREATEST(0, COALESCE(b.valor_cobrado,0) - COALESCE(p.total_pago,0))),0) INTO v_div
  FROM public.bilhetes b
  LEFT JOIN (
    SELECT bilhete_id, SUM(valor) AS total_pago
    FROM public.movimentacoes_capital
    WHERE tipo IN ('pagamento_cliente','pagamento_taxa_mudanca') AND bilhete_id IS NOT NULL
    GROUP BY bilhete_id
  ) p ON p.bilhete_id = b.id
  WHERE b.status <> 'cancelado';
  SELECT COALESCE(saldo,0) INTO v_fundo FROM public.fundo_lucro LIMIT 1;
  SELECT COALESCE(SUM(taxa_agencia),0) INTO v_taxa FROM public.bilhetes WHERE status <> 'cancelado';
  SELECT COALESCE(capital_base_operacional,0) INTO v_base FROM public.agency_settings LIMIT 1;
  v_total := v_contas + v_cias + v_div;
  RETURN QUERY SELECT v_contas, v_cias, v_div, v_total, COALESCE(v_base,0), v_fundo, v_taxa,
    v_total - COALESCE(v_base,0), ABS(v_total - COALESCE(v_base,0)) < 1;
END; $function$;

-- Fix 2: Remove triggers updated_at duplicados
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl, array_agg(t.tgname ORDER BY t.tgname) AS tgs
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE n.nspname = 'public' AND NOT t.tgisinternal AND p.proname = 'set_updated_at'
    GROUP BY c.relname HAVING count(*) > 1
  LOOP
    FOR i IN 2..array_length(r.tgs, 1) LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', r.tgs[i], r.tbl);
    END LOOP;
  END LOOP;
END $$;

-- Fix 4: RLS restrita em mudancas_rota INSERT
DROP POLICY IF EXISTS "mudancas_rota insert autenticados" ON public.mudancas_rota;
CREATE POLICY "mudancas_rota insert autorizados"
ON public.mudancas_rota FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR (bilhete_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bilhetes b WHERE b.id = bilhete_id AND b.vendedor_id = auth.uid()
  ))
  OR (reserva_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.reservas r WHERE r.id = reserva_id AND r.user_id = auth.uid()
  ))
);

-- Fix 5: WITH CHECK restrito no UPDATE admin
DROP POLICY IF EXISTS "Admin edita mudancas" ON public.mudancas_rota;
CREATE POLICY "Admin edita mudancas"
ON public.mudancas_rota FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));