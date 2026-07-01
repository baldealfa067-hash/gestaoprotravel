## Objetivo

1. Introduzir o conceito de **Capital Circulante** como bolso fixo que financia companhias e recebe o custo de volta após venda.
2. Ligar **Bilhetes → Reservas** com botão de criação direta.

---

## 1. Capital Circulante (conta dedicada)

### Base de dados (migração)
- Garantir a existência de uma conta `contas_financeiras` com `nome = 'Capital Circulante'`, `tipo = 'banco'` (criada via seed idempotente na migração; marcada como conta padrão do sistema).
- Adicionar coluna `sistema BOOLEAN DEFAULT false` em `contas_financeiras` para proteger a conta Capital Circulante de eliminação/renomeação acidental.
- Atualizar o trigger `aplicar_movimentacao` para o tipo `pagamento_cliente`:
  - Ler `custo` e `taxa_agencia` do bilhete associado.
  - Creditar `custo` na conta destino escolhida (o Capital Circulante por padrão).
  - Creditar `taxa_agencia` diretamente no `fundo_lucro`.
  - Marcar bilhete como `pago = true`.
  - Se `valor` do movimento ≠ custo+taxa, usar proporção; se bilhete não estiver associado, cair no comportamento atual (tudo para a conta).
- Manter `carregamento_companhia` como está: já debita a conta origem (que passa a ser o Capital Circulante por defeito) e credita a companhia.
- Manter `aporte_capital`: por defeito credita o Capital Circulante.

### UI — `src/routes/_authenticated/capital.tsx`
- Novo card "Capital Circulante" no topo do separador **Contas** mostrando saldo atual, total já usado em carregamentos e total devolvido por pagamentos (agregando `movimentacoes_capital`).
- Nos diálogos `AporteDialog` e `CarregarCompanhiaDialog`: pré-selecionar a conta "Capital Circulante" e destacá-la visualmente na lista.
- Bloquear apagar/renomear conta com `sistema = true`.
- Legenda explicativa: "Este valor diminui ao carregar companhias e volta a subir quando o cliente paga (custo → Capital Circulante, taxa → Fundo de Lucro)."

### UI — `src/routes/_authenticated/bilhetes.tsx`
- No diálogo "Registar Pagamento", a conta destino passa a estar pré-selecionada como Capital Circulante e o resumo mostra a divisão: `Custo → Capital Circulante` + `Taxa → Fundo de Lucro`.
- Remover a necessidade de o admin transferir lucro manualmente depois.

---

## 2. Ligação Bilhete → Reserva

### Base de dados (mesma migração)
- Adicionar coluna `bilhete_id UUID REFERENCES bilhetes(id) ON DELETE SET NULL` em `reservas` (facilita rastreio inverso).
- Índice em `reservas.bilhete_id`.

### UI — `src/routes/_authenticated/bilhetes.tsx`
- Novo botão/ação **"Criar reserva"** no dropdown de cada linha do bilhete.
- Diálogo `NovaReservaDoBilheteDialog`:
  - Pré-preenche: cliente, companhia, origem, destino, classe, continentes, data_viagem, observações.
  - Campos a preencher: `PNR` (obrigatório) e `data_limite` (obrigatório, com sugestão default de 48h).
  - Ao gravar: insere em `reservas` com `bilhete_id` = bilhete atual e `user_id` = auth.uid().
- Badge visual no bilhete quando já existe reserva associada (consulta agregada por `bilhete_id`).

### UI — `src/routes/_authenticated/reservas.tsx`
- Coluna/badge indicando "Origem: bilhete" quando `bilhete_id` está preenchido, com link para o bilhete.

---

## Fora de âmbito
- Conversão reserva → bilhete (não solicitada nesta iteração).
- Alteração da lógica de cálculo de taxa ou dos outros tipos de movimentação.

## Resumo

Capital Circulante torna-se uma conta protegida do sistema; carregar companhia consome dela, pagamento de cliente devolve o custo a ela e envia só a taxa para o Fundo de Lucro. No módulo Bilhetes, cada linha ganha ação "Criar reserva" que gera um PNR ligado ao bilhete.