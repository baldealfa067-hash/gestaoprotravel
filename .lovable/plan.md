## Objetivo
Corrigir a lógica do módulo Capital para refletir a operação real da agência: o **capital operacional é FIXO**, apenas circula entre Caixas/Bancos → Companhias → Dívidas → e volta. O lucro (taxa) sai do fluxo e vai para o Fundo de Lucro.

Sem tocar em: triggers de movimentação, RLS, autenticação, reservas, recibos, bilhetes, histórico.

---

## 1. Novo campo persistente: `capital_base_operacional`

Migration `ALTER TABLE public.agency_settings ADD COLUMN capital_base_operacional NUMERIC NOT NULL DEFAULT 0;`

Fica em `agency_settings` (já existente, não cria tabela nova).

---

## 2. Corrigir a função `verificar_consistencia_capital`

Substituir pela nova lógica (mantendo assinatura de colunas, apenas mudando o cálculo de `diferenca` e `consistente`):

```
capital_operacional_atual = capital_contas + capital_companhias + capital_dividas
capital_base              = agency_settings.capital_base_operacional
diferenca                 = capital_operacional_atual - capital_base
consistente               = ABS(diferenca) < 1
```

- Fundo de lucro **NÃO** entra no cálculo de consistência (só é reportado).
- `taxa_acumulada` deixa de ser referência de integridade (fica apenas informativa).
- Adicionar coluna retornada `capital_base` para o frontend consumir.

Triggers de movimentação (`aplicar_movimentacao`) **não mudam** — já separam corretamente custo → conta e taxa → fundo_lucro no `pagamento_cliente`.

---

## 3. Página Configurações

Adicionar um campo numérico **"Capital base operacional"** na secção da agência (`src/routes/_authenticated/configuracoes.tsx`), salvando no upsert existente. Sem lógica nova de save.

---

## 4. Redesenhar o topo da página Capital

Substituir o cartão "Capital total rastreado" + os 4 cartões atuais por uma grelha limpa de 4 cartões:

```text
┌──────────────────────┬──────────────────────┬──────────────────────┬──────────────────────┐
│ Capital Base         │ Capital em Circulação│ Divergência          │ Fundo de Lucro       │
│ (valor fixo)         │ Caixa+Cias+Dívidas   │ Circulação − Base    │ (separado)           │
└──────────────────────┴──────────────────────┴──────────────────────┴──────────────────────┘
```

Regras visuais:
- **Divergência = 0** → cartão verde "Capital operacional íntegro".
- **Divergência ≠ 0** → cartão vermelho/âmbar com o valor e sinal (+ sobra / − falta).
- Badge do topo passa a usar a nova regra (íntegro vs divergente).

Abaixo, manter uma linha auxiliar (compacta) com a repartição do "Capital em Circulação": Caixa/Bancos · Companhias · Dívidas — mesmos números, só sem redundar como cartões grandes.

Tabs (Contas, Receita, Distribuição, Movimentações, Dívidas, Companhias) e todos os diálogos existentes ficam iguais. O card "Capital Circulante" dentro da tab Contas é removido (fica redundante com o novo topo).

---

## 5. Ajustes no frontend

- `useAgencySettings` já devolve o novo campo automaticamente após regen de types.
- `capital.tsx`: consumir `c.capital_base` da RPC e calcular divergência no client se necessário (fallback), mas idealmente vem da RPC.
- Remover uso de `taxa_acumulada` como sinal de consistência (mantém-se só na tab Receita se relevante).

---

## O que NÃO muda
- Triggers, RLS, políticas, esquema dos bilhetes/reservas/movimentações.
- Cálculo automático da taxa (6% mesmo continente / 30k económica / 50k executiva).
- Fluxo de carregamento, emissão, pagamento e estorno.
- Histórico imutável de `movimentacoes_capital`.

---

## Detalhes técnicos (para dev)

**Migration única**:
1. `ALTER TABLE agency_settings ADD COLUMN capital_base_operacional NUMERIC NOT NULL DEFAULT 0;`
2. `CREATE OR REPLACE FUNCTION verificar_consistencia_capital()` retornando também `capital_base NUMERIC`, com nova fórmula de `diferenca` e `consistente` conforme acima.

**Ficheiros a editar**:
- `supabase/migrations/<novo>.sql` (schema + função)
- `src/routes/_authenticated/configuracoes.tsx` (input de capital base)
- `src/routes/_authenticated/capital.tsx` (novo header de 4 cartões, remover redundância)

Sem alterações em `bilhetes.tsx`, `reservas.tsx`, hooks de alarme, print, ou triggers.
