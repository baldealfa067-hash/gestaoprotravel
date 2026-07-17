import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";

type Row = {
  data_viagem: string | null;
  cliente: string;
  origem: string;
  destino: string;
  classe: string;
  companhia: string;
  custo: number;
  taxa: number;
  total: number;
  pago: number;
  restante: number;
  situacao: "parcial" | "nao_pago" | "pago";
  taxa_mudancas: number;
  mudancas: { rota_antiga: string; rota_nova: string; taxa: number; data: string | null }[];
};

type DividaCompanhia = {

  nome: string;
  codigo: string | null;
  divida: number;
  bilhetes: number;
  ultimo: string | null;
};

// A4 landscape 297x210
const MARGIN = 10;
const PAGE_W = 297;
const PAGE_H = 210;

// Sanitize strings: helvetica (WinAnsi) doesn't render narrow/non-break spaces
// that Intl.NumberFormat inserts between digits/currency → shows as "&".
const clean = (s: string | number | null | undefined): string =>
  String(s ?? "")
    .replace(/\u202F/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\u2009/g, " ")
    .replace(/\u2013|\u2014/g, "-");

const money = (v: number, c: string) => clean(formatCurrency(v, c));

async function fetchDividasClientes(): Promise<Row[]> {
  const { data: bilhetes, error } = await (supabase as any)
    .from("bilhetes")
    .select(
      "id, data_viagem, valor_cobrado, custo, taxa_agencia, taxa_mudancas_total, classe, origem, destino, companhia, status, cliente:cliente_id(full_name)",
    )
    .in("status", ["emitido", "pendente", "pedido_criado", "pago"])
    .order("data_viagem", { ascending: true, nullsFirst: false });
  if (error) throw error;

  const ids = (bilhetes ?? []).map((b: any) => b.id);
  const pagos: Record<string, number> = {};
  const mudancasPorBilhete: Record<string, Row["mudancas"]> = {};
  if (ids.length) {
    const [{ data: movs }, { data: muds }] = await Promise.all([
      (supabase as any)
        .from("movimentacoes_capital")
        .select("bilhete_id, valor, tipo")
        .in("tipo", ["pagamento_cliente", "pagamento_taxa_mudanca"])
        .in("bilhete_id", ids),
      (supabase as any)
        .from("mudancas_rota")
        .select("bilhete_id, rota_antiga, rota_nova, taxa_mudanca, created_at")
        .in("bilhete_id", ids)
        .order("created_at", { ascending: true }),
    ]);
    for (const m of movs ?? []) {
      pagos[m.bilhete_id] = (pagos[m.bilhete_id] ?? 0) + Number(m.valor);
    }
    for (const m of muds ?? []) {
      if (!mudancasPorBilhete[m.bilhete_id]) mudancasPorBilhete[m.bilhete_id] = [];
      mudancasPorBilhete[m.bilhete_id].push({
        rota_antiga: m.rota_antiga,
        rota_nova: m.rota_nova,
        taxa: Number(m.taxa_mudanca ?? 0),
        data: m.created_at,
      });
    }
  }

  return (bilhetes ?? []).map((b: any) => {
    const total = Number(b.valor_cobrado ?? 0);
    const pago = pagos[b.id] ?? 0;
    const restante = Math.max(0, total - pago);
    let situacao: Row["situacao"] = "nao_pago";
    if (restante < 0.01) situacao = "pago";
    else if (pago > 0) situacao = "parcial";
    return {
      data_viagem: b.data_viagem,
      cliente: b.cliente?.full_name ?? "—",
      origem: b.origem ?? "",
      destino: b.destino ?? "",
      classe: b.classe ?? "",
      companhia: b.companhia ?? "",
      custo: Number(b.custo ?? 0),
      taxa: Number(b.taxa_agencia ?? 0),
      total,
      pago,
      restante,
      situacao,
      taxa_mudancas: Number(b.taxa_mudancas_total ?? 0),
      mudancas: mudancasPorBilhete[b.id] ?? [],

    };
  });
}

async function fetchDividasCompanhias(): Promise<DividaCompanhia[]> {
  const { data, error } = await (supabase as any)
    .from("companhias_aereas")
    .select("id, nome, codigo, saldo, modo, ultimo_consumo")
    .eq("modo", "credito")
    .order("nome");
  if (error) throw error;

  const rows = (data ?? []) as any[];
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const { data: movs } = await (supabase as any)
    .from("movimentacoes_capital")
    .select("companhia_id, tipo")
    .in("companhia_id", ids)
    .eq("tipo", "emissao_bilhete");

  const counts: Record<string, number> = {};
  for (const m of movs ?? []) {
    counts[m.companhia_id] = (counts[m.companhia_id] ?? 0) + 1;
  }

  return rows
    .map((r) => {
      const saldo = Number(r.saldo ?? 0);
      return {
        nome: r.nome,
        codigo: r.codigo,
        divida: saldo < 0 ? -saldo : 0,
        bilhetes: counts[r.id] ?? 0,
        ultimo: r.ultimo_consumo,
      };
    })
    .filter((r) => r.divida > 0);
}

export async function exportarDividasPDF(opts: {
  currency: string;
  agencyName: string;
  logoUrl?: string | null;
}) {
  const [clientes, cias] = await Promise.all([
    fetchDividasClientes(),
    fetchDividasCompanhias(),
  ]);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const now = new Date();
  const emissao = now.toLocaleString("pt-PT");

  const naoPagos = clientes.filter((r) => r.situacao === "nao_pago");
  const parciais = clientes.filter((r) => r.situacao === "parcial");
  const totNaoPagos = naoPagos.reduce((s, r) => s + r.restante, 0);
  const totParciais = parciais.reduce((s, r) => s + r.restante, 0);
  const totClientes = totNaoPagos + totParciais;
  const totCiasDivida = cias.reduce((s, r) => s + r.divida, 0);
  const totalGeral = totClientes + totCiasDivida;

  // ── Cabeçalho simples ──────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(clean(opts.agencyName || "Agência"), MARGIN, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Relatório de Dívidas", MARGIN, 18);

  doc.setFontSize(9);
  doc.text(`Emitido: ${clean(emissao)}`, PAGE_W - MARGIN, 12, { align: "right" });
  doc.text(`Moeda: ${clean(opts.currency)}`, PAGE_W - MARGIN, 18, { align: "right" });

  doc.setDrawColor(180);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, 22, PAGE_W - MARGIN, 22);

  // ── Resumo em texto ────────────────────────────────────────────────
  let y = 28;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Resumo", MARGIN, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const resumo = [
    `Sem pagamento: ${naoPagos.length} bilhete(s) — ${money(totNaoPagos, opts.currency)}`,
    `Pagamento parcial: ${parciais.length} bilhete(s) — ${money(totParciais, opts.currency)}`,
    `Dívida a companhias intermediárias: ${cias.length} — ${money(totCiasDivida, opts.currency)}`,
    `TOTAL GERAL EM DÍVIDA: ${money(totalGeral, opts.currency)}`,
  ];
  resumo.forEach((line, i) => {
    if (i === 3) doc.setFont("helvetica", "bold");
    doc.text(clean(line), MARGIN, y);
    y += 5;
  });
  doc.setFont("helvetica", "normal");
  y += 3;

  // ── Helper de secção ───────────────────────────────────────────────
  const drawSection = (title: string) => {
    if (y > PAGE_H - 40) { doc.addPage(); y = MARGIN + 4; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(clean(title), MARGIN, y);
    y += 3;
    doc.setDrawColor(80);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 3;
    doc.setFont("helvetica", "normal");
  };

  const clientHead = [[
    "Data viagem", "Cliente", "Rota", "Classe", "Companhia",
    "Preço", "Taxa", "Mud.", "Total", "Pago", "Em dívida",
  ]];
  const clientBody = (rows: Row[]) => rows.flatMap((r) => {
    const main = [
      clean(r.data_viagem ? formatDate(r.data_viagem) : "—"),
      clean(r.cliente),
      clean(`${r.origem} -> ${r.destino}`),
      r.classe === "executiva" ? "Executiva" : "Económica",
      clean(r.companhia),
      money(r.custo, opts.currency),
      money(r.taxa, opts.currency),
      r.taxa_mudancas > 0 ? money(r.taxa_mudancas, opts.currency) : "—",
      money(r.total, opts.currency),
      money(r.pago, opts.currency),
      money(r.restante, opts.currency),
    ];
    if (r.mudancas.length === 0) return [main];
    const detalhe = r.mudancas
      .map((m, i) => `${i + 1}) ${clean(m.rota_antiga)} => ${clean(m.rota_nova)} · taxa ${money(m.taxa, opts.currency)}${m.data ? ` · ${formatDate(m.data)}` : ""}`)
      .join("    ");
    return [
      main,
      [{
        content: `Mudanças de rota (${r.mudancas.length}):  ${detalhe}`,
        colSpan: 11,
        styles: { fontStyle: "italic", fontSize: 7, textColor: [70, 70, 70], fillColor: [250, 247, 235] },
      }] as any,
    ];
  });

  // widths sum = 277mm (page 297 - margins 2*10)
  const clientColStyles: any = {
    0: { cellWidth: 19 },
    1: { cellWidth: 38 },
    2: { cellWidth: 38 },
    3: { cellWidth: 16 },
    4: { cellWidth: 26 },
    5: { halign: "right", cellWidth: 22 },
    6: { halign: "right", cellWidth: 20 },
    7: { halign: "right", cellWidth: 22 },
    8: { halign: "right", cellWidth: 24 },
    9: { halign: "right", cellWidth: 22 },
    10: { halign: "right", cellWidth: 30, fontStyle: "bold" },
  };

  const drawClientTable = (rows: Row[], subtotal: number) => {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN + 6 },
      head: clientHead,
      body: clientBody(rows),
      foot: [[
        { content: "Subtotal em dívida", colSpan: 10, styles: { halign: "right", fontStyle: "bold" } },
        { content: money(subtotal, opts.currency), styles: { halign: "right", fontStyle: "bold" } },
      ]],
      styles: { fontSize: 8, cellPadding: 1.6, overflow: "linebreak", valign: "middle", lineColor: [200, 200, 200], lineWidth: 0.1 },
      headStyles: { fillColor: [235, 235, 235], textColor: 0, fontStyle: "bold", lineColor: [180, 180, 180] },
      footStyles: { fillColor: [245, 245, 245], textColor: 0 },
      columnStyles: clientColStyles,
      theme: "grid",
    });
    // @ts-ignore
    y = (doc as any).lastAutoTable.finalY + 8;
  };


  // ── 1. Sem pagamento ───────────────────────────────────────────────
  drawSection("1. Clientes sem pagamento");
  if (naoPagos.length) {
    drawClientTable(naoPagos, totNaoPagos);
  } else {
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("Nenhum bilhete sem pagamento.", MARGIN, y + 2);
    doc.setTextColor(0);
    y += 10;
  }

  // ── 2. Parcial ─────────────────────────────────────────────────────
  drawSection("2. Clientes com pagamento parcial");
  if (parciais.length) {
    drawClientTable(parciais, totParciais);
  } else {
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("Nenhum pagamento parcial.", MARGIN, y + 2);
    doc.setTextColor(0);
    y += 10;
  }

  // ── 3. Companhias intermediárias ───────────────────────────────────
  drawSection("3. Dívidas a companhias intermediárias");
  if (cias.length) {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN + 6 },
      head: [["Companhia", "Código", "Nº bilhetes", "Último uso", "Total devido"]],
      body: cias.map((c) => [
        clean(c.nome),
        clean(c.codigo ?? "—"),
        String(c.bilhetes),
        clean(c.ultimo ? formatDate(c.ultimo) : "—"),
        money(c.divida, opts.currency),
      ]),
      foot: [[
        { content: "Subtotal dívida a companhias", colSpan: 4, styles: { halign: "right", fontStyle: "bold" } },
        { content: money(totCiasDivida, opts.currency), styles: { halign: "right", fontStyle: "bold" } },
      ]],
      styles: { fontSize: 9, cellPadding: 2, valign: "middle", lineColor: [200, 200, 200], lineWidth: 0.1 },
      headStyles: { fillColor: [235, 235, 235], textColor: 0, fontStyle: "bold" },
      footStyles: { fillColor: [245, 245, 245], textColor: 0 },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 40 },
        2: { halign: "right", cellWidth: 40 },
        3: { cellWidth: 60 },
        4: { halign: "right", cellWidth: 57, fontStyle: "bold" },
      },
      theme: "grid",
    });
    // @ts-ignore
    y = (doc as any).lastAutoTable.finalY + 8;
  } else {
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("Nenhuma companhia intermediária com dívida.", MARGIN, y + 2);
    doc.setTextColor(0);
    y += 10;
  }

  // ── Total final ────────────────────────────────────────────────────
  if (y > PAGE_H - 20) { doc.addPage(); y = MARGIN + 4; }
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("TOTAL GERAL EM DÍVIDA", MARGIN, y);
  doc.text(money(totalGeral, opts.currency), PAGE_W - MARGIN, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100);
  y += 5;
  doc.text(
    clean(`Clientes: ${money(totClientes, opts.currency)}   ·   Companhias: ${money(totCiasDivida, opts.currency)}`),
    MARGIN, y,
  );
  doc.setTextColor(0);

  // ── Rodapé com paginação ──────────────────────────────────────────
  const total = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(130);
    doc.text(clean(`${opts.agencyName} — Relatório de Dívidas`), MARGIN, PAGE_H - 4);
    doc.text(`Página ${i} de ${total}`, PAGE_W - MARGIN, PAGE_H - 4, { align: "right" });
    doc.setTextColor(0);
  }

  doc.save(`dividas-${now.toISOString().slice(0, 10)}.pdf`);
}
