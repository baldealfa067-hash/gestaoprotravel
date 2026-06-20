import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatDate, TICKET_STATUS_LABELS, TICKET_STATUS_OPTIONS, type TicketStatus } from "@/lib/format";
import { useAgencySettings } from "@/hooks/use-agency-settings";

export const Route = createFileRoute("/_authenticated/bilhetes")({
  component: BilhetesPage,
});

const schema = z.object({
  cliente_id: z.string().uuid("Cliente obrigatório"),
  origem: z.string().trim().min(2).max(80),
  destino: z.string().trim().min(2).max(80),
  companhia: z.string().trim().min(2).max(80),
  data_viagem: z.string().min(1, "Data obrigatória"),
  pnr: z.string().trim().max(20).optional().or(z.literal("")),
  custo: z.coerce.number().min(0),
  valor_cobrado: z.coerce.number().min(0),
  status: z.enum(["pedido_criado", "pendente", "pago", "emitido", "cancelado"]),
  observacoes: z.string().max(500).optional().or(z.literal("")),
});
type Form = z.infer<typeof schema>;

const STATUS_BADGE: Record<TicketStatus, string> = {
  pedido_criado: "bg-muted text-muted-foreground",
  pendente: "bg-warning/15 text-warning-foreground border border-warning/30",
  pago: "bg-primary/15 text-primary border border-primary/30",
  emitido: "bg-success/15 text-success border border-success/30",
  cancelado: "bg-destructive/15 text-destructive border border-destructive/30",
};

function empty(): Form {
  return {
    cliente_id: "",
    origem: "",
    destino: "",
    companhia: "",
    data_viagem: new Date().toISOString().slice(0, 10),
    pnr: "",
    custo: 0,
    valor_cobrado: 0,
    status: "pedido_criado",
    observacoes: "",
  };
}

function BilhetesPage() {
  const qc = useQueryClient();
  const { data: settings } = useAgencySettings();
  const currency = settings?.currency ?? "AOA";
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(empty());
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: bilhetes = [], isLoading } = useQuery({
    queryKey: ["bilhetes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bilhetes")
        .select("*, cliente:clientes(full_name), vendedor:profiles!bilhetes_vendedor_id_fkey(full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-options"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("id, full_name").order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const upsert = useMutation({
    mutationFn: async (values: Form) => {
      const { data: u } = await supabase.auth.getUser();
      const payload = {
        cliente_id: values.cliente_id,
        origem: values.origem.trim(),
        destino: values.destino.trim(),
        companhia: values.companhia.trim(),
        data_viagem: values.data_viagem,
        pnr: values.pnr || null,
        custo: values.custo,
        valor_cobrado: values.valor_cobrado,
        status: values.status,
        observacoes: values.observacoes || null,
      };
      if (editingId) {
        const { error } = await supabase.from("bilhetes").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("bilhetes").insert({ ...payload, vendedor_id: u.user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Bilhete atualizado" : "Bilhete criado");
      qc.invalidateQueries({ queryKey: ["bilhetes"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setOpen(false);
      setEditingId(null);
      setForm(empty());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lucroPreview = useMemo(
    () => Number(form.valor_cobrado || 0) - Number(form.custo || 0),
    [form.valor_cobrado, form.custo],
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = schema.safeParse(form);
    if (!p.success) { toast.error(p.error.errors[0].message); return; }
    upsert.mutate(p.data);
  };

  const filtered = bilhetes.filter((b: any) => {
    if (filterStatus !== "all" && b.status !== filterStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      return [b.origem, b.destino, b.companhia, b.pnr, b.cliente?.full_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s));
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bilhetes</h1>
          <p className="text-muted-foreground text-sm">Vendas e estado das reservas</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditingId(null); setForm(empty()); } }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Novo bilhete</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar bilhete" : "Nova venda de bilhete"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Select value={form.cliente_id} onValueChange={(v) => setForm({ ...form, cliente_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
                  <SelectContent>
                    {clientes.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Origem</Label><Input value={form.origem} onChange={(e) => setForm({ ...form, origem: e.target.value })} /></div>
                <div className="space-y-2"><Label>Destino</Label><Input value={form.destino} onChange={(e) => setForm({ ...form, destino: e.target.value })} /></div>
                <div className="space-y-2"><Label>Companhia aérea</Label><Input value={form.companhia} onChange={(e) => setForm({ ...form, companhia: e.target.value })} /></div>
                <div className="space-y-2"><Label>Data da viagem</Label><Input type="date" value={form.data_viagem} onChange={(e) => setForm({ ...form, data_viagem: e.target.value })} /></div>
                <div className="space-y-2"><Label>PNR (código reserva)</Label><Input value={form.pnr} onChange={(e) => setForm({ ...form, pnr: e.target.value })} /></div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as TicketStatus })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TICKET_STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>{TICKET_STATUS_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Custo do bilhete</Label><Input type="number" step="0.01" value={form.custo} onChange={(e) => setForm({ ...form, custo: Number(e.target.value) })} /></div>
                <div className="space-y-2"><Label>Valor cobrado</Label><Input type="number" step="0.01" value={form.valor_cobrado} onChange={(e) => setForm({ ...form, valor_cobrado: Number(e.target.value) })} /></div>
              </div>
              <div className="rounded-lg bg-muted p-3 flex justify-between text-sm">
                <span className="text-muted-foreground">Lucro calculado</span>
                <span className={`font-bold tabular-nums ${lucroPreview >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(lucroPreview, currency)}</span>
              </div>
              <div className="space-y-2"><Label>Observações</Label><Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
              <DialogFooter>
                <Button type="submit" disabled={upsert.isPending}>Guardar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="flex flex-row gap-3 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Pesquisar cliente, rota, companhia ou PNR…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os estados</SelectItem>
              {TICKET_STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{TICKET_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Rota</TableHead>
                <TableHead>Companhia</TableHead>
                <TableHead>Viagem</TableHead>
                <TableHead>PNR</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">Cobrado</TableHead>
                <TableHead className="text-right">Lucro</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={11} className="text-center py-8">A carregar…</TableCell></TableRow>}
              {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">Sem bilhetes</TableCell></TableRow>}
              {filtered.map((b: any) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.cliente?.full_name ?? "—"}</TableCell>
                  <TableCell>{b.origem} → {b.destino}</TableCell>
                  <TableCell>{b.companhia}</TableCell>
                  <TableCell>{formatDate(b.data_viagem)}</TableCell>
                  <TableCell className="font-mono text-xs">{b.pnr ?? "—"}</TableCell>
                  <TableCell>{b.vendedor?.full_name ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(b.custo, currency)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(b.valor_cobrado, currency)}</TableCell>
                  <TableCell className={`text-right tabular-nums font-semibold ${Number(b.lucro) >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(b.lucro, currency)}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_BADGE[b.status as TicketStatus]} variant="outline">
                      {TICKET_STATUS_LABELS[b.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => {
                      setEditingId(b.id);
                      setForm({
                        cliente_id: b.cliente_id,
                        origem: b.origem,
                        destino: b.destino,
                        companhia: b.companhia,
                        data_viagem: b.data_viagem,
                        pnr: b.pnr ?? "",
                        custo: Number(b.custo),
                        valor_cobrado: Number(b.valor_cobrado),
                        status: b.status,
                        observacoes: b.observacoes ?? "",
                      });
                      setOpen(true);
                    }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}