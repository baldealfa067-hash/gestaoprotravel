-- 0) Deduplicar agency_settings (manter a mais antiga)
DELETE FROM public.agency_settings
WHERE id <> (SELECT id FROM public.agency_settings ORDER BY created_at LIMIT 1);

-- 1) Coluna agency_id em todas as tabelas
ALTER TABLE public.profiles              ADD COLUMN IF NOT EXISTS agency_id uuid;
ALTER TABLE public.user_roles            ADD COLUMN IF NOT EXISTS agency_id uuid;
ALTER TABLE public.clientes              ADD COLUMN IF NOT EXISTS agency_id uuid;
ALTER TABLE public.bilhetes              ADD COLUMN IF NOT EXISTS agency_id uuid;
ALTER TABLE public.reservas              ADD COLUMN IF NOT EXISTS agency_id uuid;
ALTER TABLE public.companhias_aereas     ADD COLUMN IF NOT EXISTS agency_id uuid;
ALTER TABLE public.contas_financeiras    ADD COLUMN IF NOT EXISTS agency_id uuid;
ALTER TABLE public.fundo_lucro           ADD COLUMN IF NOT EXISTS agency_id uuid;
ALTER TABLE public.movimentacoes_capital ADD COLUMN IF NOT EXISTS agency_id uuid;
ALTER TABLE public.mudancas_rota         ADD COLUMN IF NOT EXISTS agency_id uuid;

-- 2) Backfill para a agência existente
DO $$
DECLARE v_ag uuid;
BEGIN
  SELECT id INTO v_ag FROM public.agency_settings ORDER BY created_at LIMIT 1;
  UPDATE public.profiles              SET agency_id = v_ag WHERE agency_id IS NULL;
  UPDATE public.user_roles            SET agency_id = v_ag WHERE agency_id IS NULL;
  UPDATE public.clientes              SET agency_id = v_ag WHERE agency_id IS NULL;
  UPDATE public.bilhetes              SET agency_id = v_ag WHERE agency_id IS NULL;
  UPDATE public.reservas              SET agency_id = v_ag WHERE agency_id IS NULL;
  UPDATE public.companhias_aereas     SET agency_id = v_ag WHERE agency_id IS NULL;
  UPDATE public.contas_financeiras    SET agency_id = v_ag WHERE agency_id IS NULL;
  UPDATE public.fundo_lucro           SET agency_id = v_ag WHERE agency_id IS NULL;
  UPDATE public.movimentacoes_capital SET agency_id = v_ag WHERE agency_id IS NULL;
  UPDATE public.mudancas_rota         SET agency_id = v_ag WHERE agency_id IS NULL;
END $$;

-- 3) FKs + NOT NULL
ALTER TABLE public.profiles              ADD CONSTRAINT profiles_agency_fk              FOREIGN KEY (agency_id) REFERENCES public.agency_settings(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles            ADD CONSTRAINT user_roles_agency_fk            FOREIGN KEY (agency_id) REFERENCES public.agency_settings(id) ON DELETE CASCADE;
ALTER TABLE public.clientes              ADD CONSTRAINT clientes_agency_fk              FOREIGN KEY (agency_id) REFERENCES public.agency_settings(id) ON DELETE CASCADE;
ALTER TABLE public.bilhetes              ADD CONSTRAINT bilhetes_agency_fk              FOREIGN KEY (agency_id) REFERENCES public.agency_settings(id) ON DELETE CASCADE;
ALTER TABLE public.reservas              ADD CONSTRAINT reservas_agency_fk              FOREIGN KEY (agency_id) REFERENCES public.agency_settings(id) ON DELETE CASCADE;
ALTER TABLE public.companhias_aereas     ADD CONSTRAINT companhias_agency_fk            FOREIGN KEY (agency_id) REFERENCES public.agency_settings(id) ON DELETE CASCADE;
ALTER TABLE public.contas_financeiras    ADD CONSTRAINT contas_agency_fk                FOREIGN KEY (agency_id) REFERENCES public.agency_settings(id) ON DELETE CASCADE;
ALTER TABLE public.fundo_lucro           ADD CONSTRAINT fundo_agency_fk                 FOREIGN KEY (agency_id) REFERENCES public.agency_settings(id) ON DELETE CASCADE;
ALTER TABLE public.movimentacoes_capital ADD CONSTRAINT movimentacoes_agency_fk         FOREIGN KEY (agency_id) REFERENCES public.agency_settings(id) ON DELETE CASCADE;
ALTER TABLE public.mudancas_rota         ADD CONSTRAINT mudancas_agency_fk              FOREIGN KEY (agency_id) REFERENCES public.agency_settings(id) ON DELETE CASCADE;

ALTER TABLE public.profiles              ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE public.user_roles            ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE public.clientes              ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE public.bilhetes              ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE public.reservas              ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE public.companhias_aereas     ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE public.contas_financeiras    ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE public.fundo_lucro           ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE public.movimentacoes_capital ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE public.mudancas_rota         ALTER COLUMN agency_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fundo_lucro_agency_uidx ON public.fundo_lucro(agency_id);

-- 4) Função de tenant atual
CREATE OR REPLACE FUNCTION public.current_agency_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT agency_id FROM public.profiles WHERE id = auth.uid()
$$;
GRANT EXECUTE ON FUNCTION public.current_agency_id() TO authenticated;

-- Defaults automáticos
ALTER TABLE public.clientes              ALTER COLUMN agency_id SET DEFAULT public.current_agency_id();
ALTER TABLE public.bilhetes              ALTER COLUMN agency_id SET DEFAULT public.current_agency_id();
ALTER TABLE public.reservas              ALTER COLUMN agency_id SET DEFAULT public.current_agency_id();
ALTER TABLE public.companhias_aereas     ALTER COLUMN agency_id SET DEFAULT public.current_agency_id();
ALTER TABLE public.contas_financeiras    ALTER COLUMN agency_id SET DEFAULT public.current_agency_id();
ALTER TABLE public.movimentacoes_capital ALTER COLUMN agency_id SET DEFAULT public.current_agency_id();
ALTER TABLE public.mudancas_rota         ALTER COLUMN agency_id SET DEFAULT public.current_agency_id();

-- 5) Recriar políticas RLS com isolamento por agência
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname='public' AND tablename IN (
      'agency_settings','profiles','user_roles','clientes','bilhetes','reservas',
      'companhias_aereas','contas_financeiras','fundo_lucro','movimentacoes_capital','mudancas_rota')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- agency_settings
CREATE POLICY ag_select ON public.agency_settings FOR SELECT TO authenticated USING (id = public.current_agency_id());
CREATE POLICY ag_update ON public.agency_settings FOR UPDATE TO authenticated USING (id = public.current_agency_id() AND public.has_role(auth.uid(),'admin')) WITH CHECK (id = public.current_agency_id() AND public.has_role(auth.uid(),'admin'));

-- profiles
CREATE POLICY pr_select ON public.profiles FOR SELECT TO authenticated USING (agency_id = public.current_agency_id() AND (id = auth.uid() OR public.has_role(auth.uid(),'admin')));
CREATE POLICY pr_update ON public.profiles FOR UPDATE TO authenticated USING (agency_id = public.current_agency_id() AND (id = auth.uid() OR public.has_role(auth.uid(),'admin'))) WITH CHECK (agency_id = public.current_agency_id());
CREATE POLICY pr_delete ON public.profiles FOR DELETE TO authenticated USING (agency_id = public.current_agency_id() AND public.has_role(auth.uid(),'admin'));

-- user_roles
CREATE POLICY ur_select ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR (agency_id = public.current_agency_id() AND public.has_role(auth.uid(),'admin')));

-- clientes
CREATE POLICY cl_select ON public.clientes FOR SELECT TO authenticated USING (agency_id = public.current_agency_id());
CREATE POLICY cl_insert ON public.clientes FOR INSERT TO authenticated WITH CHECK (agency_id = public.current_agency_id());
CREATE POLICY cl_update ON public.clientes FOR UPDATE TO authenticated USING (agency_id = public.current_agency_id()) WITH CHECK (agency_id = public.current_agency_id());
CREATE POLICY cl_delete ON public.clientes FOR DELETE TO authenticated USING (agency_id = public.current_agency_id() AND public.has_role(auth.uid(),'admin'));

-- bilhetes
CREATE POLICY bi_select ON public.bilhetes FOR SELECT TO authenticated USING (agency_id = public.current_agency_id());
CREATE POLICY bi_insert ON public.bilhetes FOR INSERT TO authenticated WITH CHECK (agency_id = public.current_agency_id() AND (vendedor_id = auth.uid() OR public.has_role(auth.uid(),'admin')));
CREATE POLICY bi_update ON public.bilhetes FOR UPDATE TO authenticated USING (agency_id = public.current_agency_id() AND (vendedor_id = auth.uid() OR public.has_role(auth.uid(),'admin'))) WITH CHECK (agency_id = public.current_agency_id());
CREATE POLICY bi_delete ON public.bilhetes FOR DELETE TO authenticated USING (agency_id = public.current_agency_id() AND public.has_role(auth.uid(),'admin'));

-- reservas
CREATE POLICY rs_select ON public.reservas FOR SELECT TO authenticated USING (agency_id = public.current_agency_id() AND (user_id = auth.uid() OR public.has_role(auth.uid(),'admin')));
CREATE POLICY rs_insert ON public.reservas FOR INSERT TO authenticated WITH CHECK (agency_id = public.current_agency_id() AND (user_id = auth.uid() OR public.has_role(auth.uid(),'admin')));
CREATE POLICY rs_update ON public.reservas FOR UPDATE TO authenticated USING (agency_id = public.current_agency_id() AND (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))) WITH CHECK (agency_id = public.current_agency_id());
CREATE POLICY rs_delete ON public.reservas FOR DELETE TO authenticated USING (agency_id = public.current_agency_id() AND (user_id = auth.uid() OR public.has_role(auth.uid(),'admin')));

-- companhias_aereas
CREATE POLICY ca_select ON public.companhias_aereas FOR SELECT TO authenticated USING (agency_id = public.current_agency_id());
CREATE POLICY ca_all ON public.companhias_aereas FOR ALL TO authenticated USING (agency_id = public.current_agency_id() AND public.has_role(auth.uid(),'admin')) WITH CHECK (agency_id = public.current_agency_id() AND public.has_role(auth.uid(),'admin'));

-- contas_financeiras
CREATE POLICY cf_select ON public.contas_financeiras FOR SELECT TO authenticated USING (agency_id = public.current_agency_id());
CREATE POLICY cf_all ON public.contas_financeiras FOR ALL TO authenticated USING (agency_id = public.current_agency_id() AND public.has_role(auth.uid(),'admin')) WITH CHECK (agency_id = public.current_agency_id() AND public.has_role(auth.uid(),'admin'));

-- fundo_lucro
CREATE POLICY fl_select ON public.fundo_lucro FOR SELECT TO authenticated USING (agency_id = public.current_agency_id());
CREATE POLICY fl_update ON public.fundo_lucro FOR UPDATE TO authenticated USING (agency_id = public.current_agency_id() AND public.has_role(auth.uid(),'admin')) WITH CHECK (agency_id = public.current_agency_id());

-- movimentacoes_capital
CREATE POLICY mc_select ON public.movimentacoes_capital FOR SELECT TO authenticated USING (agency_id = public.current_agency_id());
CREATE POLICY mc_insert ON public.movimentacoes_capital FOR INSERT TO authenticated WITH CHECK (agency_id = public.current_agency_id() AND responsavel_id = auth.uid());
CREATE POLICY mc_update ON public.movimentacoes_capital FOR UPDATE TO authenticated USING (agency_id = public.current_agency_id() AND public.has_role(auth.uid(),'admin'));
CREATE POLICY mc_delete ON public.movimentacoes_capital FOR DELETE TO authenticated USING (agency_id = public.current_agency_id() AND public.has_role(auth.uid(),'admin'));

-- mudancas_rota
CREATE POLICY mr_select ON public.mudancas_rota FOR SELECT TO authenticated USING (agency_id = public.current_agency_id());
CREATE POLICY mr_insert ON public.mudancas_rota FOR INSERT TO authenticated WITH CHECK (agency_id = public.current_agency_id() AND (public.has_role(auth.uid(),'admin') OR responsavel_id = auth.uid()));
CREATE POLICY mr_update ON public.mudancas_rota FOR UPDATE TO authenticated USING (agency_id = public.current_agency_id() AND public.has_role(auth.uid(),'admin')) WITH CHECK (agency_id = public.current_agency_id());
CREATE POLICY mr_delete ON public.mudancas_rota FOR DELETE TO authenticated USING (agency_id = public.current_agency_id() AND public.has_role(auth.uid(),'admin'));

-- 6) Novo utilizador: cria agência própria ou entra na agência indicada
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_agency uuid;
  v_role public.app_role;
BEGIN
  v_agency := NULLIF(NEW.raw_user_meta_data->>'agency_id','')::uuid;

  IF v_agency IS NULL THEN
    INSERT INTO public.agency_settings (agency_name, currency)
    VALUES (COALESCE(NULLIF(NEW.raw_user_meta_data->>'agency_name',''), 'Minha Agência'), 'XOF')
    RETURNING id INTO v_agency;

    v_role := 'admin';

    INSERT INTO public.contas_financeiras (nome, tipo, saldo_inicial, ativa, sistema, agency_id)
    VALUES ('Capital Circulante', 'caixa', 0, true, true, v_agency);
    INSERT INTO public.fundo_lucro (saldo, agency_id) VALUES (0, v_agency);
  ELSE
    v_role := CASE WHEN NEW.raw_user_meta_data->>'role' = 'admin' THEN 'admin' ELSE 'vendedor' END;
  END IF;

  INSERT INTO public.profiles (id, full_name, phone, cargo, agency_id)
  VALUES (NEW.id,
          COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
          NEW.raw_user_meta_data->>'phone',
          NEW.raw_user_meta_data->>'cargo',
          v_agency);

  INSERT INTO public.user_roles (user_id, role, agency_id) VALUES (NEW.id, v_role, v_agency);
  RETURN NEW;
END;
$$;

-- 7) Funções financeiras passam a operar dentro da agência
CREATE OR REPLACE FUNCTION public.aplicar_movimentacao()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_custo NUMERIC; v_taxa NUMERIC; v_taxa_mud NUMERIC; v_lucro NUMERIC; v_total NUMERIC;
  v_credito_lucro NUMERIC; v_fundo_id UUID; v_saldo_origem NUMERIC; v_pago_ate_agora NUMERIC; v_conta_sistema UUID;
BEGIN
  IF NEW.valor IS NULL OR NEW.valor < 0 THEN
    RAISE EXCEPTION 'Valor inválido na movimentação';
  END IF;

  IF NEW.tipo = 'aporte_capital' THEN
    IF NEW.conta_destino_id IS NOT NULL THEN
      UPDATE public.contas_financeiras SET saldo_inicial = saldo_inicial + NEW.valor WHERE id = NEW.conta_destino_id;
    END IF;

  ELSIF NEW.tipo = 'carregamento_companhia' THEN
    IF COALESCE(NEW.aplicar_saldo, true) AND NEW.companhia_id IS NOT NULL THEN
      UPDATE public.companhias_aereas SET saldo = saldo + NEW.valor, ultimo_carregamento = now() WHERE id = NEW.companhia_id;
    END IF;

  ELSIF NEW.tipo = 'pagamento_companhia' THEN
    IF NEW.companhia_id IS NOT NULL THEN
      UPDATE public.companhias_aereas SET saldo = saldo + NEW.valor, updated_at = now() WHERE id = NEW.companhia_id;
    END IF;

  ELSIF NEW.tipo = 'emissao_bilhete' THEN
    IF NEW.companhia_id IS NOT NULL THEN
      UPDATE public.companhias_aereas SET saldo = saldo - NEW.valor, ultimo_consumo = now() WHERE id = NEW.companhia_id;
    END IF;

  ELSIF NEW.tipo = 'adianto_mudanca_rota' THEN
    IF NEW.conta_origem_id IS NULL THEN
      SELECT id INTO NEW.conta_origem_id FROM public.contas_financeiras
        WHERE COALESCE(sistema,false) = true AND ativa = true AND agency_id = NEW.agency_id LIMIT 1;
    END IF;
    IF NEW.conta_origem_id IS NULL THEN
      RAISE EXCEPTION 'Capital Circulante não configurado';
    END IF;
    SELECT saldo_inicial INTO v_saldo_origem FROM public.contas_financeiras WHERE id = NEW.conta_origem_id FOR UPDATE;
    IF v_saldo_origem < NEW.valor THEN
      RAISE EXCEPTION 'Saldo insuficiente no Capital Circulante para adiantar mudança de rota';
    END IF;
    UPDATE public.contas_financeiras SET saldo_inicial = saldo_inicial - NEW.valor WHERE id = NEW.conta_origem_id;

  ELSIF NEW.tipo = 'pagamento_taxa_mudanca' THEN
    IF NEW.conta_destino_id IS NULL THEN
      SELECT id INTO v_conta_sistema FROM public.contas_financeiras
        WHERE COALESCE(sistema,false) = true AND ativa = true AND agency_id = NEW.agency_id LIMIT 1;
      NEW.conta_destino_id := v_conta_sistema;
    END IF;
    IF NEW.conta_destino_id IS NOT NULL THEN
      UPDATE public.contas_financeiras SET saldo_inicial = saldo_inicial + NEW.valor WHERE id = NEW.conta_destino_id;
    END IF;
    IF NEW.bilhete_id IS NOT NULL THEN
      SELECT valor_cobrado INTO v_total FROM public.bilhetes WHERE id = NEW.bilhete_id;
      SELECT COALESCE(SUM(valor),0) INTO v_pago_ate_agora
        FROM public.movimentacoes_capital
        WHERE bilhete_id = NEW.bilhete_id AND tipo IN ('pagamento_cliente','pagamento_taxa_mudanca');
      IF v_total IS NOT NULL AND v_total > 0 AND v_pago_ate_agora + NEW.valor + 0.01 >= v_total THEN
        UPDATE public.bilhetes
          SET pago = true,
              status = CASE WHEN status IN ('pedido_criado','pendente','pago') THEN 'pago'::public.ticket_status ELSE status END
          WHERE id = NEW.bilhete_id;
      END IF;
    END IF;

  ELSIF NEW.tipo = 'pagamento_cliente' THEN
    v_credito_lucro := 0;
    IF NEW.bilhete_id IS NOT NULL THEN
      SELECT custo, taxa_agencia, COALESCE(taxa_mudancas_total,0), valor_cobrado
        INTO v_custo, v_taxa, v_taxa_mud, v_total
      FROM public.bilhetes WHERE id = NEW.bilhete_id;
      v_lucro := COALESCE(v_taxa,0) + COALESCE(v_taxa_mud,0);
      IF v_custo IS NOT NULL AND (v_custo + v_lucro) > 0 THEN
        v_credito_lucro := ROUND(NEW.valor * (v_lucro / (v_custo + v_lucro)), 2);
      END IF;
    END IF;

    IF v_credito_lucro > 0 THEN
      SELECT id INTO v_fundo_id FROM public.fundo_lucro WHERE agency_id = NEW.agency_id LIMIT 1;
      IF v_fundo_id IS NULL THEN
        INSERT INTO public.fundo_lucro (saldo, agency_id) VALUES (v_credito_lucro, NEW.agency_id);
      ELSE
        UPDATE public.fundo_lucro SET saldo = saldo + v_credito_lucro, updated_at = now() WHERE id = v_fundo_id;
      END IF;
    END IF;

    IF NEW.bilhete_id IS NOT NULL AND v_total IS NOT NULL AND v_total > 0 THEN
      SELECT COALESCE(SUM(valor),0) INTO v_pago_ate_agora
        FROM public.movimentacoes_capital
        WHERE bilhete_id = NEW.bilhete_id AND tipo IN ('pagamento_cliente','pagamento_taxa_mudanca');
      IF v_pago_ate_agora + NEW.valor + 0.01 >= v_total THEN
        UPDATE public.bilhetes
          SET pago = true,
              status = CASE WHEN status IN ('pedido_criado','pendente','pago') THEN 'pago'::public.ticket_status ELSE status END
          WHERE id = NEW.bilhete_id;
      ELSE
        UPDATE public.bilhetes
          SET pago = false,
              status = CASE WHEN status = 'pago' THEN 'pendente'::public.ticket_status ELSE status END
          WHERE id = NEW.bilhete_id;
      END IF;
    END IF;

  ELSIF NEW.tipo = 'transferencia_lucro' THEN
    IF NEW.conta_origem_id IS NOT NULL THEN
      UPDATE public.contas_financeiras SET saldo_inicial = saldo_inicial - NEW.valor WHERE id = NEW.conta_origem_id;
    END IF;
    SELECT id INTO v_fundo_id FROM public.fundo_lucro WHERE agency_id = NEW.agency_id LIMIT 1;
    IF v_fundo_id IS NULL THEN
      INSERT INTO public.fundo_lucro (saldo, agency_id) VALUES (NEW.valor, NEW.agency_id);
    ELSE
      UPDATE public.fundo_lucro SET saldo = saldo + NEW.valor, updated_at = now() WHERE id = v_fundo_id;
    END IF;

  ELSIF NEW.tipo = 'despesa_operacional' THEN
    IF NEW.conta_origem_id IS NOT NULL THEN
      UPDATE public.contas_financeiras SET saldo_inicial = saldo_inicial - NEW.valor WHERE id = NEW.conta_origem_id;
    END IF;

  ELSIF NEW.tipo = 'transferencia_interna' THEN
    IF NEW.conta_origem_id IS NOT NULL THEN
      UPDATE public.contas_financeiras SET saldo_inicial = saldo_inicial - NEW.valor WHERE id = NEW.conta_origem_id;
    END IF;
    IF NEW.conta_destino_id IS NOT NULL THEN
      UPDATE public.contas_financeiras SET saldo_inicial = saldo_inicial + NEW.valor WHERE id = NEW.conta_destino_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.aplicar_mudanca_rota()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_conta_sistema UUID;
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

    IF COALESCE(NEW.taxa_mudanca,0) > 0 THEN
      SELECT id INTO v_conta_sistema FROM public.contas_financeiras
        WHERE COALESCE(sistema,false) = true AND ativa = true AND agency_id = NEW.agency_id LIMIT 1;
      IF v_conta_sistema IS NULL THEN
        RAISE EXCEPTION 'Capital Circulante não configurado — não é possível adiantar a mudança';
      END IF;
      INSERT INTO public.movimentacoes_capital
        (tipo, valor, conta_origem_id, bilhete_id, responsavel_id, observacao, agency_id)
      VALUES
        ('adianto_mudanca_rota', NEW.taxa_mudanca, v_conta_sistema, NEW.bilhete_id, NEW.responsavel_id,
         'Adiantamento mudança rota: ' || COALESCE(NEW.rota_antiga,'?') || ' → ' || COALESCE(NEW.rota_nova,'?'),
         NEW.agency_id);
    END IF;
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
$$;

CREATE OR REPLACE FUNCTION public.registar_carregamento_por_saldo_companhia()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_delta numeric; v_capital_id uuid; v_saldo_capital numeric;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF COALESCE(NEW.modo, 'saldo') = 'credito' THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    v_delta := COALESCE(NEW.saldo, 0);
  ELSE
    v_delta := COALESCE(NEW.saldo, 0) - COALESCE(OLD.saldo, 0);
  END IF;
  IF v_delta <= 0 THEN RETURN NEW; END IF;

  SELECT id, saldo_inicial INTO v_capital_id, v_saldo_capital
  FROM public.contas_financeiras
  WHERE COALESCE(sistema, false) = true AND ativa = true AND agency_id = NEW.agency_id
  ORDER BY created_at LIMIT 1 FOR UPDATE;

  IF v_capital_id IS NULL THEN
    RAISE EXCEPTION 'Conta Capital Circulante não encontrada';
  END IF;

  INSERT INTO public.movimentacoes_capital
    (tipo, valor, conta_origem_id, companhia_id, responsavel_id, observacao, aplicar_saldo, agency_id)
  VALUES
    ('carregamento_companhia', v_delta, v_capital_id, NEW.id, auth.uid(),
     CASE WHEN TG_OP = 'INSERT' THEN 'Carregamento inicial registado ao criar companhia'
          ELSE 'Carregamento registado ao aumentar saldo da companhia' END,
     false, NEW.agency_id);

  UPDATE public.companhias_aereas SET ultimo_carregamento = now() WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.definir_capital_circulante(_novo_valor numeric)
RETURNS TABLE(delta numeric, novo_saldo numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_circulante_id UUID; v_saldo_atual NUMERIC; v_delta NUMERIC; v_user UUID; v_ag UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin pode definir Capital Circulante';
  END IF;
  IF _novo_valor IS NULL OR _novo_valor < 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;

  v_user := auth.uid();
  v_ag := public.current_agency_id();

  SELECT id, saldo_inicial INTO v_circulante_id, v_saldo_atual
    FROM public.contas_financeiras WHERE COALESCE(sistema,false) = true AND agency_id = v_ag LIMIT 1;

  IF v_circulante_id IS NULL THEN
    INSERT INTO public.contas_financeiras (nome, tipo, saldo_inicial, ativa, sistema, agency_id)
      VALUES ('Capital Circulante', 'caixa', 0, true, true, v_ag)
      RETURNING id INTO v_circulante_id;
    v_saldo_atual := 0;
  END IF;

  v_delta := _novo_valor - COALESCE(v_saldo_atual, 0);

  IF ABS(v_delta) > 0.001 THEN
    IF v_delta > 0 THEN
      INSERT INTO public.movimentacoes_capital (tipo, valor, conta_destino_id, responsavel_id, observacao, agency_id)
      VALUES ('aporte_capital', v_delta, v_circulante_id, v_user, 'Definição de Capital Circulante', v_ag);
    ELSE
      INSERT INTO public.movimentacoes_capital (tipo, valor, conta_origem_id, responsavel_id, observacao, agency_id)
      VALUES ('despesa_operacional', ABS(v_delta), v_circulante_id, v_user, 'Redução manual de Capital Circulante', v_ag);
    END IF;
    UPDATE public.contas_financeiras SET saldo_inicial = _novo_valor WHERE id = v_circulante_id;
  END IF;

  RETURN QUERY SELECT v_delta, _novo_valor;
END;
$$;

CREATE OR REPLACE FUNCTION public.ajustar_capital(_target text, _novo_valor numeric, _motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_current numeric; v_delta numeric; v_user uuid; v_conta_id uuid; v_cia_id uuid; v_fundo_id uuid; v_ag uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Apenas admin pode ajustar capital'; END IF;
  IF _novo_valor IS NULL OR _novo_valor < 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  IF _motivo IS NULL OR length(trim(_motivo)) < 3 THEN RAISE EXCEPTION 'Motivo obrigatório'; END IF;

  v_user := auth.uid();
  v_ag := public.current_agency_id();

  IF _target = 'caixa' THEN
    SELECT id, COALESCE(saldo_inicial, 0) INTO v_conta_id, v_current
      FROM public.contas_financeiras WHERE COALESCE(sistema, false) = true AND agency_id = v_ag LIMIT 1;
    IF v_conta_id IS NULL THEN
      INSERT INTO public.contas_financeiras (nome, tipo, saldo_inicial, ativa, sistema, agency_id)
      VALUES ('Capital Circulante', 'caixa', 0, true, true, v_ag)
      RETURNING id, saldo_inicial INTO v_conta_id, v_current;
    END IF;
    v_delta := _novo_valor - COALESCE(v_current, 0);
    IF v_delta > 0 THEN
      INSERT INTO public.movimentacoes_capital(tipo, valor, conta_destino_id, responsavel_id, observacao, agency_id)
      VALUES ('aporte_capital', v_delta, v_conta_id, v_user, 'Ajuste manual (disponível): ' || trim(_motivo), v_ag);
    ELSIF v_delta < 0 THEN
      INSERT INTO public.movimentacoes_capital(tipo, valor, conta_origem_id, responsavel_id, observacao, agency_id)
      VALUES ('despesa_operacional', ABS(v_delta), v_conta_id, v_user, 'Ajuste manual (disponível): ' || trim(_motivo), v_ag);
    END IF;
    UPDATE public.contas_financeiras SET saldo_inicial = _novo_valor WHERE id = v_conta_id;

  ELSIF _target = 'companhias' THEN
    SELECT COALESCE(SUM(saldo), 0) INTO v_current FROM public.companhias_aereas WHERE ativa AND agency_id = v_ag;
    v_delta := _novo_valor - COALESCE(v_current, 0);
    IF ABS(v_delta) > 0.001 THEN
      SELECT id INTO v_cia_id FROM public.companhias_aereas WHERE ativa AND agency_id = v_ag ORDER BY nome LIMIT 1;
      IF v_cia_id IS NULL THEN RAISE EXCEPTION 'Nenhuma companhia ativa'; END IF;
      UPDATE public.companhias_aereas SET saldo = saldo + v_delta WHERE id = v_cia_id;
      INSERT INTO public.movimentacoes_capital(tipo, valor, companhia_id, responsavel_id, observacao, agency_id)
      VALUES ('despesa_operacional', ABS(v_delta), v_cia_id, v_user,
              'Ajuste manual (companhias, delta ' || v_delta::text || '): ' || trim(_motivo), v_ag);
    END IF;

  ELSIF _target = 'lucro' THEN
    SELECT id, saldo INTO v_fundo_id, v_current FROM public.fundo_lucro WHERE agency_id = v_ag LIMIT 1;
    IF v_fundo_id IS NULL THEN
      INSERT INTO public.fundo_lucro(saldo, agency_id) VALUES (_novo_valor, v_ag) RETURNING id INTO v_fundo_id;
      v_current := 0;
    ELSE
      UPDATE public.fundo_lucro SET saldo = _novo_valor, updated_at = now() WHERE id = v_fundo_id;
    END IF;
    v_delta := _novo_valor - COALESCE(v_current, 0);
    IF ABS(v_delta) > 0.001 THEN
      INSERT INTO public.movimentacoes_capital(tipo, valor, responsavel_id, observacao, agency_id)
      VALUES ('despesa_operacional', ABS(v_delta), v_user,
              'Ajuste manual (lucro, delta ' || v_delta::text || '): ' || trim(_motivo), v_ag);
    END IF;
  ELSE
    RAISE EXCEPTION 'Alvo inválido';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.verificar_consistencia_capital()
RETURNS TABLE(capital_contas numeric, capital_companhias numeric, capital_dividas numeric, capital_total numeric, capital_base numeric, fundo_lucro numeric, taxa_acumulada numeric, diferenca numeric, consistente boolean)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_contas NUMERIC; v_cias NUMERIC; v_div NUMERIC; v_fundo NUMERIC; v_taxa NUMERIC; v_base NUMERIC; v_total NUMERIC; v_ag uuid;
BEGIN
  v_ag := public.current_agency_id();
  SELECT COALESCE(SUM(saldo_inicial),0) INTO v_contas FROM public.contas_financeiras WHERE ativa AND agency_id = v_ag;
  SELECT COALESCE(SUM(GREATEST(saldo, 0)),0) INTO v_cias
    FROM public.companhias_aereas WHERE ativa AND COALESCE(modo,'saldo') = 'saldo' AND agency_id = v_ag;
  SELECT COALESCE(SUM(GREATEST(0, COALESCE(b.valor_cobrado,0) - COALESCE(p.total_pago,0))),0) INTO v_div
  FROM public.bilhetes b
  LEFT JOIN (
    SELECT bilhete_id, SUM(valor) AS total_pago FROM public.movimentacoes_capital
    WHERE tipo IN ('pagamento_cliente','pagamento_taxa_mudanca') AND bilhete_id IS NOT NULL
    GROUP BY bilhete_id
  ) p ON p.bilhete_id = b.id
  WHERE b.status <> 'cancelado' AND b.agency_id = v_ag;
  SELECT COALESCE(saldo,0) INTO v_fundo FROM public.fundo_lucro WHERE agency_id = v_ag LIMIT 1;
  SELECT COALESCE(SUM(taxa_agencia),0) INTO v_taxa FROM public.bilhetes WHERE status <> 'cancelado' AND agency_id = v_ag;
  SELECT COALESCE(capital_base_operacional,0) INTO v_base FROM public.agency_settings WHERE id = v_ag;
  v_total := v_contas + v_cias + v_div;
  RETURN QUERY SELECT v_contas, v_cias, v_div, v_total, COALESCE(v_base,0), COALESCE(v_fundo,0), v_taxa,
    v_total - COALESCE(v_base,0), ABS(v_total - COALESCE(v_base,0)) < 1;
END; $$;

CREATE OR REPLACE FUNCTION public.sincronizar_capital_base()
RETURNS TABLE(delta numeric, novo_saldo_circulante numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_base NUMERIC; v_circulante_id UUID; v_saldo_atual NUMERIC; v_delta NUMERIC; v_user UUID; v_ag UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Apenas admin pode sincronizar capital'; END IF;
  v_ag := public.current_agency_id();
  v_user := auth.uid();

  SELECT COALESCE(capital_base_operacional,0) INTO v_base FROM public.agency_settings WHERE id = v_ag;

  SELECT id, saldo_inicial INTO v_circulante_id, v_saldo_atual
    FROM public.contas_financeiras WHERE COALESCE(sistema,false) = true AND agency_id = v_ag LIMIT 1;

  IF v_circulante_id IS NULL THEN
    INSERT INTO public.contas_financeiras (nome, tipo, saldo_inicial, ativa, sistema, agency_id)
      VALUES ('Capital Circulante', 'caixa', v_base, true, true, v_ag)
      RETURNING id INTO v_circulante_id;
    v_saldo_atual := 0;
  END IF;

  v_delta := v_base - v_saldo_atual;

  IF ABS(v_delta) > 0.001 THEN
    INSERT INTO public.movimentacoes_capital (tipo, valor, conta_destino_id, responsavel_id, observacao, agency_id)
    VALUES ('aporte_capital', v_delta, v_circulante_id, v_user, 'Ajuste de Capital inicial nas Configurações', v_ag);
    UPDATE public.contas_financeiras SET saldo_inicial = v_base WHERE id = v_circulante_id;
  END IF;

  RETURN QUERY SELECT v_delta, v_base;
END;
$$;