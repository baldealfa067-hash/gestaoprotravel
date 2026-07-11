# Plano — Exportar PDF de dívidas + Companhias intermediárias (crédito)

## 1. Exportar PDF na página Dívidas (Capital)

Botão "Exportar PDF" na aba Dívidas. Os filtros continuam apenas no ecrã; o PDF exporta **tudo** (sem filtro).

Conteúdo do PDF:
- Cabeçalho com logo, nome da agência, data/hora de emissão e título "Relatório de Dívidas".
- **Secção 1 — Dívidas de clientes** (tabela por bilhete):
  Data viagem · Cliente · Itinerário (Origem → Destino) · Classe · Companhia · Custo · Taxa agência · Total · Pago · Em dívida.
  Sub-agrupado em: "Não pagos" e "Pagamento parcial", com subtotais.
- **Secção 2 — Dívidas a companhias intermediárias** (nova):
  Companhia · Nº bilhetes · Total devido · Último bilhete. Total geral no fim.
- Rodapé: total geral (clientes + companhias), assinatura do responsável.

Implementação: jsPDF + jspdf-autotable (leve, client-side). Novo componente `src/components/export-dividas-pdf.tsx` e helper `src/lib/pdf-dividas.ts`.

## 2. Companhias em modo crédito (intermediárias)

Nova propriedade `modo` em `companhias_aereas`: `'saldo'` (atual — precisa carregar) ou `'credito'` (intermediária — não carrega, cria dívida).

Fluxo:
- Ao criar/editar companhia em `CompanhiasEditor`, escolher o modo. Companhias `credito` não pedem saldo nem alerta.
- Ao emitir bilhete usando companhia `credito`: trigger `bilhete_debita_companhia` deixa o saldo em negativo (que representa dívida) e cria movimento `emissao_bilhete` normalmente. O trigger `registar_carregamento_por_saldo_companhia` deixa de exigir Circulante para companhias `credito`.
- Nova view/query agrega dívida por companhia intermediária = `-saldo` quando `modo='credito'` e saldo < 0 (ou soma de `emissao_bilhete` menos `pagamento_companhia`).

## 3. Nova aba "Dívidas a companhias" no Capital

Lista companhias em modo crédito com saldo devedor, total geral, e botão "Registar pagamento" por linha.

Pagamento à companhia é **manual, sem mexer no Capital Circulante** (conforme escolhido):
- Novo tipo de movimentação `pagamento_companhia` (enum) — apenas soma ao saldo da companhia (reduz a dívida), não toca em contas financeiras.
- Guarda histórico com data, valor, observação e responsável.

## 4. Alterações técnicas

### Migração SQL
- `ALTER TYPE mov_tipo ADD VALUE 'pagamento_companhia'`.
- `ALTER TABLE companhias_aereas ADD COLUMN modo text DEFAULT 'saldo' CHECK (modo IN ('saldo','credito'))`.
- Atualizar trigger `registar_carregamento_por_saldo_companhia`: ignorar quando `modo='credito'` (não debita circulante nem cria movimento de carregamento).
- Atualizar trigger `aplicar_movimentacao` para tratar `pagamento_companhia` (soma ao `companhias_aereas.saldo`, sem tocar em contas).
- Atualizar `verificar_consistencia_capital` para excluir saldo negativo de companhias `credito` da soma total (representa dívida, não capital).

### Frontend
- `src/components/companhias-editor.tsx`: campo "Modo" (Saldo / Crédito). Ocultar saldo/alerta quando crédito.
- `src/routes/_authenticated/capital.tsx`: nova aba "Dívidas a companhias" + botão "Exportar PDF" na aba Dívidas.
- `src/routes/_authenticated/bilhetes.tsx`: dropdown de companhias mostra `[Crédito]` ao lado do nome quando aplicável.
- `src/lib/capital.ts`: label para `pagamento_companhia`.

### Dependências
- `bun add jspdf jspdf-autotable`.

## Fora do âmbito
- Filtros do PDF (o utilizador confirmou que ficam só no ecrã).
- Pagamento de dívida a companhia via Capital Circulante.
