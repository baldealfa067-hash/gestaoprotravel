CREATE OR REPLACE FUNCTION public.verificar_consistencia_capital()
 RETURNS TABLE(capital_contas numeric, capital_companhias numeric, capital_dividas numeric, capital_total numeric, capital_base numeric, fundo_lucro numeric, taxa_acumulada numeric, diferenca numeric, consistente boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contas NUMERIC;
  v_cias NUMERIC;
  v_div NUMERIC;
  v_fundo NUMERIC;
  v_taxa NUMERIC;
  v_base NUMERIC;
  v_total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(saldo_inicial),0) INTO v_contas FROM public.contas_financeiras WHERE ativa;
  SELECT COALESCE(SUM(saldo),0) INTO v_cias FROM public.companhias_aereas WHERE ativa;

  SELECT COALESCE(SUM(GREATEST(0, COALESCE(b.valor_cobrado,0) - COALESCE(p.total_pago,0))),0)
    INTO v_div
  FROM public.bilhetes b
  LEFT JOIN (
    SELECT bilhete_id, SUM(valor) AS total_pago
    FROM public.movimentacoes_capital
    WHERE tipo = 'pagamento_cliente'
      AND bilhete_id IS NOT NULL
    GROUP BY bilhete_id
  ) p ON p.bilhete_id = b.id
  WHERE b.status <> 'cancelado';

  SELECT COALESCE(saldo,0) INTO v_fundo FROM public.fundo_lucro LIMIT 1;
  SELECT COALESCE(SUM(taxa_agencia),0) INTO v_taxa FROM public.bilhetes WHERE status <> 'cancelado';
  SELECT COALESCE(capital_base_operacional,0) INTO v_base FROM public.agency_settings LIMIT 1;
  v_total := v_contas + v_cias + v_div;

  RETURN QUERY SELECT
    v_contas, v_cias, v_div, v_total, COALESCE(v_base,0), v_fundo, v_taxa,
    v_total - COALESCE(v_base,0) AS diferenca,
    ABS(v_total - COALESCE(v_base,0)) < 1 AS consistente;
END;
$function$;

UPDATE public.bilhetes b
SET pago = false,
    status = CASE WHEN b.status = 'pago' THEN 'pendente'::public.ticket_status ELSE b.status END
WHERE b.status <> 'cancelado'
  AND COALESCE(b.valor_cobrado,0) > COALESCE((
    SELECT SUM(m.valor)
    FROM public.movimentacoes_capital m
    WHERE m.tipo = 'pagamento_cliente'
      AND m.bilhete_id = b.id
  ),0) + 0.01;

UPDATE public.bilhetes b
SET pago = true,
    status = CASE WHEN b.status IN ('pedido_criado','pendente','pago') THEN 'pago'::public.ticket_status ELSE b.status END
WHERE b.status <> 'cancelado'
  AND COALESCE(b.valor_cobrado,0) <= COALESCE((
    SELECT SUM(m.valor)
    FROM public.movimentacoes_capital m
    WHERE m.tipo = 'pagamento_cliente'
      AND m.bilhete_id = b.id
  ),0) + 0.01;