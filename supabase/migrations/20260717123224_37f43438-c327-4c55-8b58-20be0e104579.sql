-- Remove triggers duplicados que estavam a aplicar a taxa de mudança 2x/3x
DROP TRIGGER IF EXISTS trg_aplicar_mudanca_rota_ins ON public.mudancas_rota;
DROP TRIGGER IF EXISTS trg_aplicar_mudanca_rota_upd ON public.mudancas_rota;
-- Mantém apenas trg_aplicar_mudanca_rota (AFTER INSERT OR UPDATE)

-- Remove trigger duplicado de updated_at em bilhetes
DROP TRIGGER IF EXISTS trg_set_updated_at ON public.bilhetes;
-- Mantém trg_bilhetes_updated

-- Remove trigger duplicado de sync_reserva_on_bilhete_emitido
DROP TRIGGER IF EXISTS trg_sync_reserva_bilhete_emitido ON public.bilhetes;
-- Mantém trg_sync_reserva_on_bilhete_emitido