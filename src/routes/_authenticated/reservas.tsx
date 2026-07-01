import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Ticket,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  ALERT_BADGE,
  ALERT_LABEL,
  RESERVA_STATUS_LABELS,
  RESERVA_STATUS_OPTIONS,
  alertLevel,
  formatTimeLeft,
  type ReservaStatus,
} from "@/lib/reservas";

export const Route = createFileRoute("/_authenticated/reservas")({
  component: ReservasPage,
});

const schema = z.object({
  cliente_id: z.string().uuid("Cliente obrigatório"),
  pnr: z.string().trim().min(2, "PNR obrigatório").max(20),
  companhia: z.string().trim().min(2).max(80),
  origem: z.string().trim().min(2).max(80),
  destino: z.string().trim().min(2).max(80),
  data_viagem: z.string().min(1, "Data obrigatória"),
  data_limite: z.string().min(1, "Prazo limite obrigatório"),
  classe: z.enum(["economica", "executiva"]),
  status: z.enum(["ativa", "emitida", "expirada", "cancelada"]),
  observacoes: z.string().max(500).optional().or(z.literal("")),
});
type Form = z.infer<typeof schema>;

function nowLocalInput(offsetHours = 24) {
  const d = new Date(Date.now() + offsetHours * 36e5);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function empty(): Form {
  return {
    cliente_id: "",
    pnr: "",
    companhia: "",
    origem: "",
    destino: "",
    data_viagem: new Date().toISOString().slice(0, 10),
    data_limite: nowLocalInput(24),
    classe: "economica",
    status: "ativa",
    observacoes: "",
  };
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ReservasPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(empty());
  const [filter, setFilter] = useState<string>("ativas");
  const [search, setSearch] = useState("");
  const [, setTick] = useState(0);

  // Recalcula alertas a cada minuto
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const { data: reservas = [], isLoading } = useQuery({
    queryKey: ["reservas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservas" as any)
        .select("*, cliente:clientes(full_name, phone)")
        .order("data_limite", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, full_name")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const upsert = useMutation({
    mutationFn: async (values: Form) => {
      const { data: u } = await supabase.auth.getUser();
      const payload = {
        cliente_id: values.cliente_id,
        pnr: values.pnr.trim().toUpperCase(),
        companhia: values.companhia.trim(),
        origem: values.origem.trim(),
        destino: values.destino.trim(),
        data_viagem: values.data_viagem,
        data_limite: new Date(values.data_limite).toISOString(),
        classe: values.classe,
        status: values.status,
        observacoes: values.observacoes || null,
      };
      if (editingId) {
        const { error } = await supabase.from("reservas" as any).update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("reservas" as any)
          .insert({ ...payload, user_id: u.user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Reserva atualizada" : "Reserva criada");
      qc.invalidateQueries({ queryKey: ["reservas"] });
      qc.invalidateQueries({ queryKey: ["reservas-alertas"] });
      setOpen(false);
      setEditingId(null);
      setForm(empty());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = useMutation({
    mutationFn: async ({ id, changes }: { id: string; changes: Record<string, any> }) => {
      const { error } = await supabase.from("reservas" as any).update(changes).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reservas"] });
      qc.invalidateQueries({ queryKey: ["reservas-alertas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const now = Date.now();
    return reservas.filter((r: any) => {
      if (search) {
        const s = search.toLowerCase();
        const hit = [r.pnr, r.origem, r.destino, r.companhia, r.cliente?.full_name]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(s));
        if (!hit) return false;
      }
      const limite = new Date(r.data_limite).getTime();
      const diffH = (limite - now) / 36e5;
      switch (filter) {
        case "ativas":
          return r.status === "ativa";
        case "hoje":
          return r.status === "ativa" && diffH > 0 && diffH <= 24;
        case "24h":
          return r.status === "ativa" && diffH > 0 && diffH <= 24;
        case "48h":
          return r.status === "ativa" && diffH > 0 && diffH <= 48;
        case "emitidas":
          return r.status === "emitida";
        case "expiradas":
          return r.status === "expirada" || (r.status === "ativa" && diffH <= 0);
        default:
          return true;
      }
    });
  }, [reservas, filter, search]);

  const stats = useMemo(() => {
    const now = Date.now();
    let ativas = 0, hoje = 0, expiradas = 0, emitidas = 0;
    for (const r of reservas as any[]) {
      const diffH = (new Date(r.data_limite).getTime() - now) / 36e5;
      if (r.status === "ativa") {
        ativas++;
        if (diffH > 0 && diffH <= 24) hoje++;
        if (diffH <= 0) expiradas++;
      }
      if (r.status === "emitida") emitidas++;
      if (r.status === "expirada") expiradas++;
    }
    return { ativas, hoje, expiradas, emitidas };
  }, [reservas]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = schema.safeParse(form);
    if (!p.success) {
      toast.error(p.error.errors[0].message);
      return;
    }
    upsert.mutate(p.data);
  };

  const openEdit = (r: any) => {
    setEditingId(r.id);
    setForm({
      cliente_id: r.cliente_id,
      pnr: r.pnr,
      companhia: r.companhia,
      origem: r.origem,
      destino: r.destino,
      data_viagem: r.data_viagem,
      data_limite: toLocalInput(r.data_limite),
      classe: r.classe,
      status: r.status,
      observacoes: r.observacoes ?? "",
    });
    setOpen(true);
  };

  const statCards = [
    { label: "Reservas ativas", value: stats.ativas, icon: Ticket, color: "text-primary" },
    { label: "Expiram em 24h", value: stats.hoje, icon: Clock, color: "text-warning" },
    { label: "Expiradas", value: stats.expiradas, icon: AlertCircle, color: "text-destructive" },
    { label: "Emitidas", value: stats.emitidas, icon: CheckCircle2, color: "text-success" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reservas</h1>
          <p className="text-muted-foreground text-sm">
            Controlo de PNRs e prazos limite — nunca mais esqueça uma reserva
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) {
              setEditingId(null);
              setForm(empty());
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Nova reserva
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar reserva" : "Nova reserva"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2 col-span-2">
                  <Label>Cliente</Label>
                  <Select
                    value={form.cliente_id}
                    onValueChange={(v) => setForm({ ...form, cliente_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientes.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>PNR</Label>
                  <Input
                    className="font-mono uppercase"
                    value={form.pnr}
                    onChange={(e) => setForm({ ...form, pnr: e.target.value })}
                    placeholder="Ex: ABC123"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Companhia aérea</Label>
                  <Input
                    value={form.companhia}
                    onChange={(e) => setForm({ ...form, companhia: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Origem</Label>
                  <Input
                    value={form.origem}
                    onChange={(e) => setForm({ ...form, origem: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Destino</Label>
                  <Input
                    value={form.destino}
                    onChange={(e) => setForm({ ...form, destino: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data da viagem</Label>
                  <Input
                    type="date"
                    value={form.data_viagem}
                    onChange={(e) => setForm({ ...form, data_viagem: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-destructive font-semibold">
                    Prazo limite (data e hora)
                  </Label>
                  <Input
                    type="datetime-local"
                    value={form.data_limite}
                    onChange={(e) => setForm({ ...form, data_limite: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Classe</Label>
                  <Select
                    value={form.classe}
                    onValueChange={(v) => setForm({ ...form, classe: v as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="economica">Económica</SelectItem>
                      <SelectItem value="executiva">Executiva</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm({ ...form, status: v as ReservaStatus })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RESERVA_STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {RESERVA_STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  value={form.observacoes}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={upsert.isPending}>
                  Guardar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label} className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <div className="text-2xl font-bold tabular-nums">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row gap-3 items-center flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Pesquisar PNR, cliente, rota, companhia…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ativas">Ativas</SelectItem>
              <SelectItem value="24h">Expiram em 24h</SelectItem>
              <SelectItem value="48h">Expiram em 48h</SelectItem>
              <SelectItem value="expiradas">Expiradas</SelectItem>
              <SelectItem value="emitidas">Emitidas</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Alerta</TableHead>
                <TableHead>PNR</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Rota</TableHead>
                <TableHead>Companhia</TableHead>
                <TableHead>Viagem</TableHead>
                <TableHead>Prazo limite</TableHead>
                <TableHead>Falta</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8">
                    A carregar…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    Sem reservas
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((r: any) => {
                const lvl = alertLevel(r.data_limite, r.status);
                return (
                  <TableRow
                    key={r.id}
                    className={
                      lvl === "critical" || lvl === "red"
                        ? "bg-destructive/5"
                        : lvl === "orange"
                          ? "bg-warning/5"
                          : ""
                    }
                  >
                    <TableCell>
                      <Badge className={ALERT_BADGE[lvl]} variant="outline">
                        {ALERT_LABEL[lvl]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold">{r.pnr}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{r.cliente?.full_name ?? "—"}</span>
                        {r.cliente_contactado && (
                          <Phone className="h-3 w-3 text-success" aria-label="Contactado" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.origem} → {r.destino}
                    </TableCell>
                    <TableCell>{r.companhia}</TableCell>
                    <TableCell>{formatDate(r.data_viagem)}</TableCell>
                    <TableCell className="tabular-nums">{formatDateTime(r.data_limite)}</TableCell>
                    <TableCell className="tabular-nums text-sm">
                      {r.status === "ativa" ? formatTimeLeft(r.data_limite) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{RESERVA_STATUS_LABELS[r.status as ReservaStatus]}</Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              patch.mutate({ id: r.id, changes: { status: "emitida" } })
                            }
                          >
                            <CheckCircle2 className="h-4 w-4 mr-2 text-success" />
                            Marcar como emitida
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              patch.mutate({
                                id: r.id,
                                changes: { cliente_contactado: !r.cliente_contactado },
                              })
                            }
                          >
                            <Phone className="h-4 w-4 mr-2" />
                            {r.cliente_contactado
                              ? "Desmarcar contactado"
                              : "Marcar cliente contactado"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(r)}>
                            <Clock className="h-4 w-4 mr-2" /> Editar prazo / dados
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() =>
                              patch.mutate({ id: r.id, changes: { status: "cancelada" } })
                            }
                          >
                            <XCircle className="h-4 w-4 mr-2" /> Cancelar reserva
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
