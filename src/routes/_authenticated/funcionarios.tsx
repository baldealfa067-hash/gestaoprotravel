import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { useAgencySettings } from "@/hooks/use-agency-settings";
import { createEmployee, deleteEmployee } from "@/lib/admin.functions";
import { useUserRole } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/funcionarios")({
  component: () => (
    <RequireAdmin>
      <FuncionariosPage />
    </RequireAdmin>
  ),
});

const schema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
  full_name: z.string().min(2, "Nome obrigatório"),
  phone: z.string().optional(),
  cargo: z.string().optional(),
  role: z.enum(["admin", "vendedor"]),
});

function FuncionariosPage() {
  const qc = useQueryClient();
  const { isAdmin } = useUserRole();
  const { data: settings } = useAgencySettings();
  const currency = settings?.currency ?? "AOA";
  const createFn = useServerFn(createEmployee);
  const deleteFn = useServerFn(deleteEmployee);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", phone: "", cargo: "", role: "vendedor" as "admin" | "vendedor" });

  const { data, isLoading } = useQuery({
    queryKey: ["funcionarios"],
    queryFn: async () => {
      const { data: profiles } = await supabase.from("profiles").select("*").order("created_at");
      const { data: roles } = await supabase.from("user_roles").select("*");
      const { data: bilhetes } = await supabase.from("bilhetes").select("vendedor_id, valor_cobrado, lucro");
      const stats = new Map<string, { tickets: number; receita: number; lucro: number }>();
      bilhetes?.forEach((b) => {
        const e = stats.get(b.vendedor_id) ?? { tickets: 0, receita: 0, lucro: 0 };
        e.tickets += 1;
        e.receita += Number(b.valor_cobrado);
        e.lucro += Number(b.lucro);
        stats.set(b.vendedor_id, e);
      });
      return (profiles ?? []).map((p) => ({
        ...p,
        role: (roles?.find((r) => r.user_id === p.id)?.role ?? "vendedor") as "admin" | "vendedor",
        stats: stats.get(p.id) ?? { tickets: 0, receita: 0, lucro: 0 },
      }));
    },
  });

  const create = useMutation({
    mutationFn: async (values: z.infer<typeof schema>) => createFn({ data: values }),
    onSuccess: () => {
      toast.success("Funcionário criado");
      qc.invalidateQueries({ queryKey: ["funcionarios"] });
      setOpen(false);
      setForm({ email: "", password: "", full_name: "", phone: "", cargo: "", role: "vendedor" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (user_id: string) => deleteFn({ data: { user_id } }),
    onSuccess: () => {
      toast.success("Funcionário removido");
      qc.invalidateQueries({ queryKey: ["funcionarios"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = schema.safeParse(form);
    if (!p.success) { toast.error(p.error.errors[0].message); return; }
    create.mutate(p.data);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Funcionários</h1>
          <p className="text-muted-foreground text-sm">Equipa e desempenho</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Novo funcionário</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Criar funcionário</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div className="space-y-2"><Label>Nome</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
                  <div className="space-y-2"><Label>Senha temporária</Label><Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></div>
                  <div className="space-y-2"><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Cargo</Label><Input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} placeholder="Vendedor sénior, …" /></div>
                </div>
                <div className="space-y-2">
                  <Label>Papel</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as "admin" | "vendedor" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vendedor">Vendedor</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter><Button type="submit" disabled={create.isPending}>Criar</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader />
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead className="text-right">Bilhetes</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">Lucro</TableHead>
                {isAdmin && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={8} className="text-center py-8">A carregar…</TableCell></TableRow>}
              {(data ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.full_name}</TableCell>
                  <TableCell>{p.phone ?? "—"}</TableCell>
                  <TableCell>{p.cargo ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={p.role === "admin" ? "default" : "secondary"}>
                      {p.role === "admin" ? "Administrador" : "Vendedor"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.stats.tickets}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(p.stats.receita, currency)}</TableCell>
                  <TableCell className="text-right tabular-nums text-success font-semibold">{formatCurrency(p.stats.lucro, currency)}</TableCell>
                  {isAdmin && (
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Remover ${p.full_name}?`)) remove.mutate(p.id); }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}