
-- 1. Novo tipo de movimentação: pagamento de taxa de mudança
ALTER TYPE public.mov_tipo ADD VALUE IF NOT EXISTS 'pagamento_taxa_mudanca';
