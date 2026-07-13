import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";

type Row = {
  data_viagem: string | null;
  created_at: string;
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
};

type DividaCompanhia = {
  nome: string;
  codigo: string | null;
  saldo: number;
  divida: number;
  bilhetes: number;
  ultimo: string | null;
};

// Layout constants (mm, A4 landscape 297x210)
const MARGIN = 12;
const PAGE_W = 297;
const PAGE_H = 210;
const HEADER_H = 26;
const FOOTER_H = 10;
const CONTENT_TOP = HEADER_H + 4;
const CONTENT_BOTTOM = PAGE_H - FOOTER_H;
const BRAND: [number, number, number] = [30, 64, 175];

async function fetchDividasClientes(): Promise<Row[]> {
  const { data: bilhetes, error } = await (supabase as any)
    .from("bilhetes")
    .select(
      "id, data_viagem, created_at, valor_cobrado, custo, taxa_agencia, classe, origem, destino, companhia, status, cliente:cliente_id(full_name)",
    )
    .in("status", ["emitido", "pendente", "pedido_criado", "pago"])
    .order("data_viagem", { ascending: true, nullsFirst: false });
  if (error) throw error;

  const ids = (bilhetes ?? []).map((b: any) => b.id);
  const pagos: Record<string, number> = {};
  if (ids.length) {
    const { data: movs } = await (supabase as any)
      .from("movimentacoes_capital")
      .select("bilhete_id, valor")
      .eq("tipo", "pagamento_cliente")
      .in("bilhete_id", ids);
    for (const m of movs ?? []) {
      pagos[m.bilhete_id] = (pagos[m.bilhete_id] ?? 0) + Number(m.valor);
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
      created_at: b.created_at,
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

  return rows.map((r) => {
    const saldo = Number(r.saldo ?? 0);
    return {
      nome: r.nome,
      codigo: r.codigo,
      saldo,
      divida: saldo < 0 ? -saldo : 0,
      bilhetes: counts[r.id] ?? 0,
      ultimo: r.ultimo_consumo,
    };
  });
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

  let logoData: string | null = null;
  if (opts.logoUrl) {
    logoData = await toDataUrl(opts.logoUrl).catch(() => null);
  }

  const drawHeader = () => {
    // Faixa superior
    doc.setFillColor(...BRAND);
    doc.rect(0, 0, PAGE_W, HEADER_H, "F");

    if (logoData) {
      try { doc.addImage(logoData, "PNG", MARGIN, 4, 18, 18); } catch { /* ignore */ }
    }
    const textX = logoData ? MARGIN + 22 : MARGIN;
    doc.setTextColor(255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(opts.agencyName || "Agência", textX, 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Relatório de Dívidas", textX, 18);

    doc.setFontSize(8);
    doc.text(`Emitido: ${emissao}`, PAGE_W - MARGIN, 10, { align: "right" });
    doc.text(`Moeda: ${opts.currency}`, PAGE_W - MARGIN, 15, { align: "right" });

    // reset
    doc.setTextColor(0);
  };

  const drawFooter = (pageNum: number, pageCount: number) => {
    doc.setDrawColor(220);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, PAGE_H - FOOTER_H + 2, PAGE_W - MARGIN, PAGE_H - FOOTER_H + 2);
    doc.setFontSize(8);
    doc.setTextColor(130);
    doc.text(
      `${opts.agencyName} — Relatório de Dívidas`,
      MARGIN,
      PAGE_H - 3,
    );
    doc.text(
      `Página ${pageNum} de ${pageCount}`,
      PAGE_W - MARGIN,
      PAGE_H - 3,
      { align: "right" },
    );
    doc.setTextColor(0);
  };

  // Helper — ensure a block of `neededMm` fits; otherwise new page.
  const ensureSpace = (cursorY: number, neededMm: number): number => {
    if (cursorY + neededMm > CONTENT_BOTTOM) {
      doc.addPage();
      return CONTENT_TOP;
    }
    return cursorY;
  };

  // ── Header + resumo geral (página 1) ─────────────────────────────────
  drawHeader();
  let y = CONTENT_TOP;

  const naoPagos = clientes.filter((r) => r.situacao === "nao_pago");
  const parciais = clientes.filter((r) => r.situacao === "parcial");
  const pagos = clientes.filter((r) => r.situacao === "pago");
  const totNaoPagos = naoPagos.reduce((s, r) => s + r.restante, 0);
  const totParciais = parciais.reduce((s, r) => s + r.restante, 0);
  const totClientes = totNaoPagos + totParciais;
  const totCiasDivida = cias.reduce((s, r) => s + r.divida, 0);
  const totalGeral = totClientes + totCiasDivida;

  // Cartões-resumo
  const cardW = (PAGE_W - MARGIN * 2 - 6 * 3) / 4;
  const cardH = 20;
  const cards: Array<[string, string, [number, number, number]]> = [
    ["Sem pagamento", `${naoPagos.length}   ·   ${formatCurrency(totNaoPagos, opts.currency)}`, [220, 38, 38]],
    ["Pagamento parcial", `${parciais.length}   ·   ${formatCurrency(totParciais, opts.currency)}`, [37, 99, 235]],
    ["Dívida a companhias", `${cias.length}   ·   ${formatCurrency(totCiasDivida, opts.currency)}`, [217, 119, 6]],
    ["Total geral em dívida", formatCurrency(totalGeral, opts.currency), [17, 94, 89]],
  ];
  cards.forEach(([title, value, color], i) => {
    const x = MARGIN + i * (cardW + 6);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, "FD");
    doc.setFillColor(...color);
    doc.rect(x, y, 2, cardH, "F");
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(title, x + 5, y + 6);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...color);
    doc.text(value, x + 5, y + 14);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);
  });
  y += cardH + 6;

  // ── Secção helper ────────────────────────────────────────────────────
  const clientHead = [[
    "Data viagem", "Cliente", "Rota", "Classe", "Companhia",
    "Preço", "Taxa", "Total", "Pago", "Em dívida",
  ]];
  const clientBody = (rows: Row[]) => rows.map((r) => [
    r.data_viagem ? formatDate(r.data_viagem) : "—",
    r.cliente,
    `${r.origem} → ${r.destino}`,
    r.classe === "executiva" ? "Executiva" : "Económica",
    r.companhia,
    formatCurrency(r.custo, opts.currency),
    formatCurrency(r.taxa, opts.currency),
    formatCurrency(r.total, opts.currency),
    formatCurrency(r.pago, opts.currency),
    formatCurrency(r.restante, opts.currency),
  ]);

  const drawSectionTitle = (title: string, subtitle: string, cursorY: number) => {
    let cy = ensureSpace(cursorY, 12);
    doc.setFillColor(...BRAND);
    doc.rect(MARGIN, cy, 3, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text(title, MARGIN + 6, cy + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(subtitle, PAGE_W - MARGIN, cy + 5, { align: "right" });
    doc.setTextColor(0);
    return cy + 9;
  };

  const drawClientTable = (rows: Row[], subtotal: number, cursorY: number) => {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: MARGIN, right: MARGIN, top: CONTENT_TOP, bottom: FOOTER_H + 4 },
      head: clientHead,
      body: clientBody(rows),
      foot: [[
        { content: "Subtotal em dívida", colSpan: 9, styles: { halign: "right", fontStyle: "bold" } },
        { content: formatCurrency(subtotal, opts.currency), styles: { fontStyle: "bold", halign: "right" } },
      ]],
      styles: { fontSize: 8, cellPadding: 1.8, overflow: "linebreak", valign: "middle" },
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [241, 245, 249], textColor: 15 },
      alternateRowStyles: { fillColor: [250, 250, 252] },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 45 },
        2: { cellWidth: 40 },
        3: { cellWidth: 20 },
        4: { cellWidth: 32 },
        5: { halign: "right", cellWidth: 24 },
        6: { halign: "right", cellWidth: 22 },
        7: { halign: "right", cellWidth: 26 },
        8: { halign: "right", cellWidth: 24 },
        9: { halign: "right", cellWidth: 26, textColor: [220, 38, 38], fontStyle: "bold" },
      },
      didDrawPage: () => { drawHeader(); },
    });
    // @ts-ignore
    return (doc as any).lastAutoTable.finalY + 6;
  };

  // Secção 1
  y = drawSectionTitle(
    "1. Clientes sem pagamento",
    `${naoPagos.length} bilhete(s) · ${formatCurrency(totNaoPagos, opts.currency)}`,
    y,
  );
  if (naoPagos.length) {
    y = drawClientTable(naoPagos, totNaoPagos, y);
  } else {
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text("Nenhum bilhete sem pagamento.", MARGIN, y + 4);
    doc.setTextColor(0);
    y += 10;
  }

  // Secção 2
  y = drawSectionTitle(
    "2. Clientes com pagamento parcial",
    `${parciais.length} bilhete(s) · ${formatCurrency(totParciais, opts.currency)}`,
    y,
  );
  if (parciais.length) {
    y = drawClientTable(parciais, totParciais, y);
  } else {
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text("Nenhum pagamento parcial.", MARGIN, y + 4);
    doc.setTextColor(0);
    y += 10;
  }

  // Secção 3 — Companhias intermediárias
  y = drawSectionTitle(
    "3. Dívidas a companhias intermediárias",
    `${cias.length} companhia(s) · ${formatCurrency(totCiasDivida, opts.currency)}`,
    y,
  );
  if (cias.length) {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, top: CONTENT_TOP, bottom: FOOTER_H + 4 },
      head: [["Companhia", "Código", "Nº bilhetes", "Último uso", "Total devido"]],
      body: cias.map((c) => [
        c.nome,
        c.codigo ?? "—",
        String(c.bilhetes),
        c.ultimo ? formatDate(c.ultimo) : "—",
        formatCurrency(c.divida, opts.currency),
      ]),
      foot: [[
        { content: "Subtotal dívida a companhias", colSpan: 4, styles: { halign: "right", fontStyle: "bold" } },
        { content: formatCurrency(totCiasDivida, opts.currency), styles: { fontStyle: "bold", halign: "right" } },
      ]],
      styles: { fontSize: 9, cellPadding: 2.2, valign: "middle" },
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [241, 245, 249], textColor: 15 },
      alternateRowStyles: { fillColor: [250, 250, 252] },
      columnStyles: {
        2: { halign: "right" },
        4: { halign: "right", textColor: [217, 119, 6], fontStyle: "bold" },
      },
      didDrawPage: () => { drawHeader(); },
    });
    // @ts-ignore
    y = (doc as any).lastAutoTable.finalY + 6;
  } else {
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text("Nenhuma companhia intermediária com dívida.", MARGIN, y + 4);
    doc.setTextColor(0);
    y += 10;
  }

  // Bloco final — total geral
  y = ensureSpace(y, 22);
  doc.setFillColor(...BRAND);
  doc.roundedRect(MARGIN, y, PAGE_W - MARGIN * 2, 16, 2, 2, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("TOTAL GERAL EM DÍVIDA", MARGIN + 6, y + 7);
  doc.setFontSize(14);
  doc.text(formatCurrency(totalGeral, opts.currency), PAGE_W - MARGIN - 6, y + 8, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    `Clientes: ${formatCurrency(totClientes, opts.currency)}   ·   Companhias: ${formatCurrency(totCiasDivida, opts.currency)}   ·   Pagos: ${pagos.length}`,
    MARGIN + 6,
    y + 13,
  );
  doc.setTextColor(0);

  // Rodapé com paginação em todas as páginas
  const total = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    drawFooter(i, total);
  }

  const fileName = `dividas-${now.toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
