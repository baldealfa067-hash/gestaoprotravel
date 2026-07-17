
CREATE OR REPLACE FUNCTION public.aplicar_mudanca_rota()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.bilhete_id IS NULL AND NEW.bilhete_id IS NOT NULL THEN
      NULL;
    ELSIF OLD.bilhete_id = NEW.bilhete_id THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.bilhete_id IS NOT NULL THEN
    UPDATE public.bilhetes
      SET taxa_mudancas_total = COALESCE(taxa_mudancas_total,0) + NEW.taxa_mudanca,
          valor_cobrado = COALESCE(valor_cobrado,0) + NEW.taxa_mudanca,
          origem = COALESCE(split_part(NEW.rota_nova, ' → ', 1), origem),
          destino = COALESCE(split_part(NEW.rota_nova, ' → ', 2), destino),
          classe = COALESCE(NEW.classe_nova, classe),
          data_viagem = COALESCE(NEW.data_viagem_nova, data_viagem),
          pago = false,
          updated_at = now()
      WHERE id = NEW.bilhete_id;
  END IF;

  IF NEW.reserva_id IS NOT NULL THEN
    UPDATE public.reservas
      SET origem = COALESCE(split_part(NEW.rota_nova, ' → ', 1), origem),
          destino = COALESCE(split_part(NEW.rota_nova, ' → ', 2), destino),
          classe = COALESCE(NEW.classe_nova::text, classe),
          data_viagem = COALESCE(NEW.data_viagem_nova, data_viagem),
          updated_at = now()
      WHERE id = NEW.reserva_id;
  END IF;

  RETURN NEW;
END;
$function$;
