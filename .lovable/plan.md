## O que vou fazer

1. **Eliminar a conta ECOBANK** da base de dados (DELETE em `contas_financeiras` onde `nome = 'ECOBANK'` e `sistema = false`).

2. **Ajustar o card "Disponível (banco / caixa)"** na página `/capital` para mostrar apenas o saldo da conta de sistema (Capital Circulante), em vez da soma de todas as contas ativas.

3. **Adicionar aba "Contas"** dentro da página `/capital` (usando o `Tabs` já existente ou uma nova secção), com:
   - Lista de todas as contas (`contas_financeiras`) — nome, tipo, saldo, ativa.
   - Botão "Nova conta" (reaproveita o `NovaContaDialog` que já existe).
   - Ações por linha: editar saldo/nome, ativar/inativar, eliminar (bloqueando eliminação da conta de sistema `Capital Circulante`).

## O que NÃO vou fazer

- Não mexo em triggers nem em `sincronizar_capital_base` — o Circulante continua a ser gerido pelo fluxo atual.
- Não altero a fórmula de consistência de capital (`verificar_consistencia_capital` continua a somar todas as contas ativas — isto é do lado do backend e é o comportamento correcto para a auditoria).
- Não mexo em movimentações históricas.

## Como confirmar depois

- Card "Disponível" na página Capital mostra 1.000.000 (só o Circulante).
- Aba "Contas" lista as contas restantes; ECOBANK não aparece porque foi eliminada.
- É possível criar / eliminar / inativar contas a partir dessa aba, excepto a conta de sistema.
