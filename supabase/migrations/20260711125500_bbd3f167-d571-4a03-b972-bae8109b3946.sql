DROP FUNCTION IF EXISTS public.ajustar_capital(text, numeric, text, text);
DROP FUNCTION IF EXISTS public.ajustar_capital(text, numeric, text);

CREATE OR REPLACE FUNCTION public.ajustar_capital(
  _target text,
  _novo_valor numeric,
  _motivo text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current numeric;
  v_delta numeric;
  v_user uuid;
  v_conta_id uuid;
  v_cia_id uuid;
  v_fundo_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin pode ajustar capital';
  END IF;

  IF _novo_valor IS NULL OR _novo_valor < 0 THEN
    RAISE EXCEPTION 'Valor inválido';
  END IF;

  IF _motivo IS NULL OR length(trim(_motivo)) < 3 THEN
    RAISE EXCEPTION 'Motivo obrigatório';
  END IF;

  v_user := auth.uid();

  IF _target = 'caixa' THEN
    SELECT id, COALESCE(saldo_inicial, 0) INTO v_conta_id, v_current
      FROM public.contas_financeiras
      WHERE COALESCE(sistema, false) = true
      LIMIT 1;

    IF v_conta_id IS NULL THEN
      INSERT INTO public.contas_financeiras (nome, tipo, saldo_inicial, ativa, sistema)
      VALUES ('Capital Circulante', 'caixa', 0, true, true)
      RETURNING id, saldo_inicial INTO v_conta_id, v_current;
    END IF;

    v_delta := _novo_valor - COALESCE(v_current, 0);

    IF v_delta > 0 THEN
      INSERT INTO public.movimentacoes_capital(tipo, valor, conta_destino_id, responsavel_id, observacao)
      VALUES ('aporte_capital', v_delta, v_conta_id, v_user, 'Ajuste manual (disponível): ' || trim(_motivo));
    ELSIF v_delta < 0 THEN
      INSERT INTO public.movimentacoes_capital(tipo, valor, conta_origem_id, responsavel_id, observacao)
      VALUES ('despesa_operacional', ABS(v_delta), v_conta_id, v_user, 'Ajuste manual (disponível): ' || trim(_motivo));
    END IF;

    UPDATE public.contas_financeiras SET saldo_inicial = _novo_valor WHERE id = v_conta_id;

  ELSIF _target = 'companhias' THEN
    SELECT COALESCE(SUM(saldo), 0) INTO v_current
      FROM public.companhias_aereas WHERE ativa;
    v_delta := _novo_valor - COALESCE(v_current, 0);

    IF ABS(v_delta) > 0.001 THEN
      SELECT id INTO v_cia_id FROM public.companhias_aereas
        WHERE ativa ORDER BY nome LIMIT 1;
      IF v_cia_id IS NULL THEN
        RAISE EXCEPTION 'Nenhuma companhia ativa';
      END IF;

      UPDATE public.companhias_aereas SET saldo = saldo + v_delta WHERE id = v_cia_id;
      INSERT INTO public.movimentacoes_capital(tipo, valor, companhia_id, responsavel_id, observacao)
      VALUES ('despesa_operacional', ABS(v_delta), v_cia_id, v_user,
              'Ajuste manual (companhias, delta ' || v_delta::text || '): ' || trim(_motivo));
    END IF;

  ELSIF _target = 'lucro' THEN
    SELECT id, saldo INTO v_fundo_id, v_current FROM public.fundo_lucro LIMIT 1;
    IF v_fundo_id IS NULL THEN
      INSERT INTO public.fundo_lucro(saldo) VALUES (_novo_valor) RETURNING id INTO v_fundo_id;
      v_current := 0;
    ELSE
      UPDATE public.fundo_lucro SET saldo = _novo_valor, updated_at = now() WHERE id = v_fundo_id;
    END IF;

    v_delta := _novo_valor - COALESCE(v_current, 0);
    IF ABS(v_delta) > 0.001 THEN
      INSERT INTO public.movimentacoes_capital(tipo, valor, responsavel_id, observacao)
      VALUES ('despesa_operacional', ABS(v_delta), v_user,
              'Ajuste manual (lucro, delta ' || v_delta::text || '): ' || trim(_motivo));
    END IF;

  ELSE
    RAISE EXCEPTION 'Alvo inválido';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ajustar_capital(text, numeric, text) TO authenticated;