
CREATE OR REPLACE FUNCTION public.sincronizar_capital_base()
RETURNS TABLE(delta NUMERIC, novo_saldo_circulante NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base NUMERIC;
  v_outras_contas NUMERIC;
  v_cias NUMERIC;
  v_div NUMERIC;
  v_alvo NUMERIC;
  v_circulante_id UUID;
  v_saldo_atual NUMERIC;
  v_delta NUMERIC;
  v_user UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin pode sincronizar capital base';
  END IF;

  SELECT COALESCE(capital_base_operacional,0) INTO v_base FROM public.agency_settings LIMIT 1;
  SELECT COALESCE(SUM(saldo_inicial),0) INTO v_outras_contas
    FROM public.contas_financeiras WHERE ativa AND COALESCE(sistema,false) = false;
  SELECT COALESCE(SUM(saldo),0) INTO v_cias FROM public.companhias_aereas WHERE ativa;
  SELECT COALESCE(SUM(valor_cobrado),0) INTO v_div FROM public.bilhetes
    WHERE pago = false AND status IN ('emitido','pendente','pedido_criado');

  v_alvo := v_base - v_outras_contas - v_cias - v_div;

  SELECT id, saldo_inicial INTO v_circulante_id, v_saldo_atual
    FROM public.contas_financeiras WHERE COALESCE(sistema,false) = true LIMIT 1;

  IF v_circulante_id IS NULL THEN
    INSERT INTO public.contas_financeiras (nome, tipo, saldo_inicial, ativa, sistema)
      VALUES ('Capital Circulante', 'caixa', v_alvo, true, true)
      RETURNING id INTO v_circulante_id;
    v_saldo_atual := 0;
  ELSE
    UPDATE public.contas_financeiras SET saldo_inicial = v_alvo WHERE id = v_circulante_id;
  END IF;

  v_delta := v_alvo - v_saldo_atual;
  v_user := auth.uid();

  IF ABS(v_delta) > 0.001 THEN
    INSERT INTO public.movimentacoes_capital
      (tipo, valor, conta_destino_id, responsavel_id, observacao)
    VALUES
      ('aporte_capital', v_delta, v_circulante_id, v_user,
       'Sincronização automática do Capital Base');
  END IF;

  -- Reverte o efeito do trigger aplicar_movimentacao (que soma ao saldo)
  IF ABS(v_delta) > 0.001 THEN
    UPDATE public.contas_financeiras SET saldo_inicial = v_alvo WHERE id = v_circulante_id;
  END IF;

  RETURN QUERY SELECT v_delta, v_alvo;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sincronizar_capital_base() TO authenticated;
