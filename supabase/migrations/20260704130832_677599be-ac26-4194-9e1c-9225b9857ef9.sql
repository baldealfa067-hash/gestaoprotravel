
CREATE OR REPLACE FUNCTION public.bilhete_debita_companhia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
BEGIN
  v_user := auth.uid();

  -- Transition to emitido: deduct cost from companhia
  IF NEW.status = 'emitido'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'emitido')
     AND NEW.companhia_id IS NOT NULL
     AND COALESCE(NEW.custo, 0) > 0 THEN
    INSERT INTO public.movimentacoes_capital
      (tipo, valor, companhia_id, bilhete_id, responsavel_id, observacao)
    VALUES
      ('emissao_bilhete', NEW.custo, NEW.companhia_id, NEW.id, v_user,
       'Emissão automática de bilhete '||COALESCE(NEW.pnr,'')||' — desconto do saldo da companhia');
  END IF;

  -- Reversal: emitido -> cancelado, return cost to companhia
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'emitido'
     AND NEW.status = 'cancelado'
     AND NEW.companhia_id IS NOT NULL
     AND COALESCE(NEW.custo, 0) > 0 THEN
    INSERT INTO public.movimentacoes_capital
      (tipo, valor, companhia_id, conta_origem_id, bilhete_id, responsavel_id, observacao)
    VALUES
      ('carregamento_companhia', NEW.custo, NEW.companhia_id, NULL, NEW.id, v_user,
       'Estorno de bilhete cancelado '||COALESCE(NEW.pnr,'')||' — devolução ao saldo da companhia');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bilhete_debita_companhia ON public.bilhetes;
CREATE TRIGGER trg_bilhete_debita_companhia
AFTER INSERT OR UPDATE OF status ON public.bilhetes
FOR EACH ROW EXECUTE FUNCTION public.bilhete_debita_companhia();
