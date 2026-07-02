## Diagnóstico

O modelo atual está a interpretar mal a tua operação. Verifiquei na base:

- Capital Base (configurações): **20.000.000**
- Contas (Caixa/Capital Circulante): **167.000**
- Companhias (saldo carregado): **53.000**
- Dívidas de clientes: **0**
- Total operacional: **220.000** → Divergência **-19.780.000**

O sistema espera que **Caixa + Companhias + Dívidas = Capital Base**. Como nunca fizeste um **Aporte** de 20M para o Capital Circulante, a conta só tem os movimentos reais (167k). Por isso a divergência é enorme e não "volta" quando pagas bilhetes — pagar bilhete só move 53k↔167k dentro dos 220k, nunca chega perto dos 20M.

Além disso, o cartão **"Capital em Circulação"** hoje mostra o *total operacional* (220k), o que confunde: tu lês "circulação" como "dinheiro que saiu do caixa para companhias/dívidas".

## O que vou mudar

### 1. Sincronizar Capital Base ↔ Capital Circulante (backend)
Quando gravas o "Capital base operacional" nas Configurações, o sistema passa a **ajustar automaticamente** o saldo da conta *Capital Circulante* para que:

```
Caixa (Capital Circulante) = Capital Base − Saldo em Companhias − Dívidas pendentes
```

Feito via `createServerFn` que:
- lê o novo `capital_base_operacional`
- calcula o delta necessário na conta sistema
- regista um movimento `aporte_capital` (ou ajuste) para manter histórico auditável

Assim, ao definires 20M, a conta Capital Circulante fica com **19.947.000** (20M − 53k companhias) e a divergência vai a zero.

### 2. Reinterpretar os cartões da página Capital
Substituir os 4 cartões de topo para refletir o teu modelo mental:

```text
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│  Capital Base   │   Em Caixa /    │  Fora do Caixa  │  Fundo de Lucro │
│    (fixo)       │     Bancos      │ (Cias + Dívidas)│   (separado)    │
│   20.000.000    │   19.947.000    │      53.000     │     101.020     │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
                  Consistência: Caixa + Fora = Base ✓
```

- **Capital Base**: valor fixo das configurações
- **Em Caixa / Bancos**: soma das contas financeiras (o que está "parado" pronto a usar)
- **Fora do Caixa**: soma de saldos de companhias + dívidas de clientes (dinheiro "em trânsito operacional")
- **Fundo de Lucro**: mantém-se separado (não entra na equação da base)

Badge de integridade compara `Caixa + Fora` contra `Base`.

### 3. Fluxo passa a fazer sentido intuitivo
- **Carregar companhia 100k**: Caixa −100k, Fora +100k → total inalterado ✓
- **Emitir bilhete (custo 80k)**: Fora (companhias) −80k, Fora (dívidas) +80k → total inalterado ✓
- **Cliente paga 80k**: Fora (dívidas) −80k, Caixa +80k → **dinheiro volta ao caixa** ✓
- Taxa do bilhete vai para Fundo de Lucro (separado, não afeta base)

## Ficheiros afetados

- `supabase/migrations/*` — nova função `sincronizar_capital_base()` + trigger opcional
- `src/lib/capital-sync.functions.ts` — server fn chamada ao gravar configurações
- `src/routes/_authenticated/configuracoes.tsx` — chama a sync após guardar
- `src/routes/_authenticated/capital.tsx` — refactor dos 4 cartões de topo (só apresentação)

Nenhuma alteração ao fluxo de bilhetes/reservas/pagamentos — a lógica já está correta, só a leitura estava confusa.

## Confirma antes de eu implementar

Uma dúvida operacional: quando alteras o Capital Base (ex: subir de 20M para 25M), queres que o sistema **injete automaticamente os 5M extra** na conta Capital Circulante (registando um `aporte_capital`), ou preferes que só **avise da divergência** e tu fazes o aporte manualmente na aba Contas? Recomendo a primeira (automática) porque é o que descreves.