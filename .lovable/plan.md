## 1. Ampliar a tabela `agency_settings`

Adicionar colunas para identidade completa da agência:

- `logo_url` (text) — Uplaod de imagem  (Supabase Storage)
- `telefone` (text)
- `email` (text)
- `endereco` (text)
- `nif` (text, opcional — útil em recibos)

Criar bucket público `agency-assets` no Storage para armazenar o logotipo, com policies de upload/update restritas a admins e leitura pública.

## 2. Página **Configurações** (`src/routes/_authenticated/configuracoes.tsx`)

Reformular o formulário conforme a imagem de referência:

- Nome da agência
- Moeda principal
- **Logótipo** — miniatura + input `type=file` (PNG/JPG/WEBP/SVG, máx 1 MB) com botão "Remover"
- Telefone e Email (grid 2 colunas)
- Endereço (textarea)
- Botão "Guardar"

Só admins podem editar. Upload do logo vai para o bucket `agency-assets` e grava a URL em `logo_url`. Validação de tamanho/tipo no cliente.

## 3. Impressão / PDF de bilhetes e recibos

Criar componente `PrintableDocument` reutilizável com cabeçalho oficial:

```
[LOGO]   Agência Travel GB
         Praça retunda de antula
         Tel: 957107795 · baldealfa067@gmail.com
         NIF: ...
─────────────────────────────────────────────
BILHETE Nº ... / RECIBO Nº ...
[corpo específico]
```

Dois documentos:

- **Bilhete emitido** — passageiro, PNR, rota, data viagem, classe, companhia, valor, taxa, total
- **Recibo de pagamento** — cliente, bilhete associado, valor pago, forma de pagamento, data, assinatura

Implementação:

- Componente React `<PrintableDocument variant="bilhete|recibo" data={...} />` já com estilos `@media print` (esconde nav/sidebar) e classes A4.
- Hook `useAgencyBranding()` — reusa `useAgencySettings` e devolve nome, logo, contactos.
- Botão **Imprimir / Baixar PDF** aparece em:
  - Página `bilhetes.tsx`: em cada linha com status `emitido` ou `pago`
  - Dialog de "Registar Pagamento" após sucesso: botão para gerar recibo
- Ação: abre um dialog com o preview do documento + botões "Imprimir" (usa `window.print()` filtrando via CSS) e "Baixar PDF" (usa `html2pdf.js` ou `jspdf` + `html2canvas`).

Dependência nova: `html2pdf.js` (bundla jspdf + html2canvas, funciona no browser sem Node APIs).

## 4. Fluxo do utilizador

1. Admin abre Configurações → preenche dados e faz upload do logotipo → Guardar.
2. Ao emitir um bilhete ou registar pagamento, aparece botão **Imprimir/PDF**.
3. Clica → abre preview com branding da agência → imprime ou baixa PDF.

## Ficheiros afetados

- `supabase/migrations/<novo>.sql` — colunas novas + bucket + policies
- `src/routes/_authenticated/configuracoes.tsx` — formulário expandido
- `src/hooks/use-agency-settings.ts` — sem mudança (tipos regenerados)
- `src/components/printable/PrintableDocument.tsx` (novo)
- `src/components/printable/PrintBilheteDialog.tsx` (novo)
- `src/components/printable/PrintReciboDialog.tsx` (novo)
- `src/routes/_authenticated/bilhetes.tsx` — botões Imprimir/Recibo
- `src/styles.css` — regras `@media print`
- `package.json` — adicionar `html2pdf.js`

Confirma para eu implementar?