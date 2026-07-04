## O bug

Verifiquei a base de dados e a causa é grave mas simples: **não existe nenhum trigger na base**. As funções (`aplicar_movimentacao`, `bilhete_debita_companhia`, `bilhete_auto_taxa`, `sync_reserva_on_bilhete_emitido`, `set_updated_at`) foram criadas mas nunca foram ligadas às tabelas.

Resultado prático:
- Ao recarregar uma companhia, o registo entra em `movimentacoes_capital` mas **ninguém desconta do Capital Circulante nem soma ao saldo da companhia** — é exatamente o que estás a ver.
- Ao emitir um bilhete, a taxa da agência não é calculada e o saldo da companhia não é descontado.
- Ao registar pagamento do cliente, o Fundo de Lucro não é atualizado e o bilhete não é marcado como pago.
- Os `updated_at` não se atualizam.

(O saldo da companhia que viste a mudar deve ter sido via a planilha editável que fizemos há pouco, não pelo carregamento.)

## O que vou fazer

Uma migração única que **cria todos os triggers em falta**, ligando as funções que já existem às tabelas certas:

1. `movimentacoes_capital` → `AFTER INSERT` executa `aplicar_movimentacao()`
   → passa a descontar do Circulante e somar à companhia no recarregamento (bug atual)
   → passa a debitar companhia na emissão, creditar contas no pagamento, etc.

2. `bilhetes` → `BEFORE INSERT OR UPDATE` executa `bilhete_auto_taxa()`
   → calcula taxa da agência e `valor_cobrado` automaticamente.

3. `bilhetes` → `AFTER INSERT OR UPDATE` executa `bilhete_debita_companhia()`
   → desconta o custo do saldo da companhia quando o bilhete fica `emitido`, devolve se for cancelado.

4. `bilhetes` → `AFTER UPDATE` executa `sync_reserva_on_bilhete_emitido()`
   → marca a reserva como `emitida` quando o bilhete é emitido.

5. `BEFORE UPDATE` com `set_updated_at()` nas tabelas com coluna `updated_at`
   (bilhetes, reservas, clientes, companhias_aereas, contas_financeiras, agency_settings, profiles, movimentacoes_capital, fundo_lucro).

## O que NÃO vou fazer

- Não vou tocar em dados existentes — só ligar triggers. Recarregamentos antigos que não desceram o Circulante ficam como estão (a menos que peças para regularizar).
- Não vou mexer nas funções em si, só criar os triggers.
- Não vou mexer em código do frontend — o problema é 100% base de dados.

## Como confirmar depois

Fazer um carregamento de teste e verificar que:
- O saldo do Capital Circulante desce no valor exato.
- O saldo da companhia sobe no mesmo valor.
- Aparece o movimento na aba de movimentações.
