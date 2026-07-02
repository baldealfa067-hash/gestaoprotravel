CREATE OR REPLACE FUNCTION public.sincronizar_capital_base()
 RETURNS TABLE(delta numeric, novo_saldo_circulante numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_base NUMERIC;
  v_circulante_id UUID;
  v_saldo_atual NUMERIC;
  v_delta NUMERIC;
  v_user UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin pode sincronizar capital';
  END IF;

  SELECT COALESCE(capital_base_operacional,0) INTO v_base FROM public.agency_settings LIMIT 1;

  SELECT id, saldo_inicial INTO v_circulante_id, v_saldo_atual
    FROM public.contas_financeiras WHERE COALESCE(sistema,false) = true LIMIT 1;

  IF v_circulante_id IS NULL THEN
    INSERT INTO public.contas_financeiras (nome, tipo, saldo_inicial, ativa, sistema)
      VALUES ('Capital Circulante', 'caixa', v_base, true, true)
      RETURNING id INTO v_circulante_id;
    v_saldo_atual := 0;
  END IF;

  v_delta := v_base - v_saldo_atual;
  v_user := auth.uid();

  IF ABS(v_delta) > 0.001 THEN
    -- registrar movimento de aporte (o trigger vai somar v_delta ao saldo)
    INSERT INTO public.movimentacoes_capital
      (tipo, valor, conta_destino_id, responsavel_id, observacao)
    VALUES
      ('aporte_capital', v_delta, v_circulante_id, v_user,
       'Ajuste de Capital inicial nas Configurações');
    -- garantir saldo exato (trigger já aplicou, mas isto blinda arredondamentos)
    UPDATE public.contas_financeiras SET saldo_inicial = v_base WHERE id = v_circulante_id;
  END IF;

  RETURN QUERY SELECT v_delta, v_base;
END;
$function$;