## O que vou mudar

Três coisas, na ordem que pediste:

---

### 1. Companhias como "ficheiro Excel"

Página **Configurações → Companhias** (ou botão na página Capital) passa a ter uma tabela editável estilo planilha:

- Colunas: **Nome**, **Continente**, **Saldo atual** (só leitura), **Ações**
- Botão **+ Adicionar linha** cria uma companhia nova em branco
- Editas o nome direto na célula, escolhes continente, clicas **Guardar**
- Podes eliminar linhas (só se saldo = 0)
- Nenhum carregamento é feito aqui — isto é só o cadastro

**Recarregar companhia** continua no botão de ação rápida do Capital: escolhes a companhia da lista, escreves o valor, confirma → sai do Capital Circulante e entra no saldo da companhia (já funciona assim, não mexo).

---

### 2. Venda de bilhete desconta da companhia, não do circulante

Hoje o custo do bilhete não sai de lado nenhum na emissão — só a taxa da agência entra no Fundo de Lucro quando o cliente paga. O saldo da companhia só desce se houver um movimento `emissao_bilhete` manual.

Vou mudar o **trigger `bilhete_auto_taxa`** (ou criar um novo trigger `AFTER INSERT/UPDATE` em bilhetes) para que, quando o bilhete passa a `emitido`:

- Cria automaticamente um movimento `emissao_bilhete` com `companhia_id = bilhete.companhia_id` e `valor = custo`
- O trigger `aplicar_movimentacao` já desconta esse valor do saldo da companhia
- Se o bilhete for cancelado, devolve o valor à companhia

No formulário de bilhete o vendedor **já seleciona a companhia** — não muda nada na UI, só passa a ter efeito no saldo.

**Capital Circulante não é tocado na emissão.** Só é tocado quando:
- Cliente paga (entra dinheiro no caixa)
- Alguém carrega a companhia (sai do caixa)

---

### 3. Fluxo Cliente → Reserva → Bilhete → Emitir

Hoje o fluxo prático é: criar cliente → criar bilhete → (opcional) criar reserva.

Vou inverter:

**Novo fluxo em 4 passos:**

1. **Cliente** — já existe, sem mudança
2. **Reserva** (obrigatória antes do bilhete) — página Reservas ganha um botão "Nova reserva" que só pede: cliente, PNR, origem, destino, companhia, data limite. **Sem custo, sem taxa, sem preço.**
3. **Emitir bilhete a partir da reserva** — na linha da reserva ativa aparece botão **"Emitir bilhete"**. Abre um dialog que já traz cliente/companhia/rota da reserva, e o vendedor preenche só o **custo** e a **classe**. O sistema calcula taxa automaticamente, cria o bilhete, marca a reserva como `emitida` e desconta o custo da companhia (passo 2).
4. **Registar pagamento** — igual ao que já existe (na página Bilhetes ou Capital).

**Página Bilhetes** deixa de ter botão "Novo bilhete" direto. Passa a ser só uma lista/histórico + pagamentos. Bilhete só nasce via "Emitir da reserva".

---

## O que NÃO vou mudar

- Lucro / Fundo de Lucro (continua a entrar quando cliente paga)
- RLS, autenticação, ajustes manuais com PIN
- Estrutura da tabela `bilhetes` — só o trigger que gera o movimento na emissão
- Impressão de recibos / PDFs

---

## Ficheiros afetados

**Migração** (1 nova):
- Novo trigger em `bilhetes` para gerar `emissao_bilhete` automaticamente na transição para `emitido` e reverter no cancelamento

**Frontend:**
- `src/routes/_authenticated/configuracoes.tsx` — tabela editável de companhias (ou nova sub-rota `capital/companhias`)
- `src/routes/_authenticated/reservas.tsx` — botão "Nova reserva" simplificado + botão "Emitir bilhete" por linha
- `src/routes/_authenticated/bilhetes.tsx` — remove "Novo bilhete", mantém lista + pagamento
- Novo dialog `EmitirBilheteDialog` reutilizando dados da reserva

## Pergunta antes de começar

Confirma só uma coisa: os bilhetes **antigos já emitidos** (que existem hoje sem terem descontado da companhia) — deixo como estão (histórico) ou fazes questão que eu regularize o saldo das companhias para trás?