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
  saldo: number; // negative = we owe
  divida: number; // positive amount owed
  bilhetes: number;
  ultimo: string | null;
};

async function fetchDividasClientes(): Promise<Row[]> {
  const { data: bilhetes, error } = await (supabase as any)
    .from("bilhetes")
    .select(
      "id, data_viagem, created_at, valor_cobrado, custo, taxa_agencia, classe, origem, destino, companhia, status, cliente:cliente_id(full_name)",
    )
    .in("status", ["emitido", "pendente", "pedido_criado", "pago"])
    .order("created_at", { ascending: false });
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
  const pageW = doc.internal.pageSize.getWidth();
  const now = new Date();

  // Logo (best-effort)
  if (opts.logoUrl) {
    try {
      const dataUrl = await toDataUrl(opts.logoUrl);
      if (dataUrl) doc.addImage(dataUrl, "PNG", 10, 8, 20, 20);
    } catch { /* ignore */ }
  }

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(opts.agencyName || "Agência", opts.logoUrl ? 34 : 10, 16);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Relatório de Dívidas", opts.logoUrl ? 34 : 10, 22);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Emitido: ${now.toLocaleString("pt-PT")}`, pageW - 10, 12, { align: "right" });
  doc.setTextColor(0);

  const naoPagos = clientes.filter((r) => r.situacao === "nao_pago");
  const parciais = clientes.filter((r) => r.situacao === "parcial");
  const totNaoPagos = naoPagos.reduce((s, r) => s + r.restante, 0);
  const totParciais = parciais.reduce((s, r) => s + r.restante, 0);
  const totClientes = totNaoPagos + totParciais;
  const totCiasDivida = cias.reduce((s, r) => s + r.divida, 0);

  // Resumo
  doc.setFontSize(9);
  doc.text(
    `Sem pagamento: ${naoPagos.length} · Parciais: ${parciais.length} · Dívida a companhias: ${cias.length}`,
    10,
    32,
  );

  let cursorY = 38;

  const drawTable = (title: string, rows: Row[], startY: number) => {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(title, 10, startY);
    doc.setFont("helvetica", "normal");
    const subtotal = rows.reduce((s, r) => s + r.restante, 0);
    autoTable(doc, {
      startY: startY + 3,
      head: [[
        "Data viagem",
        "Cliente",
        "Rota",
        "Classe",
        "Companhia",
        "Preço bilhete",
        "Taxa agência",
        "Total",
        "Pago",
        "Em dívida",
      ]],
      body: rows.map((r) => [
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
      ]),
      foot: [[
        { content: "Subtotal em dívida", colSpan: 9, styles: { halign: "right", fontStyle: "bold" } },
        { content: formatCurrency(subtotal, opts.currency), styles: { fontStyle: "bold" } },
      ]],
      styles: { fontSize: 8, cellPadding: 1.6 },
      headStyles: { fillColor: [30, 64, 175], textColor: 255 },
      footStyles: { fillColor: [240, 240, 240], textColor: 0 },
      columnStyles: {
        5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" },
        8: { halign: "right" }, 9: { halign: "right" },
      },
      didDrawPage: () => {
        // repeat title on new page
      },
    });
    // @ts-ignore
    return (doc as any).lastAutoTable.finalY as number;
  };

  if (naoPagos.length) {
    cursorY = drawTable("1. Clientes sem pagamento", naoPagos, cursorY) + 8;
  } else {
    doc.setFontSize(10);
    doc.text("1. Clientes sem pagamento: nenhum", 10, cursorY);
    cursorY += 8;
  }

  if (cursorY > 170) { doc.addPage(); cursorY = 15; }

  if (parciais.length) {
    cursorY = drawTable("2. Clientes com pagamento parcial", parciais, cursorY) + 8;
  } else {
    doc.setFontSize(10);
    doc.text("2. Clientes com pagamento parcial: nenhum", 10, cursorY);
    cursorY += 8;
  }

  // Secção 3 — Dívidas a companhias intermediárias
  if (cursorY > 160) { doc.addPage(); cursorY = 15; }
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("3. Dívidas a companhias intermediárias", 10, cursorY);
  doc.setFont("helvetica", "normal");

  if (cias.length) {
    autoTable(doc, {
      startY: cursorY + 3,
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
        { content: formatCurrency(totCiasDivida, opts.currency), styles: { fontStyle: "bold" } },
      ]],
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [30, 64, 175], textColor: 255 },
      footStyles: { fillColor: [240, 240, 240], textColor: 0 },
      columnStyles: { 2: { halign: "right" }, 4: { halign: "right" } },
    });
    // @ts-ignore
    cursorY = (doc as any).lastAutoTable.finalY + 8;
  } else {
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("Nenhuma companhia intermediária com dívida.", 10, cursorY + 8);
    doc.setTextColor(0);
    cursorY += 16;
  }

  // Total geral
  if (cursorY > 180) { doc.addPage(); cursorY = 20; }
  doc.setDrawColor(30, 64, 175);
  doc.setLineWidth(0.4);
  doc.line(10, cursorY, pageW - 10, cursorY);
  cursorY += 6;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Total geral em dívida (clientes + companhias)", 10, cursorY);
  doc.text(formatCurrency(totClientes + totCiasDivida, opts.currency), pageW - 10, cursorY, { align: "right" });
  cursorY += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Clientes: ${formatCurrency(totClientes, opts.currency)}`, 10, cursorY);
  doc.text(`Companhias: ${formatCurrency(totCiasDivida, opts.currency)}`, 80, cursorY);
  doc.setTextColor(0);

  // Rodapé com paginação
  const total = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`${opts.agencyName} — Relatório de Dívidas`, 10, doc.internal.pageSize.getHeight() - 6);
    doc.text(`Página ${i} de ${total}`, pageW - 10, doc.internal.pageSize.getHeight() - 6, { align: "right" });
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
