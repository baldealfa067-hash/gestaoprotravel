-- =====================================================================
-- 1) Registo de utilizadores: agência e papel deixam de vir de
--    raw_user_meta_data (controlado pelo cliente no signUp público).
--    Funcionários criados por um admin passam a usar um convite criado
--    no servidor (createEmployee, service role).
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.convites_funcionario (
  email text PRIMARY KEY,
  agency_id uuid NOT NULL REFERENCES public.agency_settings(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'vendedor',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Sem políticas: só o service role e funções SECURITY DEFINER lhe acedem
ALTER TABLE public.convites_funcionario ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.convites_funcionario FROM anon, authenticated;
GRANT ALL ON public.convites_funcionario TO service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_agency uuid;
  v_role public.app_role;
BEGIN
  DELETE FROM public.convites_funcionario WHERE expires_at <= now();

  -- Funcionário criado por um admin: agência e papel vêm do convite
  DELETE FROM public.convites_funcionario
   WHERE email = lower(NEW.email)
  RETURNING agency_id, role INTO v_agency, v_role;

  IF v_agency IS NULL THEN
    -- Registo público: cria sempre uma agência nova, da qual o utilizador é admin
    INSERT INTO public.agency_settings (agency_name, currency)
    VALUES (COALESCE(NULLIF(NEW.raw_user_meta_data->>'agency_name',''), 'Minha Agência'), 'XOF')
    RETURNING id INTO v_agency;

    v_role := 'admin';

    INSERT INTO public.contas_financeiras (nome, tipo, saldo_inicial, ativa, sistema, agency_id)
    VALUES ('Capital Circulante', 'caixa', 0, true, true, v_agency);
    INSERT INTO public.fundo_lucro (saldo, agency_id) VALUES (0, v_agency);
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

-- =====================================================================
-- 2) Triggers financeiros passam a SECURITY DEFINER.
--    Antes corriam com as permissões de quem fazia a ação; como o RLS só
--    deixa admins atualizar fundo_lucro, companhias_aereas e
--    contas_financeiras, as vendas, emissões, pagamentos de taxa e
--    mudanças de rota feitas por vendedores não atualizavam os saldos
--    (UPDATE silencioso de 0 linhas).
-- =====================================================================

-- Vendedores só podem inserir movimentações diretamente para pagamentos;
-- as restantes vêm de triggers/RPCs SECURITY DEFINER ou de admins.
DROP POLICY IF EXISTS mc_insert ON public.movimentacoes_capital;
CREATE POLICY mc_insert ON public.movimentacoes_capital FOR INSERT TO authenticated
WITH CHECK (
  agency_id = public.current_agency_id()
  AND responsavel_id = auth.uid()
  AND (public.has_role(auth.uid(), 'admin') OR tipo IN ('pagamento_cliente', 'pagamento_taxa_mudanca'))
);

CREATE OR REPLACE FUNCTION public.aplicar_movimentacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total NUMERIC; v_fundo_id UUID; v_saldo_origem NUMERIC; v_pago_ate_agora NUMERIC; v_conta_sistema UUID;
BEGIN
  IF NEW.valor IS NULL OR NEW.valor < 0 THEN
    RAISE EXCEPTION 'Valor inválido na movimentação';
  END IF;

  -- Sem RLS nos UPDATEs abaixo: todas as referências têm de ser da mesma agência
  IF NEW.bilhete_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.bilhetes WHERE id = NEW.bilhete_id AND agency_id = NEW.agency_id) THEN
    RAISE EXCEPTION 'Bilhete não pertence à agência';
  END IF;
  IF NEW.companhia_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.companhias_aereas WHERE id = NEW.companhia_id AND agency_id = NEW.agency_id) THEN
    RAISE EXCEPTION 'Companhia não pertence à agência';
  END IF;
  IF NEW.conta_origem_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.contas_financeiras WHERE id = NEW.conta_origem_id AND agency_id = NEW.agency_id) THEN
    RAISE EXCEPTION 'Conta de origem não pertence à agência';
  END IF;
  IF NEW.conta_destino_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.contas_financeiras WHERE id = NEW.conta_destino_id AND agency_id = NEW.agency_id) THEN
    RAISE EXCEPTION 'Conta de destino não pertence à agência';
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
      -- Trigger AFTER INSERT: a soma já inclui esta movimentação
      SELECT COALESCE(SUM(valor),0) INTO v_pago_ate_agora
        FROM public.movimentacoes_capital
        WHERE bilhete_id = NEW.bilhete_id AND tipo IN ('pagamento_cliente','pagamento_taxa_mudanca');
      IF v_total IS NOT NULL AND v_total > 0 AND v_pago_ate_agora + 0.01 >= v_total THEN
        UPDATE public.bilhetes
          SET pago = true,
              status = CASE WHEN status IN ('pedido_criado','pendente','pago') THEN 'pago'::public.ticket_status ELSE status END
          WHERE id = NEW.bilhete_id;
      END IF;
    END IF;

  ELSIF NEW.tipo = 'pagamento_cliente' THEN
    IF NEW.bilhete_id IS NOT NULL THEN
      SELECT valor_cobrado INTO v_total FROM public.bilhetes WHERE id = NEW.bilhete_id;
      IF v_total IS NOT NULL AND v_total > 0 THEN
        -- Trigger AFTER INSERT: a soma já inclui esta movimentação
        SELECT COALESCE(SUM(valor),0) INTO v_pago_ate_agora
          FROM public.movimentacoes_capital
          WHERE bilhete_id = NEW.bilhete_id AND tipo IN ('pagamento_cliente','pagamento_taxa_mudanca');
        IF v_pago_ate_agora + 0.01 >= v_total THEN
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
$function$;

-- Corpo inalterado; as movimentações que insere são validadas em aplicar_movimentacao
ALTER FUNCTION public.bilhete_debita_companhia() SECURITY DEFINER;

-- Disparar em qualquer UPDATE: a taxa_agencia também muda quando custo/classe/continentes
-- mudam (bilhete_auto_taxa) ou numa mudança de rota, e o fundo é ajustado pela diferença.
DROP TRIGGER IF EXISTS trg_bilhete_debita_companhia ON public.bilhetes;
CREATE TRIGGER trg_bilhete_debita_companhia
AFTER INSERT OR UPDATE ON public.bilhetes
FOR EACH ROW EXECUTE FUNCTION public.bilhete_debita_companhia();

CREATE OR REPLACE FUNCTION public.aplicar_mudanca_rota()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_conta_sistema UUID;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.bilhete_id IS NULL AND NEW.bilhete_id IS NOT NULL THEN
      NULL;
    ELSIF OLD.bilhete_id = NEW.bilhete_id THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Sem RLS nos UPDATEs abaixo: bilhete e reserva têm de ser da mesma agência
  IF NEW.bilhete_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.bilhetes WHERE id = NEW.bilhete_id AND agency_id = NEW.agency_id) THEN
    RAISE EXCEPTION 'Bilhete não pertence à agência';
  END IF;
  IF NEW.reserva_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.reservas WHERE id = NEW.reserva_id AND agency_id = NEW.agency_id) THEN
    RAISE EXCEPTION 'Reserva não pertence à agência';
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

-- =====================================================================
-- 3) Operações de administração como RPC (SECURITY DEFINER).
--    As server functions dependiam de SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY /
--    SUPABASE_SERVICE_ROLE_KEY no runtime do servidor, que não estão disponíveis
--    ("Missing Supabase environment variable(s)"). Assim correm no Postgres,
--    chamadas pelo cliente do browser como o resto da app.
-- =====================================================================

-- Criar funcionário: o admin cria o convite e o browser faz o signUp do funcionário;
-- handle_new_user consome o convite e associa-o à agência com o papel escolhido.
CREATE OR REPLACE FUNCTION public.criar_convite_funcionario(_email text, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ag uuid; v_email text := lower(trim(_email));
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  v_ag := public.current_agency_id();
  IF v_ag IS NULL THEN RAISE EXCEPTION 'Agência não encontrada'; END IF;
  IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Email inválido'; END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'Já existe um utilizador com este email';
  END IF;

  INSERT INTO public.convites_funcionario (email, agency_id, role, created_by, expires_at)
  VALUES (v_email, v_ag, COALESCE(_role, 'vendedor'), auth.uid(), now() + interval '10 minutes')
  ON CONFLICT (email) DO UPDATE
    SET agency_id = EXCLUDED.agency_id, role = EXCLUDED.role,
        created_by = EXCLUDED.created_by, expires_at = EXCLUDED.expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_funcionario(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); v_ag uuid;
BEGIN
  IF NOT public.has_role(v_me, 'admin') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF _user_id = v_me THEN RAISE EXCEPTION 'Não pode eliminar a sua própria conta'; END IF;
  v_ag := public.current_agency_id();
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND agency_id = v_ag) THEN
    RAISE EXCEPTION 'Funcionário não pertence à sua agência';
  END IF;

  -- Reatribuir ao admin (bilhetes e reservas têm FK RESTRICT para auth.users)
  UPDATE public.bilhetes              SET vendedor_id = v_me    WHERE vendedor_id = _user_id;
  UPDATE public.reservas              SET user_id = v_me        WHERE user_id = _user_id;
  UPDATE public.clientes              SET created_by = v_me     WHERE created_by = _user_id;
  UPDATE public.movimentacoes_capital SET responsavel_id = v_me WHERE responsavel_id = _user_id;
  UPDATE public.mudancas_rota         SET responsavel_id = v_me WHERE responsavel_id = _user_id;

  DELETE FROM public.user_roles WHERE user_id = _user_id;
  DELETE FROM public.profiles WHERE id = _user_id;
  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_bilhete(_bilhete_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status public.ticket_status;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem eliminar bilhetes';
  END IF;
  SELECT status INTO v_status FROM public.bilhetes
   WHERE id = _bilhete_id AND agency_id = public.current_agency_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Bilhete não encontrado'; END IF;
  IF v_status <> 'cancelado' THEN RAISE EXCEPTION 'Cancele o bilhete antes de o eliminar'; END IF;

  UPDATE public.reservas SET bilhete_id = NULL WHERE bilhete_id = _bilhete_id;
  DELETE FROM public.mudancas_rota WHERE bilhete_id = _bilhete_id;
  DELETE FROM public.movimentacoes_capital WHERE bilhete_id = _bilhete_id;
  DELETE FROM public.bilhetes WHERE id = _bilhete_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.repor_dados_agencia(_confirmacao text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ag uuid;
BEGIN
  IF _confirmacao IS DISTINCT FROM 'RESET' THEN RAISE EXCEPTION 'Confirmação inválida'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  v_ag := public.current_agency_id();
  IF v_ag IS NULL THEN RAISE EXCEPTION 'Agência não encontrada'; END IF;

  -- Ordem importa por FKs
  DELETE FROM public.mudancas_rota         WHERE agency_id = v_ag;
  DELETE FROM public.movimentacoes_capital WHERE agency_id = v_ag;
  DELETE FROM public.reservas              WHERE agency_id = v_ag;
  DELETE FROM public.bilhetes              WHERE agency_id = v_ag;
  DELETE FROM public.clientes              WHERE agency_id = v_ag;
  DELETE FROM public.companhias_aereas     WHERE agency_id = v_ag;

  -- Contas: apagar não-sistema, zerar sistema
  DELETE FROM public.contas_financeiras WHERE agency_id = v_ag AND COALESCE(sistema, false) = false;
  UPDATE public.contas_financeiras SET saldo_inicial = 0 WHERE agency_id = v_ag AND sistema = true;

  UPDATE public.fundo_lucro SET saldo = 0 WHERE agency_id = v_ag;
END;
$$;

CREATE OR REPLACE FUNCTION public.listar_agencias()
RETURNS TABLE(id uuid, agency_name text, currency text, email text, telefone text,
              created_at timestamptz, utilizadores bigint, bilhetes bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN QUERY
  SELECT a.id, a.agency_name::text, a.currency::text, a.email::text, a.telefone::text, a.created_at,
         (SELECT count(*) FROM public.profiles p WHERE p.agency_id = a.id),
         (SELECT count(*) FROM public.bilhetes b WHERE b.agency_id = a.id)
  FROM public.agency_settings a
  ORDER BY a.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_agencia(_agency_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_users uuid[];
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF _agency_id = public.current_agency_id() THEN
    RAISE EXCEPTION 'Não pode eliminar a sua própria agência';
  END IF;

  SELECT array_agg(id) INTO v_users FROM public.profiles WHERE agency_id = _agency_id;
  -- Todas as tabelas da agência têm FK ON DELETE CASCADE para agency_settings
  DELETE FROM public.agency_settings WHERE id = _agency_id;
  DELETE FROM auth.users WHERE id = ANY(COALESCE(v_users, '{}')) AND id <> auth.uid();
END;
$$;