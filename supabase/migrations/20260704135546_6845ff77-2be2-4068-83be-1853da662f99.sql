
-- Wire up missing triggers to existing functions

-- 1. Apply capital movements
DROP TRIGGER IF EXISTS trg_aplicar_movimentacao ON public.movimentacoes_capital;
CREATE TRIGGER trg_aplicar_movimentacao
  AFTER INSERT ON public.movimentacoes_capital
  FOR EACH ROW EXECUTE FUNCTION public.aplicar_movimentacao();

-- 2. Auto-calc taxa on bilhetes
DROP TRIGGER IF EXISTS trg_bilhete_auto_taxa ON public.bilhetes;
CREATE TRIGGER trg_bilhete_auto_taxa
  BEFORE INSERT OR UPDATE ON public.bilhetes
  FOR EACH ROW EXECUTE FUNCTION public.bilhete_auto_taxa();

-- 3. Debit companhia on emission / refund on cancel
DROP TRIGGER IF EXISTS trg_bilhete_debita_companhia ON public.bilhetes;
CREATE TRIGGER trg_bilhete_debita_companhia
  AFTER INSERT OR UPDATE ON public.bilhetes
  FOR EACH ROW EXECUTE FUNCTION public.bilhete_debita_companhia();

-- 4. Sync reserva when bilhete emitted
DROP TRIGGER IF EXISTS trg_sync_reserva_bilhete_emitido ON public.bilhetes;
CREATE TRIGGER trg_sync_reserva_bilhete_emitido
  AFTER UPDATE ON public.bilhetes
  FOR EACH ROW EXECUTE FUNCTION public.sync_reserva_on_bilhete_emitido();

-- 5. updated_at triggers
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bilhetes','reservas','clientes','companhias_aereas',
    'contas_financeiras','agency_settings','profiles',
    'movimentacoes_capital','fundo_lucro'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at ON public.%I;', t);
    EXECUTE format(
      'CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      t
    );
  END LOOP;
END $$;
