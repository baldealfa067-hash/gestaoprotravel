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
  const pagos: Record<string, number> = {};
  const pagosMudanca: Record<string, number> = {};
  if (ids.length) {
    const { data: movs } = await (supabase as any)
      .from("movimentacoes_capital")
      .select("bilhete_id, valor, tipo")
      .in("tipo", ["pagamento_cliente", "pagamento_taxa_mudanca"])
      .in("bilhete_id", ids);
    for (const m of movs ?? []) {
      pagos[m.bilhete_id] = (pagos[m.bilhete_id] ?? 0) + Number(m.valor);
      if (m.tipo === "pagamento_taxa_mudanca")
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
    custo: Number(b.custo ?? 0),
    taxa: Number(b.taxa_agencia ?? 0),
    total: Number(b.valor_cobrado ?? 0) - Number(b.taxa_mudancas_total ?? 0),
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

async function loadResumo() {
  const [{ data: cons }, { data: agency }, { data: contas }] = await Promise.all([
    (supabase as any).rpc("verificar_consistencia_capital"),
    (supabase as any).from("agency_settings").select("*").limit(1).maybeSingle(),
    (supabase as any).from("contas_financeiras").select("saldo_inicial, ativa"),
  ]);
  const consistencia = Array.isArray(cons) ? cons[0] : cons;
  const capitalCirculante =
    (contas ?? [])
      .filter((c: any) => c.ativa)
      .reduce((s: number, c: any) => s + Number(c.saldo_inicial ?? 0), 0) || 0;
  return { consistencia, agency, capitalCirculante };
}

export async function exportarRelatorioGeralPDF(opts: {
  currency: string;
  agencyName: string;
}) {
  const [{ bilhetes, companhias, mudancas }, resumo] = await Promise.all([
    loadData(),
    loadResumo(),
  ]);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const now = new Date();
  const emissao = now.toLocaleString("pt-PT");

  // Agrupar bilhetes por companhia
  const grupos = new Map<string, Bilhete[]>();
  for (const b of bilhetes) {
    const key = (b.companhia || "SEM COMPANHIA").trim().toUpperCase();
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key)!.push(b);
  }
  // Garantir companhias existentes mesmo sem bilhetes
  for (const c of companhias) {
    const key = (c.nome || "").trim().toUpperCase();
    if (key && !grupos.has(key)) grupos.set(key, []);
  }

  const nomesOrdenados = Array.from(grupos.keys()).sort();

  // ── Cabeçalho ─────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(clean(opts.agencyName || "Agência").toUpperCase(), PAGE_W / 2, 14, { align: "center" });
  doc.setFontSize(12);
  doc.text("RELATÓRIO GERAL DE CONTAS", PAGE_W / 2, 21, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Emitido: ${clean(emissao)}`, MARGIN, 28);
  doc.text(`Moeda: ${clean(opts.currency)}`, PAGE_W - MARGIN, 28, { align: "right" });

  doc.setDrawColor(60);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, 31, PAGE_W - MARGIN, 31);

  let y = 36;

  // ── Totais gerais acumuladores ────────────────────────────────────
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
  doc.text("1. COMPANHIAS AÉREAS", MARGIN, y);
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
      head: [["REF", "DATA", "CLIENTE", "ITINERÁRIO", "CL.", "P. BILHETE", "T. AGÊNCIA", "P. GLOBAL"]],
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
      head: [["REF", "DATA", "CLIENTE", "ROTA", "TIPO", "VALOR", "SITUAÇÃO"]],
      body: mudancas.map((m, i) => [
        String(i + 1),
        clean(formatDate(m.created_at)),
        clean(m.cliente),
        clean(`${m.rota_antiga} -> ${m.rota_nova}`),
        "MUDANÇA",
        money(m.taxa, opts.currency),
        situacaoLabel[m.situacao],
      ]),
      foot: [[
        { content: "TOTAL DE MUDANÇAS DE ROTA", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
        { content: money(totalMudancas, opts.currency), styles: { halign: "right", fontStyle: "bold" } },
        { content: "", styles: {} },
      ]],
      styles: { fontSize: 8, cellPadding: 1.5, overflow: "linebreak", lineColor: [200, 200, 200], lineWidth: 0.1 },
      headStyles: { fillColor: [235, 235, 235], textColor: 0, fontStyle: "bold" },
      footStyles: { fillColor: [245, 245, 245], textColor: 0 },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 22 },
        2: { cellWidth: 40 },
        3: { cellWidth: 55 },
        4: { cellWidth: 20 },
        5: { halign: "right", cellWidth: 25 },
        6: { cellWidth: 14 },
      },
      theme: "grid",
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── 3. Conta Geral ────────────────────────────────────────────────
  if (y > PAGE_H - 90) { doc.addPage(); y = MARGIN + 4; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("3. CONTA GERAL", MARGIN, y);
  y += 5;

  // Saldos por companhia (valor total em cada agência — não dívidas)
  const companhiasOrdenadas = [...(companhias ?? [])]
    .filter((c: any) => c.ativa !== false)
    .sort((a: any, b: any) => (a.nome ?? "").localeCompare(b.nome ?? ""));

  const somaCompanhias = companhiasOrdenadas.reduce(
    (s: number, c: any) => s + Number(c.saldo ?? 0),
    0,
  );

  const contaGeralRows: any[] = [
    [
      { content: "PREÇO UNITÁRIO", styles: { fontStyle: "bold", fillColor: [255, 249, 196] } },
      { content: money(totalPrecoBilhetes, opts.currency), styles: { halign: "right", fontStyle: "bold", fillColor: [255, 249, 196] } },
    ],
  ];
  for (const c of companhiasOrdenadas) {
    contaGeralRows.push([
      { content: clean((c.nome ?? "").toUpperCase()), styles: { fontStyle: "bold" } },
      { content: money(Number(c.saldo ?? 0), opts.currency), styles: { halign: "right" } },
    ]);
  }

  const totalContaGeral = totalPrecoBilhetes + somaCompanhias;

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
  y = (doc as any).lastAutoTable.finalY + 6;

  // ── 4. Indicadores complementares ─────────────────────────────────
  if (y > PAGE_H - 60) { doc.addPage(); y = MARGIN + 4; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("4. INDICADORES", MARGIN, y);
  y += 5;

  const c = resumo.consistencia ?? {};
  const dividasClientes = Number(c.capital_dividas ?? 0);
  const capitalCirculante = Number(c.capital_contas ?? resumo.capitalCirculante ?? 0);
  const dividasCias = (companhias ?? [])
    .filter((c: any) => (c.modo ?? "saldo") === "credito" && Number(c.saldo ?? 0) < 0)
    .reduce((s: number, c: any) => s + Math.abs(Number(c.saldo ?? 0)), 0);
  const totalGeral = capitalCirculante + dividasClientes + somaCompanhias;

  const indicadoresRows = [
    ["Total Taxas da Agência", money(totalTaxas, opts.currency)],
    ["Total Global das Vendas", money(totalGlobal, opts.currency)],
    ["Total de Mudanças de Rota", money(totalMudancas, opts.currency)],
    ["Total de Dívidas de Clientes", money(dividasClientes, opts.currency)],
    ["Total de Dívidas a Companhias", money(dividasCias, opts.currency)],
    ["Capital Circulante (Banco)", money(capitalCirculante, opts.currency)],
    ["Valor Total nas Companhias", money(somaCompanhias, opts.currency)],
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN + 8 },
    body: indicadoresRows,
    styles: { fontSize: 10, cellPadding: 2.2, lineColor: [200, 200, 200], lineWidth: 0.1 },
    columnStyles: {
      0: { cellWidth: 120, fontStyle: "bold" },
      1: { halign: "right", cellWidth: PAGE_W - 2 * MARGIN - 120 },
    },
    theme: "grid",
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  if (y > PAGE_H - 30) { doc.addPage(); y = MARGIN + 4; }
  doc.setFillColor(30, 58, 138);
  doc.setTextColor(255);
  doc.rect(MARGIN, y, PAGE_W - 2 * MARGIN, 14, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("TOTAL GERAL", MARGIN + 3, y + 6);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Capital Circulante + Dívidas de Clientes + Valor nas Companhias", MARGIN + 3, y + 11);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(money(totalGeral, opts.currency), PAGE_W - MARGIN - 3, y + 9, { align: "right" });
  doc.setTextColor(0);
  y += 18;

  // ── Rodapé ────────────────────────────────────────────────────────
  const total = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(130);
    doc.text(clean(`${opts.agencyName} — Relatório Geral de Contas`), MARGIN, PAGE_H - 5);
    doc.text(`Página ${i} de ${total}`, PAGE_W - MARGIN, PAGE_H - 5, { align: "right" });
    doc.setTextColor(0);
  }

  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  doc.save(`Relatorio_Geral_${dd}-${mm}-${yyyy}.pdf`);
}
