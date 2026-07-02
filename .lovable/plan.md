## Objetivo

Alinhar o Capital Circulante com a Base (20 000 000) descontando os 50 000 que já estão carregados na companhia, para que:

```
Caixa 19 950 000 + Companhias 50 000 + A Receber 0 = 20 000 000 ✓
```

Sem alterar lógica do sistema, sem mexer no Fundo de Lucro (144 200 fica intacto).

## O que vai ser feito

**1. Um único movimento manual de ajuste**

Inserir uma linha em `movimentacoes_capital`:
- Tipo: `despesa_operacional` (é o único tipo que reduz o caixa sem exigir contrapartida noutro lado do operacional)
- Conta origem: Capital Circulante
- Valor: 50 000
- Observação: "Ajuste inicial — regularização do carregamento da TAP anterior à definição da base"
- Responsável: admin atual

O trigger `aplicar_movimentacao` desconta automaticamente 50 000 do saldo do Capital Circulante → passa a 19 950 000.

**2. Verificação**

Depois do ajuste, confirmar via SQL:
- Capital Circulante = 19 950 000
- Companhias total = 50 000
- Total operacional = 20 000 000
- Fundo de Lucro inalterado = 144 200

## O que NÃO vai ser feito

- Não vou mexer no Fundo de Lucro.
- Não vou alterar a função `sincronizar_capital_base` nem o trigger.
- Não vou tocar em bilhetes, reservas nem clientes.
- Não vou alterar a Base de 20 000 000 nas Configurações.

## Nota sobre o tipo do movimento

Uso `despesa_operacional` porque é o tipo já existente que:
- Desconta do caixa
- Não exige destino (companhia/cliente)
- Aparece no histórico como ajuste rastreável

Fica visível na aba "Movimento do capital" com a observação explicando o motivo, portanto é auditável.

## Ficheiros afetados

Nenhum ficheiro de código. Apenas 1 `INSERT` na tabela `movimentacoes_capital` via ferramenta de dados.
