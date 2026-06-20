import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Search, History } from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatCurrency } from "@/lib/format";
import { useAgencySettings } from "@/hooks/use-agency-settings";

export const Route = createFileRoute("/_authenticated/clientes")({
  component: ClientesPage,
});

const clienteSchema = z.object({
  full_name: z.string().trim().min(2, "Nome obrigatório").max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email("Email inválido").max(160).optional().or(z.literal("")),
  passport_number: z.string().trim().max(40).optional().or(z.literal("")),
  nationality: z.string().trim().max(80).optional().or(z.literal("")),
});

type ClienteForm = z.infer<typeof clienteSchema>;
type Cliente = ClienteForm & { id: string; created_at: string };

function emptyForm(): ClienteForm {
  return { full_name: "", phone: "", email: "", passport_number: "", nationality: "" };
}

function ClientesPage() {
  const qc = useQueryClient();
  const { data: settings } = useAgencySettings();
  const currency = settings?.currency ?? "AOA";
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [form, setForm] = useState<ClienteForm>(emptyForm());
  const [history, setHistory] = useState<Cliente | null>(null);

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Cliente[];
    },
  });

  const historyQuery = useQuery({
    queryKey: ["cliente-history", history?.id],
    enabled: !!history,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bilhetes")
        .select("id, origem, destino, data_viagem, status, valor_cobrado, lucro")
        .eq("cliente_id", history!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const upsert = useMutation({
    mutationFn: async (values: ClienteForm) => {
      const payload = {
        full_name: values.full_name.trim(),
        phone: values.phone || null,
        email: values.email || null,
        passport_number: values.passport_number || null,
        nationality: values.nationality || null,
      };
      if (editing) {
        const { error } = await supabase.from("clientes").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase.from("clientes").insert({ ...payload, created_by: u.user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Cliente atualizado" : "Cliente criado");
      qc.invalidateQueries({ queryKey: ["clientes"] });
      setOpen(false);
      setEditing(null);
      setForm(emptyForm());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = clienteSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    upsert.mutate(parsed.data);
  };

  const filtered = clientes.filter((c) =>
    [c.full_name, c.email, c.phone, c.passport_number]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground text-sm">{clientes.length} clientes registados</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setForm(emptyForm()); } }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Novo cliente
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle>
              <DialogDescription>Dados do passageiro</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-2">
                <Label>Nome completo</Label>
                <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Nº passaporte</Label>
                  <Input value={form.passport_number} onChange={(e) => setForm({ ...form, passport_number: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Nacionalidade</Label>
                  <Input value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={upsert.isPending}>Guardar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Pesquisar por nome, email, telefone ou passaporte…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Passaporte</TableHead>
                <TableHead>Nacionalidade</TableHead>
                <TableHead>Criado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">A carregar…</TableCell></TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sem clientes</TableCell></TableRow>
              )}
              {filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.full_name}</TableCell>
                  <TableCell>{c.phone ?? "—"}</TableCell>
                  <TableCell>{c.email ?? "—"}</TableCell>
                  <TableCell>{c.passport_number ?? "—"}</TableCell>
                  <TableCell>{c.nationality ?? "—"}</TableCell>
                  <TableCell>{formatDate(c.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setHistory(c)} title="Histórico">
                      <History className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(c); setForm({ full_name: c.full_name, phone: c.phone ?? "", email: c.email ?? "", passport_number: c.passport_number ?? "", nationality: c.nationality ?? "" }); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!history} onOpenChange={(o) => !o && setHistory(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Histórico — {history?.full_name}</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rota</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(historyQuery.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sem compras</TableCell></TableRow>
              )}
              {(historyQuery.data ?? []).map((b) => (
                <TableRow key={b.id}>
                  <TableCell>{b.origem} → {b.destino}</TableCell>
                  <TableCell>{formatDate(b.data_viagem)}</TableCell>
                  <TableCell className="capitalize">{b.status.replace("_", " ")}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(b.valor_cobrado, currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}