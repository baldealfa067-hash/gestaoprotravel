import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";

// A4 portrait 210x297
const MARGIN = 12;
const PAGE_W = 210;
const PAGE_H = 297;

const clean = (s: string | number | null | undefined): string =>
  String(s ?? "")
    .replace(/\u202F/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\u2009/g, " ")
    .replace(/\u2013|\u2014/g, "-");

const money = (v: number, c: string) => clean(formatCurrency(v, c));

type Bilhete = {
  id: string;
  data_viagem: string | null;
  created_at: string;
  cliente: string;
  origem: string;
  destino: string;
  classe: string;
  companhia: string;
  companhia_id: string | null;
  custo: number;
  taxa: number;
  total: number;
  ref: string;
};

type Mudanca = {
  id: string;
  created_at: string;
  cliente: string;
  bilhete_id: string | null;
  rota_antiga: string;
  rota_nova: string;
  taxa: number;
  pago: number;
  situacao: "pago" | "parcial" | "pendente" | "n/a";
};

async function loadData() {
  const [{ data: bs, error: e1 }, { data: cs, error: e2 }, { data: muds, error: e3 }] =
    await Promise.all([
      (supabase as any)
        .from("bilhetes")
        .select(
          "id, data_viagem, created_at, valor_cobrado, custo, taxa_agencia, taxa_mudancas_total, classe, origem, destino, companhia, companhia_id, status, cliente:cliente_id(full_name)",
        )
        .neq("status", "cancelado")
        .order("data_viagem", { ascending: true, nullsFirst: false }),
      (supabase as any)
        .from("companhias_aereas")
        .select("id, nome, codigo, saldo, modo, ativa")
        .order("nome"),
      (supabase as any)
        .from("mudancas_rota")
        .select(
          "id, created_at, rota_antiga, rota_nova, taxa_mudanca, bilhete_id, bilhete:bilhete_id(cliente:cliente_id(full_name))",
        )
        .order("created_at", { ascending: true }),
    ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;

  const ids = (bs ?? []).map((b: any) => b.id);
  const pagosMudanca: Record<string, number> = {};
  if (ids.length) {
    const { data: movs } = await (supabase as any)
      .from("movimentacoes_capital")
      .select("bilhete_id, valor, tipo")
      .eq("tipo", "pagamento_taxa_mudanca")
      .in("bilhete_id", ids);
    for (const m of movs ?? []) {
      pagosMudanca[m.bilhete_id] = (pagosMudanca[m.bilhete_id] ?? 0) + Number(m.valor);
    }
  }

  const bilhetes: Bilhete[] = (bs ?? []).map((b: any, i: number) => ({
    id: b.id,
    data_viagem: b.data_viagem,
    created_at: b.created_at,
    cliente: b.cliente?.full_name ?? "—",
    origem: b.origem ?? "",
    destino: b.destino ?? "",
    classe: b.classe === "executiva" ? "EXEC" : "ECO",
    companhia: b.companhia ?? "SEM COMPANHIA",
    companhia_id: b.companhia_id,
    custo: Number(b.custo ?? 0) + Number(b.taxa_mudancas_total ?? 0),
    taxa: Number(b.taxa_agencia ?? 0),
    total: Number(b.custo ?? 0) + Number(b.taxa_mudancas_total ?? 0) + Number(b.taxa_agencia ?? 0),
    ref: String(i + 1),
  }));

  const mudancas: Mudanca[] = (muds ?? []).map((m: any) => {
    const total = Number(m.taxa_mudanca ?? 0);
    const pg = m.bilhete_id ? pagosMudanca[m.bilhete_id] ?? 0 : 0;
    let situacao: Mudanca["situacao"] = m.bilhete_id ? "pendente" : "n/a";
    if (m.bilhete_id) {
      if (pg + 0.01 >= total) situacao = "pago";
      else if (pg > 0) situacao = "parcial";
    }
    return {
      id: m.id,
      created_at: m.created_at,
      cliente: m.bilhete?.cliente?.full_name ?? "—",
      bilhete_id: m.bilhete_id,
      rota_antiga: m.rota_antiga ?? "",
      rota_nova: m.rota_nova ?? "",
      taxa: total,
      pago: pg,
      situacao,
    };
  });

  return { bilhetes, companhias: (cs ?? []) as any[], mudancas };
}

async function loadCapitalCirculante() {
  const { data: contas } = await (supabase as any)
    .from("contas_financeiras")
    .select("saldo_inicial, ativa");
  return (contas ?? [])
    .filter((c: any) => c.ativa)
    .reduce((s: number, c: any) => s + Number(c.saldo_inicial ?? 0), 0);
}

export async function exportarRelatorioGeralPDF(opts: {
  currency: string;
  agencyName: string;
}) {
  const [{ bilhetes, companhias, mudancas }, capitalCirculante] = await Promise.all([
    loadData(),
    loadCapitalCirculante(),
  ]);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const now = new Date();
  

  // Agrupar bilhetes por companhia
  const grupos = new Map<string, Bilhete[]>();
  for (const b of bilhetes) {
    const key = (b.companhia || "SEM COMPANHIA").trim().toUpperCase();
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key)!.push(b);
  }
  for (const c of companhias) {
    const key = (c.nome || "").trim().toUpperCase();
    if (key && !grupos.has(key)) grupos.set(key, []);
  }

  const nomesOrdenados = Array.from(grupos.keys()).sort();

  // ── Cabeçalho ─────────────────────────────────────────────────────
  const dataHora = now.toLocaleString("pt-PT", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(clean(opts.agencyName || "Agência").toUpperCase(), PAGE_W / 2, 16, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Emitido em: ${clean(dataHora)}`, MARGIN, 24);
  doc.text(`Moeda: ${clean(opts.currency)}`, PAGE_W - MARGIN, 24, { align: "right" });

  doc.setDrawColor(60);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, 28, PAGE_W - MARGIN, 28);

  let y = 36;

  // Acumuladores globais
  let totalPrecoBilhetes = 0;
  let totalTaxas = 0;
  let totalGlobal = 0;

  const sectionTitle = (title: string) => {
    if (y > PAGE_H - 40) { doc.addPage(); y = MARGIN + 4; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setFillColor(30, 58, 138);
    doc.setTextColor(255);
    doc.rect(MARGIN, y - 4, PAGE_W - 2 * MARGIN, 7, "F");
    doc.text(clean(title), MARGIN + 2, y + 1);
    doc.setTextColor(0);
    y += 6;
  };

  // ── 1. Companhias ─────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("1. COMPANHIAS / AGÊNCIAS", MARGIN, y);
  y += 5;

  for (const nome of nomesOrdenados) {
    const rows = grupos.get(nome) ?? [];
    sectionTitle(nome);

    const subCusto = rows.reduce((s, r) => s + r.custo, 0);
    const subTaxa = rows.reduce((s, r) => s + r.taxa, 0);
    const subTotal = rows.reduce((s, r) => s + r.total, 0);
    totalPrecoBilhetes += subCusto;
    totalTaxas += subTaxa;
    totalGlobal += subTotal;

    if (rows.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text("Sem bilhetes registados.", MARGIN + 2, y + 4);
      doc.setTextColor(0);
      y += 10;
      continue;
    }

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN + 8 },
      head: [["REF", "DATA", "CLIENTE", "ITINERÁRIO", "CL.", "P. UNITÁRIO", "T. AGÊNCIA", "P. GLOBAL"]],
      body: rows.map((r, i) => [
        String(i + 1),
        clean(r.data_viagem ? formatDate(r.data_viagem) : "—"),
        clean(r.cliente),
        clean(`${r.origem} -> ${r.destino}`),
        r.classe,
        money(r.custo, opts.currency),
        money(r.taxa, opts.currency),
        money(r.total, opts.currency),
      ]),
      foot: [[
        { content: `TOTAL ${nome}`, colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
        { content: money(subCusto, opts.currency), styles: { halign: "right", fontStyle: "bold" } },
        { content: money(subTaxa, opts.currency), styles: { halign: "right", fontStyle: "bold" } },
        { content: money(subTotal, opts.currency), styles: { halign: "right", fontStyle: "bold" } },
      ]],
      styles: { fontSize: 8, cellPadding: 1.5, overflow: "linebreak", lineColor: [200, 200, 200], lineWidth: 0.1 },
      headStyles: { fillColor: [235, 235, 235], textColor: 0, fontStyle: "bold" },
      footStyles: { fillColor: [245, 245, 245], textColor: 0 },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 20 },
        2: { cellWidth: 40 },
        3: { cellWidth: 42 },
        4: { cellWidth: 10 },
        5: { halign: "right", cellWidth: 22 },
        6: { halign: "right", cellWidth: 22 },
        7: { halign: "right", cellWidth: 20, fontStyle: "bold" },
      },
      theme: "grid",
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── 2. Mudanças de rota ───────────────────────────────────────────
  if (y > PAGE_H - 50) { doc.addPage(); y = MARGIN + 4; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("2. MUDANÇAS DE ROTA", MARGIN, y);
  y += 5;

  const totalMudancas = mudancas.reduce((s, m) => s + m.taxa, 0);
  const situacaoLabel: Record<Mudanca["situacao"], string> = {
    pago: "Pago",
    parcial: "Parcial",
    pendente: "Pendente",
    "n/a": "—",
  };

  if (mudancas.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("Sem mudanças de rota no período.", MARGIN, y + 4);
    doc.setTextColor(0);
    y += 10;
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN + 8 },
      head: [["REF", "DATA", "CLIENTE", "ROTA ANTERIOR", "NOVA ROTA", "TIPO", "VALOR", "SITUAÇÃO"]],
      body: mudancas.map((m, i) => [
        String(i + 1),
        clean(formatDate(m.created_at)),
        clean(m.cliente),
        clean(m.rota_antiga),
        clean(m.rota_nova),
        "MUDANÇA",
        money(m.taxa, opts.currency),
        situacaoLabel[m.situacao],
      ]),
      foot: [[
        { content: "TOTAL DE MUDANÇAS DE ROTA", colSpan: 6, styles: { halign: "right", fontStyle: "bold" } },
        { content: money(totalMudancas, opts.currency), styles: { halign: "right", fontStyle: "bold" } },
        { content: "", styles: {} },
      ]],
      styles: { fontSize: 8, cellPadding: 1.5, overflow: "linebreak", lineColor: [200, 200, 200], lineWidth: 0.1 },
      headStyles: { fillColor: [235, 235, 235], textColor: 0, fontStyle: "bold" },
      footStyles: { fillColor: [245, 245, 245], textColor: 0 },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 20 },
        2: { cellWidth: 34 },
        3: { cellWidth: 28 },
        4: { cellWidth: 28 },
        5: { cellWidth: 18 },
        6: { halign: "right", cellWidth: 24 },
        7: { cellWidth: 24 },
      },
      theme: "grid",
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── 3. Resumo das vendas ──────────────────────────────────────────
  if (y > PAGE_H - 60) { doc.addPage(); y = MARGIN + 4; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("3. RESUMO DAS VENDAS", MARGIN, y);
  y += 5;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN + 8 },
    body: [
      [
        { content: "TOTAL PREÇO UNITÁRIO", styles: { fontStyle: "bold", fillColor: [255, 249, 196] } },
        { content: money(totalPrecoBilhetes, opts.currency), styles: { halign: "right", fontStyle: "bold", fillColor: [255, 249, 196] } },
      ],
      [
        { content: "TOTAL TAXAS", styles: { fontStyle: "bold", fillColor: [255, 249, 196] } },
        { content: money(totalTaxas, opts.currency), styles: { halign: "right", fontStyle: "bold", fillColor: [255, 249, 196] } },
      ],
      [
        { content: "TOTAL GLOBAL", styles: { fontStyle: "bold", fillColor: [244, 67, 54], textColor: 255 } },
        { content: money(totalGlobal, opts.currency), styles: { halign: "right", fontStyle: "bold", fillColor: [244, 67, 54], textColor: 255 } },
      ],
    ],
    styles: { fontSize: 10, cellPadding: 2.5, lineColor: [180, 180, 180], lineWidth: 0.15 },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { halign: "right", cellWidth: PAGE_W - 2 * MARGIN - 120 },
    },
    theme: "grid",
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── 4. Conta Geral ────────────────────────────────────────────────
  if (y > PAGE_H - 80) { doc.addPage(); y = MARGIN + 4; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("4. CONTA GERAL", MARGIN, y);
  y += 5;

  const companhiasOrdenadas = [...(companhias ?? [])]
    .filter((c: any) => c.ativa !== false && Number(c.saldo ?? 0) > 0)
    .sort((a: any, b: any) => (a.nome ?? "").localeCompare(b.nome ?? ""));

  const contaGeralRows: any[] = [
    [
      { content: "PREÇO UNITÁRIO", styles: { fontStyle: "bold" } },
      { content: money(totalPrecoBilhetes, opts.currency), styles: { halign: "right" } },
    ],
    [
      { content: "CAPITAL CIRCULANTE", styles: { fontStyle: "bold" } },
      { content: money(capitalCirculante, opts.currency), styles: { halign: "right" } },
    ],
  ];
  let somaCompanhias = 0;
  for (const c of companhiasOrdenadas) {
    const saldo = Number(c.saldo ?? 0);
    somaCompanhias += saldo;
    contaGeralRows.push([
      { content: clean((c.nome ?? "").toUpperCase()), styles: { fontStyle: "bold" } },
      { content: money(saldo, opts.currency), styles: { halign: "right" } },
    ]);
  }

  const totalContaGeral = totalPrecoBilhetes + capitalCirculante + somaCompanhias;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN + 8 },
    head: [[
      { content: "CONTA GERAL", colSpan: 2, styles: { halign: "center", fillColor: [252, 228, 214], textColor: 0, fontStyle: "bold" } },
    ]],
    body: contaGeralRows,
    foot: [[
      { content: "TOTAL", styles: { fontStyle: "bold", fillColor: [255, 235, 59], textColor: 0 } },
      { content: money(totalContaGeral, opts.currency), styles: { halign: "right", fontStyle: "bold", fillColor: [255, 235, 59], textColor: 0 } },
    ]],
    styles: { fontSize: 10, cellPadding: 2.5, lineColor: [180, 180, 180], lineWidth: 0.15 },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { halign: "right", cellWidth: PAGE_W - 2 * MARGIN - 120 },
    },
    theme: "grid",
  });

  // ── Rodapé ────────────────────────────────────────────────────────
  const total = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(130);
    doc.text(clean(opts.agencyName), MARGIN, PAGE_H - 5);
    doc.text(`Página ${i} de ${total}`, PAGE_W - MARGIN, PAGE_H - 5, { align: "right" });
    doc.setTextColor(0);
  }

  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  doc.save(`Relatorio_Geral_${dd}-${mm}-${yyyy}.pdf`);
}
