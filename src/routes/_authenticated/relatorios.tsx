import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { formatCurrency, formatDate, TICKET_STATUS_LABELS } from "@/lib/format";
import { useAgencySettings } from "@/hooks/use-agency-settings";
import { startOfMonth, format } from "date-fns";

export const Route = createFileRoute("/_authenticated/relatorios")({
  component: RelatoriosPage,
});

function RelatoriosPage() {
  const { data: settings } = useAgencySettings();
  const currency = settings?.currency ?? "AOA";
  const [from, setFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [vendedor, setVendedor] = useState("all");
  const [destino, setDestino] = useState("");

  const { data } = useQuery({
    queryKey: ["relatorios"],
    queryFn: async () => {
      const { data: bilhetes } = await supabase
        .from("bilhetes")
        .select("*, cliente:clientes(full_name), vendedor:profiles!bilhetes_vendedor_id_fkey(full_name)");
      const { data: profiles } = await supabase.from("profiles").select("id, full_name");
      return { bilhetes: bilhetes ?? [], profiles: profiles ?? [] };
    },
  });

  const bilhetes = data?.bilhetes ?? [];

  const filtered = useMemo(() => {
    return bilhetes.filter((b: any) => {
      const d = new Date(b.created_at);
      if (from && d < new Date(from)) return false;
      if (to && d > new Date(new Date(to).getTime() + 86400000)) return false;
      if (vendedor !== "all" && b.vendedor_id !== vendedor) return false;
      if (destino && !b.destino.toLowerCase().includes(destino.toLowerCase())) return false;
      return true;
    });
  }, [bilhetes, from, to, vendedor, destino]);

  const totals = useMemo(() => ({
    count: filtered.length,
    receita: filtered.reduce((s: number, b: any) => s + Number(b.valor_cobrado), 0),
    custo: filtered.reduce((s: number, b: any) => s + Number(b.custo), 0),
    lucro: filtered.reduce((s: number, b: any) => s + Number(b.lucro), 0),
  }), [filtered]);

  const exportCSV = () => {
    const headers = ["Data", "Cliente", "Origem", "Destino", "Companhia", "PNR", "Vendedor", "Custo", "Cobrado", "Lucro", "Status"];
    const rows = filtered.map((b: any) => [
      formatDate(b.created_at),
      b.cliente?.full_name ?? "",
      b.origem,
      b.destino,
      b.companhia,
      b.pnr ?? "",
      b.vendedor?.full_name ?? "",
      b.custo,
      b.valor_cobrado,
      b.lucro,
      TICKET_STATUS_LABELS[b.status] ?? b.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    const rows = filtered.map((b: any) => `
      <tr>
        <td>${formatDate(b.created_at)}</td>
        <td>${b.cliente?.full_name ?? ""}</td>
        <td>${b.origem} → ${b.destino}</td>
        <td>${b.companhia}</td>
        <td>${b.vendedor?.full_name ?? ""}</td>
        <td style="text-align:right">${formatCurrency(b.valor_cobrado, currency)}</td>
        <td style="text-align:right">${formatCurrency(b.lucro, currency)}</td>
        <td>${TICKET_STATUS_LABELS[b.status]}</td>
      </tr>`).join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Relatório</title>
      <style>body{font-family:system-ui;padding:24px;color:#0b1e3f}h1{color:#1e40af}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#1e40af;color:#fff}.totals{margin-top:16px;display:flex;gap:24px}.totals div{flex:1;background:#f1f5f9;padding:12px;border-radius:8px}</style>
      </head><body>
      <h1>Gestão Pro Travel — Relatório</h1>
      <p>Período: ${from} a ${to}</p>
      <div class="totals">
        <div><b>Bilhetes:</b> ${totals.count}</div>
        <div><b>Receita:</b> ${formatCurrency(totals.receita, currency)}</div>
        <div><b>Custo:</b> ${formatCurrency(totals.custo, currency)}</div>
        <div><b>Lucro:</b> ${formatCurrency(totals.lucro, currency)}</div>
      </div>
      <table><thead><tr><th>Data</th><th>Cliente</th><th>Rota</th><th>Companhia</th><th>Vendedor</th><th>Cobrado</th><th>Lucro</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
      <script>window.onload=()=>window.print()</script>
      </body></html>`);
    win.document.close();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
        <p className="text-muted-foreground text-sm">Análise financeira e exportação</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div className="space-y-2"><Label>De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-2"><Label>Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Vendedor</Label>
            <Select value={vendedor} onValueChange={setVendedor}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(data?.profiles ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Destino</Label><Input value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Ex: Lisboa" /></div>
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={exportCSV}><FileSpreadsheet className="h-4 w-4 mr-2" /> Excel</Button>
            <Button variant="outline" onClick={exportPDF}><FileText className="h-4 w-4 mr-2" /> PDF</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Bilhetes</div><div className="text-2xl font-bold mt-1">{totals.count}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Receita total</div><div className="text-2xl font-bold mt-1 tabular-nums">{formatCurrency(totals.receita, currency)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Custo total</div><div className="text-2xl font-bold mt-1 tabular-nums">{formatCurrency(totals.custo, currency)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Lucro total</div><div className="text-2xl font-bold mt-1 tabular-nums text-success">{formatCurrency(totals.lucro, currency)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Detalhe ({filtered.length})</CardTitle>
          <Button size="sm" variant="ghost" onClick={exportCSV}><Download className="h-4 w-4 mr-2" /> Exportar</Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Rota</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead className="text-right">Cobrado</TableHead>
                <TableHead className="text-right">Lucro</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((b: any) => (
                <TableRow key={b.id}>
                  <TableCell>{formatDate(b.created_at)}</TableCell>
                  <TableCell>{b.cliente?.full_name}</TableCell>
                  <TableCell>{b.origem} → {b.destino}</TableCell>
                  <TableCell>{b.vendedor?.full_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(b.valor_cobrado, currency)}</TableCell>
                  <TableCell className="text-right tabular-nums text-success">{formatCurrency(b.lucro, currency)}</TableCell>
                  <TableCell>{TICKET_STATUS_LABELS[b.status]}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}