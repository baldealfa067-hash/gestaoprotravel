CREATE OR REPLACE FUNCTION public.bilhete_debita_companhia()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_fundo_id uuid;
  v_old_taxa numeric := 0;
  v_new_taxa numeric := 0;
  v_delta numeric := 0;
BEGIN
  v_user := auth.uid();

  -- Débito do saldo da companhia na emissão
  IF NEW.status = 'emitido'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'emitido')
     AND NEW.companhia_id IS NOT NULL
     AND COALESCE(NEW.custo, 0) > 0 THEN
    INSERT INTO public.movimentacoes_capital
      (tipo, valor, companhia_id, bilhete_id, responsavel_id, observacao, agency_id)
    VALUES
      ('emissao_bilhete', NEW.custo, NEW.companhia_id, NEW.id, v_user,
       'Emissão automática de bilhete '||COALESCE(NEW.pnr,'')||' — desconto do saldo da companhia', NEW.agency_id);
  END IF;

  -- Estorno do saldo da companhia ao cancelar um bilhete emitido
  IF TG_OP = 'UPDATE' AND OLD.status = 'emitido' AND NEW.status = 'cancelado'
     AND NEW.companhia_id IS NOT NULL AND COALESCE(NEW.custo, 0) > 0 THEN
    INSERT INTO public.movimentacoes_capital
      (tipo, valor, companhia_id, bilhete_id, responsavel_id, observacao, agency_id)
    VALUES
      ('carregamento_companhia', NEW.custo, NEW.companhia_id, NEW.id, v_user,
       'Estorno de bilhete cancelado '||COALESCE(NEW.pnr,'')||' — devolução ao saldo da companhia', NEW.agency_id);
  END IF;

  -- Lucro reconhecido na venda (qualquer estado exceto cancelado), ajustado por diferença
  IF TG_OP = 'UPDATE' AND OLD.status <> 'cancelado' THEN
    v_old_taxa := COALESCE(OLD.taxa_agencia, 0);
  END IF;
  IF NEW.status <> 'cancelado' THEN
    v_new_taxa := COALESCE(NEW.taxa_agencia, 0);
  END IF;
  v_delta := v_new_taxa - v_old_taxa;

  IF ABS(v_delta) > 0.001 THEN
    SELECT id INTO v_fundo_id FROM public.fundo_lucro WHERE agency_id = NEW.agency_id LIMIT 1;
    IF v_fundo_id IS NULL THEN
      INSERT INTO public.fundo_lucro (saldo, agency_id) VALUES (v_delta, NEW.agency_id);
    ELSE
      UPDATE public.fundo_lucro SET saldo = saldo + v_delta, updated_at = now() WHERE id = v_fundo_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Recalcular o fundo de lucro de cada agência a partir dos bilhetes não cancelados
UPDATE public.fundo_lucro f
SET saldo = COALESCE((
      SELECT SUM(b.taxa_agencia) FROM public.bilhetes b
      WHERE b.agency_id = f.agency_id AND b.status <> 'cancelado'
    ), 0),
    updated_at = now();