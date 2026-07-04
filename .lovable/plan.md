## Objetivo

Garantir que, quando uma agência/companhia é recarregada, o valor sai automaticamente do **Disponível (banco / caixa)** / **Capital Circulante** e entra em **Carregado nas companhias**.

## Plano

1. **Corrigir o backend de movimentos**
   - Manter a lógica de `carregamento_companhia`: subtrair da conta origem e somar na companhia.
   - Remover o trigger duplicado em `movimentacoes_capital`, porque hoje existem dois triggers chamando a mesma função (`trg_aplicar_mov` e `trg_aplicar_movimentacao`).
   - Deixar apenas um trigger ativo para evitar lançamentos duplicados ou comportamento inconsistente.

2. **Garantir que o botão “Carregar companhia” usa o Capital Circulante**
   - O formulário já seleciona a conta de sistema como origem por padrão.
   - Vou ajustar para ficar mais explícito que o dinheiro sai do **Capital Circulante**.
   - Após salvar, a tela vai atualizar imediatamente as consultas de contas, companhias e consistência.

3. **Verificar o saldo real após a correção**
   - Conferir no banco se o saldo da conta circulante e o saldo das companhias estão coerentes.
   - Se houver recarregamento antigo que não foi descontado corretamente, preparar uma correção pontual para alinhar o saldo atual.

## Resultado esperado

Exemplo: se o Capital Circulante tem **1.000.000** e você recarrega uma companhia com **100.000**, o card **Disponível (banco / caixa)** passa a mostrar **900.000**, e **Carregado nas companhias** aumenta em **100.000**.