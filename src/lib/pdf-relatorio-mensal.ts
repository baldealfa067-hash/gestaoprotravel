import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";

const MARGIN = 12;
const PAGE_W = 210;

const clean = (s: string | number | null | undefined): string =>
  String(s ?? "")
    .replace(/\u202F/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\u2009/g, " ")
    .replace(/\u2013|\u2014/g, "-");

const money = (v: number, c: string) => clean(formatCurrency(v, c));
const dt = (s: string | null | undefined) =>
  s ? clean(new Date(s).toLocaleDateString("pt-PT")) : "-";

export const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export async function exportarRelatorioMensalPDF(opts: {
  currency: string;
  agencyName: string;
  year: number;
  month: number; // 1-12
}) {
  const { currency, agencyName, year, month } = opts;
  const inicio = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const fim = new Date(Date.UTC(year, month, 1)).toISOString();

  const [{ data: bs, error: e1 }, { data: movs, error: e2 }, { data: muds, error: e3 }, { data: cias, error: e4 }, { data: clientesNovos }] =
    await Promise.all([
      (supabase as any)
        .from("bilhetes")
        .select(
          "id, created_at, custo, taxa_agencia, taxa_mudancas_total, valor_cobrado, status, origem, destino, companhia, companhia_id, cliente:cliente_id(full_name)",
        )
        .gte("created_at", inicio)
        .lt("created_at", fim)
        .order("created_at", { ascending: true }),
      (supabase as any)
        .from("movimentacoes_capital")
        .select("id, created_at, tipo, valor, bilhete_id, companhia_id, observacao")
        .gte("created_at", inicio)
        .lt("created_at", fim)
        .order("created_at", { ascending: true }),
      (supabase as any)
        .from("mudancas_rota")
        .select("id, created_at, rota_antiga, rota_nova, taxa_mudanca, bilhete:bilhete_id(cliente:cliente_id(full_name))")
        .gte("created_at", inicio)
        .lt("created_at", fim)
        .order("created_at", { ascending: true }),
      (supabase as any).from("companhias_aereas").select("id, nome, saldo, modo, ativa").order("nome"),
      (supabase as any)
        .from("clientes")
        .select("id")
        .gte("created_at", inicio)
        .lt("created_at", fim),
    ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
  if (e4) throw e4;

  const bilhetes = (bs ?? []).filter((b: any) => b.status !== "cancelado");
  const cancelados = (bs ?? []).filter((b: any) => b.status === "cancelado");

  const pagosPorBilhete: Record<string, number> = {};
  for (const m of movs ?? []) {
    if (m.bilhete_id && (m.tipo === "pagamento_cliente" || m.tipo === "pagamento_taxa_mudanca")) {
      pagosPorBilhete[m.bilhete_id] = (pagosPorBilhete[m.bilhete_id] ?? 0) + Number(m.valor);
    }
  }

  const totalCusto = bilhetes.reduce(
    (s: number, b: any) => s + Number(b.custo ?? 0) + Number(b.taxa_mudancas_total ?? 0),
    0,
  );
  const totalTaxas = bilhetes.reduce((s: number, b: any) => s + Number(b.taxa_agencia ?? 0), 0);
  const totalGlobal = totalCusto + totalTaxas;

  const somaTipo = (t: string) =>
    (movs ?? []).filter((m: any) => m.tipo === t).reduce((s: number, m: any) => s + Number(m.valor), 0);

  const recebidoClientes = somaTipo("pagamento_cliente") + somaTipo("pagamento_taxa_mudanca");
  const carregamentos = somaTipo("carregamento_companhia");
  const aportes = somaTipo("aporte_capital");
  const despesas = somaTipo("despesa_operacional");
  const pagoCompanhias = somaTipo("pagamento_companhia");
  const totalMudancas = (muds ?? []).reduce((s: number, m: any) => s + Number(m.taxa_mudanca ?? 0), 0);

  const emDivida = bilhetes.reduce(
    (s: number, b: any) =>
      s +
      Math.max(
        0,
        Number(b.custo ?? 0) + Number(b.taxa_mudancas_total ?? 0) - (pagosPorBilhete[b.id] ?? 0),
      ),
    0,
  );

  const clientesUnicos = new Set(bilhetes.map((b: any) => b.cliente?.full_name ?? b.id)).size;
  const ciasDivida = (cias ?? []).filter((c: any) => Number(c.saldo) < 0);

  // ---------- PDF ----------
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const geradoEm = new Date().toLocaleString("pt-PT");

  doc.setFillColor(21, 68, 130);
  doc.rect(0, 0, PAGE_W, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(clean(agencyName.toUpperCase()), MARGIN, 11);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(clean(`Relatório Mensal - ${MESES[month - 1]} ${year}`), MARGIN, 18);
  doc.setFontSize(8);
  doc.text(clean(`Gerado em ${geradoEm}`), PAGE_W - MARGIN, 18, { align: "right" });
  doc.setTextColor(0, 0, 0);

  let y = 34;

  const section = (t: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(clean(t), MARGIN, y);
    y += 3;
  };

  section("1. RESUMO DO MÊS");
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [21, 68, 130], textColor: 255 },
    head: [["Indicador", "Valor"]],
    body: [
      ["Bilhetes emitidos/criados", String(bilhetes.length)],
      ["Bilhetes cancelados", String(cancelados.length)],
      ["Clientes servidos", String(clientesUnicos)],
      ["Novos clientes registados", String((clientesNovos ?? []).length)],
      ["Preço unitário (custo dos bilhetes + mudanças)", money(totalCusto, currency)],
      ["Total de taxas da agência (lucro)", money(totalTaxas, currency)],
      ["Total global faturado", money(totalGlobal, currency)],
      ["Recebido de clientes", money(recebidoClientes, currency)],
      ["Em dívida (clientes)", money(emDivida, currency)],
      ["Mudanças de rota", `${(muds ?? []).length} - ${money(totalMudancas, currency)}`],
      ["Carregamentos de companhias", money(carregamentos, currency)],
      ["Pagamentos a companhias", money(pagoCompanhias, currency)],
      ["Aportes de capital", money(aportes, currency)],
      ["Despesas operacionais", money(despesas, currency)],
    ],
    margin: { left: MARGIN, right: MARGIN },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  section("2. BILHETES DO MÊS");
  autoTable(doc, {
    startY: y,
    theme: "striped",
    styles: { fontSize: 7.5, cellPadding: 1.5 },
    headStyles: { fillColor: [21, 68, 130], textColor: 255 },
    head: [["Data", "Cliente", "Rota", "Companhia", "Custo", "Taxa", "Total", "Pago", "Dívida"]],
    body: bilhetes.map((b: any) => {
      const custo = Number(b.custo ?? 0) + Number(b.taxa_mudancas_total ?? 0);
      const pago = pagosPorBilhete[b.id] ?? 0;
      return [
        dt(b.created_at),
        clean(b.cliente?.full_name ?? "-"),
        clean(`${b.origem ?? ""} - ${b.destino ?? ""}`),
        clean(b.companhia ?? "-"),
        money(custo, currency),
        money(Number(b.taxa_agencia ?? 0), currency),
        money(custo + Number(b.taxa_agencia ?? 0), currency),
        money(pago, currency),
        money(Math.max(0, custo - pago), currency),
      ];
    }),
    margin: { left: MARGIN, right: MARGIN },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  if ((muds ?? []).length) {
    if (y > 240) { doc.addPage(); y = 20; }
    section("3. MUDANÇAS DE ROTA");
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [21, 68, 130], textColor: 255 },
      head: [["Data", "Cliente", "Rota antiga", "Rota nova", "Taxa"]],
      body: (muds ?? []).map((m: any) => [
        dt(m.created_at),
        clean(m.bilhete?.cliente?.full_name ?? "-"),
        clean(m.rota_antiga ?? "-"),
        clean(m.rota_nova ?? "-"),
        money(Number(m.taxa_mudanca ?? 0), currency),
      ]),
      margin: { left: MARGIN, right: MARGIN },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  if (y > 230) { doc.addPage(); y = 20; }
  section("4. COMPANHIAS / AGÊNCIAS");
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [21, 68, 130], textColor: 255 },
    head: [["Companhia", "Modo", "Saldo atual", "Dívida"]],
    body: (cias ?? [])
      .filter((c: any) => c.ativa)
      .map((c: any) => [
        clean(c.nome),
        c.modo === "credito" ? "Intermediária" : "Saldo",
        money(Math.max(0, Number(c.saldo ?? 0)), currency),
        money(Number(c.saldo ?? 0) < 0 ? -Number(c.saldo) : 0, currency),
      ]),
    margin: { left: MARGIN, right: MARGIN },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(
    clean(`Agências com dívida: ${ciasDivida.length}`),
    MARGIN,
    y,
  );

  doc.save(`Relatorio_${MESES[month - 1]}_${year}.pdf`);
}
