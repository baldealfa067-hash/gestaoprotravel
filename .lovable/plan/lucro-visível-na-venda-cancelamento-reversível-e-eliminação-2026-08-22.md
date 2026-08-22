# Lucro visível na venda, cancelamento reversível e eliminação de vendedores

## 1. Lucro reconhecido na venda (não só na emissão)

Hoje o lucro (taxa da agência) só entra no Fundo de Lucro quando o bilhete passa a "emitido". Verificado na base de dados: uma agência tem um bilhete emitido com 1.119.329 de taxa e o Fundo de Lucro está a 0, e outra tem 122.000 em taxas de emitidos contra 116.000 no fundo — ou seja, o valor mostrado não acompanha as vendas.

Novo comportamento:

- Assim que um bilhete é criado/vendido (qualquer estado exceto cancelado), a taxa da agência é reconhecida no Fundo de Lucro — mesmo que o cliente ainda não tenha pago.
- Se a taxa for alterada (edição do bilhete, nova taxa de mudança de rota), o fundo é ajustado pela diferença, sem duplicar.
- Correção retroativa: recalcular o Fundo de Lucro de cada agência = soma das taxas de agência de todos os bilhetes não cancelados (+ taxas de mudança já pagas), para que os valores atuais fiquem corretos.

## 2. Mostrar Total geral **e** Lucro na página de Bilhetes

- Na página Bilhetes, junto aos indicadores de topo, passam a aparecer dois valores: **Total geral** (custo + taxas dos bilhetes ativos) e **Lucro** (soma das taxas da agência), atualizados a cada venda.
- Na página Capital o cartão "Lucro por taxas" passa a refletir o novo cálculo.

## 3. Cancelar bilhete a qualquer momento + eliminar

- O cancelamento continua disponível mesmo depois de emitido/pago, agora com diálogo de confirmação explicando o que é revertido.
- Ao cancelar: o lucro é retirado do Fundo de Lucro, o custo volta ao saldo da companhia, a dívida do cliente desaparece e as movimentações do bilhete ficam registadas como estorno no histórico.
- Novo botão **Eliminar bilhete** (apenas admin, apenas para bilhetes cancelados): apaga o bilhete e os registos ligados (movimentações, mudanças de rota, ligação à reserva), para o caso de ter sido criado por engano.

## 4. Eliminar funcionários vendedores

A eliminação reatribui bilhetes/reservas/clientes/movimentos ao admin antes de apagar o utilizador; as chaves estrangeiras confirmam que isso é necessário (bilhetes e reservas são RESTRICT). Ainda assim falha — a causa exata não está confirmada.

Passos:

1. Fazer a função devolver a mensagem de erro real do backend (hoje pode ser engolida) e reproduzir a eliminação para ver a causa.
2. Corrigir o que aparecer: incluir todas as tabelas ligadas ao utilizador na reatribuição (incluindo mudanças de rota) e apagar primeiro as linhas de papéis/perfil, se for esse o bloqueio.
3. Confirmar no preview que um vendedor é eliminado com sucesso.

## Detalhes técnicos

- Migração SQL: substituir `bilhete_debita_companhia()` por lógica de lucro baseada em diferença (`INSERT` e `UPDATE` da `taxa_agencia`, estorno no cancelamento) e recalcular `fundo_lucro` por agência.
- `src/routes/_authenticated/bilhetes.tsx`: novos KPIs (Total geral, Lucro), diálogo de confirmação de cancelamento e ação "Eliminar bilhete" para admins.
- Nova server function de eliminação de bilhete com verificação de admin; ajustes em `src/lib/admin.functions.ts` para o erro real e limpeza completa antes de apagar o utilizador.
- `src/routes/_authenticated/capital.tsx`: sem mudança estrutural, apenas beneficia do fundo corrigido.
