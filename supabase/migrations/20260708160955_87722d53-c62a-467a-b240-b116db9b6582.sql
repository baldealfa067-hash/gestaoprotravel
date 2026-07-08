
CREATE OR REPLACE FUNCTION public.definir_capital_circulante(_novo_valor numeric)
RETURNS TABLE(delta numeric, novo_saldo numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_circulante_id UUID;
  v_saldo_atual NUMERIC;
  v_delta NUMERIC;
  v_user UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin pode definir Capital Circulante';
  END IF;

  IF _novo_valor IS NULL OR _novo_valor < 0 THEN
    RAISE EXCEPTION 'Valor inválido';
  END IF;

  v_user := auth.uid();

  SELECT id, saldo_inicial INTO v_circulante_id, v_saldo_atual
    FROM public.contas_financeiras WHERE COALESCE(sistema,false) = true LIMIT 1;

  IF v_circulante_id IS NULL THEN
    INSERT INTO public.contas_financeiras (nome, tipo, saldo_inicial, ativa, sistema)
      VALUES ('Capital Circulante', 'caixa', 0, true, true)
      RETURNING id INTO v_circulante_id;
    v_saldo_atual := 0;
  END IF;

  v_delta := _novo_valor - COALESCE(v_saldo_atual, 0);

  IF ABS(v_delta) > 0.001 THEN
    IF v_delta > 0 THEN
      INSERT INTO public.movimentacoes_capital
        (tipo, valor, conta_destino_id, responsavel_id, observacao)
      VALUES
        ('aporte_capital', v_delta, v_circulante_id, v_user,
         'Definição de Capital Circulante');
    ELSE
      INSERT INTO public.movimentacoes_capital
        (tipo, valor, conta_origem_id, responsavel_id, observacao)
      VALUES
        ('despesa_operacional', ABS(v_delta), v_circulante_id, v_user,
         'Redução manual de Capital Circulante');
    END IF;
    -- garante saldo exato (blinda arredondamentos)
    UPDATE public.contas_financeiras SET saldo_inicial = _novo_valor WHERE id = v_circulante_id;
  END IF;

  RETURN QUERY SELECT v_delta, _novo_valor;
END;
$$;

GRANT EXECUTE ON FUNCTION public.definir_capital_circulante(numeric) TO authenticated;
