# Nova lógica financeira — Capital, Companhias e Mudanças de Rota

Três blocos independentes, todos aplicados no mesmo turno.

---

## 1. Mudança de rota = adiantamento do Circulante → Dívida do cliente

Hoje: registar uma mudança soma a taxa ao `valor_cobrado` do bilhete (dívida do cliente) e o pagamento vai 100% para o Fundo de Lucro. O Capital Circulante nunca é tocado.

Novo comportamento:

- Ao registar uma mudança de rota com `taxa_mudanca > 0`:
  1. Débito imediato no **Capital Circulante** no valor da taxa (nova movimentação `adianto_mudanca_rota`, saída do Circulante).
  2. A taxa continua a ser somada ao `valor_cobrado` do bilhete e o bilhete fica marcado como não pago (fluxo atual, mantém-se).
- Ao registar o **pagamento da taxa de mudança** pelo cliente (tipo já existente `pagamento_taxa_mudanca`):
  - Deixa de ir para o Fundo de Lucro.
  - Passa a **creditar o Capital Circulante** (devolve o adiantamento).
- Se o cliente nunca pagar, o adiantamento fica visível como dívida em aberto (bilhete continua a aparecer nas dívidas de cliente, já é assim hoje).

Exemplo alinhado com o pedido: Circulante 1.000.000 → mudança de 200.000 → Circulante 800.000 + dívida de 200.000 → cliente paga → Circulante 1.000.000, dívida encerrada.

**SQL:**

- Adicionar valor `'adianto_mudanca_rota'` ao enum `mov_tipo`.
- `aplicar_movimentacao()`: novo ramo para `adianto_mudanca_rota` (debita `conta_origem_id`, sistema = Circulante); alterar ramo `pagamento_taxa_mudanca` para creditar o Circulante em vez do `fundo_lucro`.
- `aplicar_mudanca_rota()`: após atualizar o bilhete, inserir automaticamente a movimentação `adianto_mudanca_rota` (origem = conta Circulante, `bilhete_id`, `responsavel_id = auth.uid()`, observação com a rota antiga → nova).
- `verificar_consistencia_capital()`: manter, o cálculo de dívidas de cliente já contempla `pagamento_taxa_mudanca`.

---

## 2. Capital Circulante independente das Companhias

Hoje: qualquer aumento de saldo de companhia (INSERT/UPDATE) dispara `registar_carregamento_por_saldo_companhia`, que debita o Circulante. O tipo `carregamento_companhia` no `aplicar_movimentacao` também subtrai do Circulante.

Novo comportamento:

- Criar/recarregar/editar uma companhia **não** mexe no Circulante.
- Editar o Circulante manualmente continua a funcionar pelo diálogo existente ("Definir Capital Circulante" → `definir_capital_circulante`), sem PIN (mantém-se).
- O tipo `carregamento_companhia` deixa de existir como fluxo automático de saída do Circulante — passa a ser apenas um registo informativo do aumento da companhia (sem `conta_origem_id`).

**SQL:**

- `DROP TRIGGER` que chama `registar_carregamento_por_saldo_companhia` em `companhias_aereas` (a função pode ficar, deixa de ser usada).
- Em `aplicar_movimentacao()`, ramo `carregamento_companhia`: remover o bloco que valida saldo e debita `conta_origem_id`. Manter apenas o `UPDATE companhias_aereas ... saldo = saldo + valor` quando `aplicar_saldo`.
- O ramo `emissao_bilhete` mantém-se (debita companhia quando bilhete é emitido).
- O ramo `pagamento_cliente` para companhia em modo `saldo`: **manter** a devolução ao Circulante (isto é receita real do cliente, não é carregamento). Confirmar com o utilizador se quer também desligar isto — ver nota no fim.

---

## 3. Dashboard: card "Valor Total de Campanhas" + Total Geral

- No Dashboard (`src/routes/_authenticated/dashboard.tsx`), substituir o card de "Carregamento de Campanhas" (na prática hoje não existe um card com esse nome exato; o card mais próximo é o de reservas/emitidos — vou remover o card que o utilizador indicar e adicionar o novo). Adicionar:
  - **Valor Total de Campanhas** = `SUM(saldo)` das companhias ativas (todas, saldo + credito, conforme já é somado hoje no Capital).
- Adicionar no topo do Dashboard e do Capital um bloco **Total Geral**:
  ```
  Total Geral = Capital Circulante + Dívidas de Clientes + Valor Total de Campanhas
  ```
  Reutiliza `verificar_consistencia_capital()` (retorna `capital_contas`, `capital_companhias`, `capital_dividas`). Nenhuma alteração de schema.

---

## Impacto em dados existentes

- Bilhetes/movimentações antigas ficam como estão. A nova regra aplica-se a mudanças de rota **novas** e a pagamentos de taxa **novos**.
- Companhias já criadas mantêm o saldo atual; o Circulante não é reajustado retroativamente. Se o utilizador quiser "devolver" ao Circulante o total já debitado historicamente por carregamentos, pode fazê-lo manualmente pelo diálogo de definir Circulante (o histórico fica preservado nas movimentações).

---

## Detalhes técnicos

- Migração SQL única: `ALTER TYPE mov_tipo ADD VALUE 'adianto_mudanca_rota'` + `CREATE OR REPLACE FUNCTION aplicar_movimentacao` + `CREATE OR REPLACE FUNCTION aplicar_mudanca_rota` + `DROP TRIGGER ... registar_carregamento_por_saldo_companhia ...`.
- Frontend:
  - `dashboard.tsx`: novo card "Valor Total de Campanhas" e bloco "Total Geral".
  - `capital.tsx`: bloco "Total Geral" no topo; rótulo do tipo `adianto_mudanca_rota` em `src/lib/capital.ts` (`MOV_TIPO_LABEL`).
  - `mudanca-rota-dialog.tsx`: sem mudança de UX (o adiantamento é automático no trigger).

---

## Pergunta antes de implementar

Ponto 2, ramo `pagamento_cliente` para companhias em modo **saldo** (companhia própria, recarregada): hoje a parte do custo pago pelo cliente volta ao Circulante. Isto **não** é um "carregamento", é o retorno da venda. Mantenho como está (Circulante recebe o custo, Fundo recebe o lucro), certo? Se quiseres que **nada** de bilhetes/companhias mexa no Circulante, avisa e ajusto — mas nesse caso o Circulante só se move por mudanças de rota e ajustes manuais. o circulante nao deve receber o custo porque o custo nao saio no circulante .. isto tem que ser registado como devida e quando for paga a taxa do lucro vai para a parte dos lucros e o custo sai por que se as campanhias sao recagas manual mente sem depender do capital circulante e o capital circulante e modificavel isto nao deve ter nenhuma relação.....ok 