DROP TRIGGER IF EXISTS trg_aplicar_mov ON public.movimentacoes_capital;
DROP TRIGGER IF EXISTS trg_aplicar_movimentacao ON public.movimentacoes_capital;

CREATE TRIGGER trg_aplicar_movimentacao
AFTER INSERT ON public.movimentacoes_capital
FOR EACH ROW EXECUTE FUNCTION public.aplicar_movimentacao();