## Módulo de Mudanças de Rota

Adicionar a possibilidade de registar mudanças de rota (reroute) em reservas ativas e bilhetes emitidos, com taxa manual que aumenta a dívida do cliente e vai para o Fundo de Lucro quando paga.

### 1. Base de dados (nova migração)

Nova tabela `public.mudancas_rota`:
- `bilhete_id` (nullable, FK bilhetes)
- `reserva_id` (nullable, FK reservas)
- `rota_antiga` (text), `rota_nova` (text)
- `classe_antiga`, `classe_nova` (nullable)
- `data_viagem_antiga`, `data_viagem_nova` (nullable)
- `taxa_mudanca` (numeric, obrigatório > 0)
- `motivo` (text opcional)
- `responsavel_id` (uuid)
- `created_at`, `updated_at`

RLS + GRANT padrão (authenticated + service_role). Vendedores criam/vêem; admin gere tudo.

Nova coluna em `bilhetes`:
- `taxa_mudancas_total` (numeric default 0) — soma acumulada das taxas de mudança do bilhete.

Trigger `trg_mudanca_aplica_taxa` em `mudancas_rota`:
- Ao INSERT com `bilhete_id`:
  - Soma `taxa_mudanca` a `bilhetes.taxa_mudancas_total`
  - Recalcula `bilhetes.valor_cobrado = custo + taxa_agencia + taxa_mudancas_total`
  - Marca `bilhetes.pago = false` se o novo total > pagamentos acumulados
  - Actualiza rota/classe/data do bilhete com os novos valores (se fornecidos)
- Ao INSERT numa reserva sem bilhete: apenas actualiza a rota/classe/data da reserva; a taxa só entra no bilhete quando emitido (guardar como "pendente" — soma-se ao emitir).

Ajuste em `aplicar_movimentacao` (`pagamento_cliente`):
- O rácio de rateio custo/lucro passa a considerar `taxa_agencia + taxa_mudancas_total` como parte do "lucro" — assim a taxa de mudança paga alimenta `fundo_lucro` naturalmente sem código extra.

Ajuste em `verificar_consistencia_capital`: usar `valor_cobrado` já reflecte tudo (nenhuma mudança adicional).

Ao emitir bilhete a partir de reserva com mudanças pendentes: copiar as taxas pendentes para o bilhete via trigger `sync_reserva_on_bilhete_emitido` (ou nova função auxiliar).

### 2. Frontend

**`src/components/mudanca-rota-dialog.tsx`** (novo) — diálogo reutilizável com:
- Campos: nova rota (origem/destino), nova classe (opcional), nova data viagem (opcional), taxa (obrigatória, numérico), motivo (opcional).
- Mostra rota/classe/data actuais em modo leitura.

**`src/routes/_authenticated/reservas.tsx`**:
- Botão "Registar mudança" em cada linha de reserva ativa/pendente.

**`src/routes/_authenticated/bilhetes.tsx`**:
- Botão "Registar mudança" em cada bilhete não cancelado.
- Mostrar badge "N mudanças" quando `taxa_mudancas_total > 0`.
- Ao expandir bilhete: lista de mudanças (rota antiga → nova, taxa, data, responsável).

**`src/routes/_authenticated/capital.tsx`**:
- Nova aba "Mudanças de rota" com tabela: data, cliente, bilhete/reserva, rota antiga → nova, taxa, responsável.
- Total acumulado de taxas de mudança no topo.

**`src/lib/pdf-dividas.ts`**:
- Para cada bilhete em dívida, se `taxa_mudancas_total > 0`, mostrar coluna extra ou linha de detalhe com "Mudanças: N (taxa X)".

### 3. Regras confirmadas

- Registar em reservas ativas E bilhetes emitidos.
- Taxa manual por mudança (o vendedor escreve).
- Aumenta valor em dívida do cliente E vai para Fundo de Lucro quando pago (via rateio existente).
- Histórico visível em aba no Capital + no detalhe do bilhete + no PDF de dívidas.
