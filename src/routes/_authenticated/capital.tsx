import { createFileRoute } from "@tanstack/react-router";
import { RequireAdmin } from "@/components/require-admin";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Wallet,
  PiggyBank,
  Plane,
  Users,
  Layers,
  Plus,
  Pencil,
  ArrowDownLeft,
  Banknote,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { useAgencySettings } from "@/hooks/use-agency-settings";
import { CompanhiasEditor } from "@/components/companhias-editor";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/capital")({
  component: () => (
    <RequireAdmin>
      <CapitalPage />
    </RequireAdmin>
  ),
});

type Target = "caixa" | "companhias" | "lucro";

function CapitalPage() {
  const { data: settings } = useAgencySettings();
  const currency = settings?.currency ?? "AOA";

  const consistencia = useQuery({
    queryKey: ["capital-consistencia"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("verificar_consistencia_capital");
      if (error) throw error;
      return (data?.[0] ?? null) as {
        capital_contas: number;
        capital_companhias: number;
        capital_dividas: number;
        fundo_lucro: number;
      } | null;
    },
    refetchInterval: 30_000,
  });

  const contas = useQuery({
    queryKey: ["contas_financeiras"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("contas_financeiras")
        .select("*")
        .order("sistema", { ascending: false })
        .order("nome");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const companhias = useQuery({
    queryKey: ["companhias_aereas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("companhias_aereas")
        .select("*")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const c = consistencia.data;
  const emCaixa = Number(c?.capital_contas ?? 0);
  const emCompanhias = Number(c?.capital_companhias ?? 0);
  const aReceber = Number(c?.capital_dividas ?? 0);
  const fundoLucro = Number(c?.fundo_lucro ?? 0);
  const totalGeral = emCaixa + emCompanhias + aReceber;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Capital</h1>
        <p className="text-muted-foreground text-sm">
          Onde está o dinheiro, agora.
        </p>
      </div>

      {/* 5 cards principais */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          icon={<Users className="h-4 w-4" />}
          label="Clientes a dever"
          value={aReceber}
          currency={currency}
          tone="warning"
        />
        <MetricCard
          icon={<Wallet className="h-4 w-4" />}
          label="Disponível (banco / caixa)"
          value={emCaixa}
          currency={currency}
          tone="primary"
          onEdit="caixa"
        />
        <MetricCard
          icon={<Plane className="h-4 w-4" />}
          label="Carregado nas companhias"
          value={emCompanhias}
          currency={currency}
          tone="neutral"
          onEdit="companhias"
        />
        <MetricCard
          icon={<Layers className="h-4 w-4" />}
          label="Total geral"
          value={totalGeral}
          currency={currency}
          tone="strong"
          hint="Banco + Companhias + Dívidas"
        />
        <MetricCard
          icon={<PiggyBank className="h-4 w-4" />}
          label="Lucro por taxas"
          value={fundoLucro}
          currency={currency}
          tone="success"
          onEdit="lucro"
        />
      </section>

      {/* Ações rápidas (operação diária) */}
      <div className="flex flex-wrap gap-2">
        <DefinirCirculanteDialog settings={settings} />
        <AporteDialog contas={contas.data ?? []} />
        <CarregarCompanhiaDialog
          contas={contas.data ?? []}
          companhias={companhias.data ?? []}
        />
        <NovaContaDialog />
      </div>

      <p className="text-xs text-muted-foreground">
        O <b>Total geral</b> é calculado automaticamente e não pode ser editado. Correções
        manuais geram sempre um movimento no histórico com PIN, motivo e responsável.
      </p>

      {/* Secções organizadas em abas */}
      <Tabs defaultValue="companhias" className="w-full">
        <TabsList>
          <TabsTrigger value="companhias">Companhias aéreas</TabsTrigger>
          <TabsTrigger value="dividas">Dívidas de clientes</TabsTrigger>
          <TabsTrigger value="carregamentos">Carregamentos</TabsTrigger>
        </TabsList>
        <TabsContent value="companhias" className="mt-4">
          <CompanhiasEditor />
        </TabsContent>
        <TabsContent value="dividas" className="mt-4">
          <DividasSection currency={currency} />
        </TabsContent>
        <TabsContent value="carregamentos" className="mt-4">
          <CarregamentosSection currency={currency} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DividasSection({ currency }: { currency: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["capital-dividas-lista"],
    queryFn: async () => {
      const { data: bilhetes, error } = await (supabase as any)
        .from("bilhetes")
        .select("id, valor_cobrado, pago, status, created_at, cliente:cliente_id(id, full_name)")
        .in("status", ["emitido", "pendente", "pedido_criado"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (bilhetes ?? []).map((b: any) => b.id);
      let pagosPorBilhete: Record<string, number> = {};
      if (ids.length) {
        const { data: movs } = await (supabase as any)
          .from("movimentacoes_capital")
          .select("bilhete_id, valor")
          .eq("tipo", "pagamento_cliente")
          .in("bilhete_id", ids);
        for (const m of movs ?? []) {
          pagosPorBilhete[m.bilhete_id] = (pagosPorBilhete[m.bilhete_id] ?? 0) + Number(m.valor);
        }
      }
      return (bilhetes ?? []).map((b: any) => {
        const pago = pagosPorBilhete[b.id] ?? 0;
        const total = Number(b.valor_cobrado ?? 0);
        const restante = Math.max(0, total - pago);
        let situacao: "pago" | "parcial" | "nao_pago" = "nao_pago";
        if (b.pago || restante < 0.01) situacao = "pago";
        else if (pago > 0) situacao = "parcial";
        return { ...b, pago_valor: pago, restante, situacao };
      });
    },
    refetchInterval: 30_000,
  });

  const rows = data ?? [];
  const totais = {
    total: rows.reduce((s: number, r: any) => s + Number(r.valor_cobrado ?? 0), 0),
    devido: rows.reduce((s: number, r: any) => s + r.restante, 0),
    pagos: rows.filter((r: any) => r.situacao === "pago").length,
    parciais: rows.filter((r: any) => r.situacao === "parcial").length,
    naoPagos: rows.filter((r: any) => r.situacao === "nao_pago").length,
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Dívidas de clientes</h2>
            <p className="text-xs text-muted-foreground">
              Quem já pagou, quem pagou pela metade e quem ainda deve.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <span>Total faturado: <b className="tabular-nums">{formatCurrency(totais.total, currency)}</b></span>
            <span className="text-warning">A receber: <b className="tabular-nums">{formatCurrency(totais.devido, currency)}</b></span>
            <span className="text-success">Pagos: <b>{totais.pagos}</b></span>
            <span className="text-primary">Parciais: <b>{totais.parciais}</b></span>
            <span className="text-destructive">Não pagos: <b>{totais.naoPagos}</b></span>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Pago</TableHead>
              <TableHead className="text-right">Em dívida</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">A carregar…</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Sem bilhetes em aberto.</TableCell></TableRow>
            )}
            {rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.cliente?.full_name ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(Number(r.valor_cobrado ?? 0), currency)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(r.pago_valor, currency)}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(r.restante, currency)}</TableCell>
                <TableCell>
                  {r.situacao === "pago" && <Badge className="bg-success text-success-foreground">Pago</Badge>}
                  {r.situacao === "parcial" && <Badge className="bg-primary/15 text-primary border border-primary/40">Pagou pela metade</Badge>}
                  {r.situacao === "nao_pago" && <Badge variant="destructive">Não pagou</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CarregamentosSection({ currency }: { currency: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["capital-carregamentos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("movimentacoes_capital")
        .select("id, valor, created_at, observacao, companhia:companhia_id(nome, codigo)")
        .eq("tipo", "carregamento_companhia")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const rows = data ?? [];
  const total = rows.reduce((s: number, r: any) => s + Number(r.valor ?? 0), 0);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Carregamentos das companhias</h2>
            <p className="text-xs text-muted-foreground">
              Quanto foi carregado em cada companhia e quando.
            </p>
          </div>
          <div className="text-xs">
            Total carregado (últimos 100): <b className="tabular-nums">{formatCurrency(total, currency)}</b>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Companhia</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Descrição</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">A carregar…</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Ainda não há carregamentos.</TableCell></TableRow>
            )}
            {rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </TableCell>
                <TableCell className="font-medium">
                  {r.companhia?.nome ?? "—"}
                  {r.companhia?.codigo && <span className="ml-1 text-xs text-muted-foreground">({r.companhia.codigo})</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold text-primary">
                  {formatCurrency(Number(r.valor ?? 0), currency)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.observacao ?? ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function MetricCard({
  icon,
  label,
  value,
  currency,
  tone,
  hint,
  onEdit,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  currency: string;
  tone: "primary" | "success" | "warning" | "neutral" | "strong";
  hint?: string;
  onEdit?: Target;
}) {
  const toneClass = {
    primary: "border-primary/40 bg-primary/5 text-primary",
    success: "border-success/40 bg-success/5 text-success",
    warning: "border-warning/40 bg-warning/5 text-warning",
    neutral: "",
    strong: "border-foreground/20 bg-muted/40",
  }[tone];
  const valueTone = {
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    neutral: "",
    strong: "",
  }[tone];

  return (
    <Card className={toneClass}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {icon} {label}
          </div>
          {onEdit && <CorrigirButton target={onEdit} currentValue={value} label={label} />}
        </div>
        <div className={`text-2xl font-bold mt-2 tabular-nums ${valueTone}`}>
          {formatCurrency(value, currency)}
        </div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function CorrigirButton({
  target,
  currentValue,
  label,
}: {
  target: Target;
  currentValue: number;
  label: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [novo, setNovo] = useState("");
  const [pin, setPin] = useState("");
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (open) {
      setNovo(String(currentValue));
      setPin("");
      setMotivo("");
    }
  }, [open, currentValue]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = Number(novo);
    if (Number.isNaN(v) || v < 0) return toast.error("Valor inválido");
    if (!pin) return toast.error("Informe o PIN de admin");
    if (motivo.trim().length < 3) return toast.error("Motivo muito curto");
    setSaving(true);
    const { error } = await (supabase as any).rpc("ajustar_capital", {
      _target: target,
      _novo_valor: v,
      _pin: pin,
      _motivo: motivo.trim(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Valor corrigido");
    qc.invalidateQueries({ queryKey: ["capital-consistencia"] });
    qc.invalidateQueries({ queryKey: ["contas_financeiras"] });
    qc.invalidateQueries({ queryKey: ["companhias_aereas"] });
    qc.invalidateQueries({ queryKey: ["movimentacoes"] });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          title="Corrigir valor"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Corrigir: {label}</DialogTitle>
          <DialogDescription>
            Gera um movimento auditável. O PIN é configurado em Configurações.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label>Novo valor</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label>PIN do admin</Label>
            <Input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
            />
          </div>
          <div className="space-y-1">
            <Label>Motivo</Label>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex: reconciliação com extrato"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "A guardar..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   Diálogos operacionais (mantidos do fluxo existente)
   ============================================================ */


function NovaContaDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ nome: "", tipo: "banco", saldo_inicial: "0" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) return toast.error("Informe o nome");
    setSaving(true);
    const { error } = await (supabase as any).from("contas_financeiras").insert({
      nome: form.nome.trim(),
      tipo: form.tipo,
      saldo_inicial: Number(form.saldo_inicial) || 0,
      ativa: true,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Conta criada");
    qc.invalidateQueries({ queryKey: ["contas_financeiras"] });
    qc.invalidateQueries({ queryKey: ["capital-consistencia"] });
    setForm({ nome: "", tipo: "banco", saldo_inicial: "0" });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Plus className="h-4 w-4" /> Nova conta</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova conta (Caixa/Banco)</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label>Nome *</Label>
            <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="banco">Banco</SelectItem>
                  <SelectItem value="caixa">Caixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Saldo inicial</Label>
              <Input type="number" step="0.01" value={form.saldo_inicial} onChange={(e) => setForm({ ...form, saldo_inicial: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "A guardar..." : "Criar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AporteDialog({ contas }: { contas: any[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const capitalId = useMemo(() => (contas.find((c: any) => c.sistema)?.id ?? ""), [contas]);
  const [form, setForm] = useState({ conta_destino_id: "", valor: "", descricao: "" });

  useEffect(() => {
    if (open && !form.conta_destino_id && capitalId) {
      setForm((f) => ({ ...f, conta_destino_id: capitalId }));
    }
  }, [open, capitalId, form.conta_destino_id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.conta_destino_id) return toast.error("Escolha a conta destino");
    const valor = Number(form.valor);
    if (!valor || valor <= 0) return toast.error("Valor inválido");
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("movimentacoes_capital").insert({
      tipo: "aporte_capital",
      valor,
      conta_destino_id: form.conta_destino_id,
      observacao: form.descricao.trim() || "Aporte de capital",
      responsavel_id: user?.id,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Aporte registado");
    qc.invalidateQueries({ queryKey: ["contas_financeiras"] });
    qc.invalidateQueries({ queryKey: ["capital-consistencia"] });
    setForm({ conta_destino_id: capitalId, valor: "", descricao: "" });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-success hover:bg-success/90 text-success-foreground">
          <ArrowDownLeft className="h-4 w-4" /> Aporte
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aporte de capital</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label>Conta destino *</Label>
            <Select value={form.conta_destino_id} onValueChange={(v) => setForm({ ...form, conta_destino_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                {contas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.sistema ? "★ " : ""}{c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Valor *</Label>
            <Input type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} autoFocus />
          </div>
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "..." : "Registar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CarregarCompanhiaDialog({ contas, companhias }: { contas: any[]; companhias: any[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const capitalId = useMemo(() => (contas.find((c: any) => c.sistema)?.id ?? ""), [contas]);
  const [form, setForm] = useState({ conta_origem_id: "", companhia_id: "", valor: "", descricao: "" });

  useEffect(() => {
    if (open && !form.conta_origem_id && capitalId) {
      setForm((f) => ({ ...f, conta_origem_id: capitalId }));
    }
  }, [open, capitalId, form.conta_origem_id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.conta_origem_id) return toast.error("Escolha a conta origem");
    if (!form.companhia_id) return toast.error("Escolha a companhia");
    const valor = Number(form.valor);
    if (!valor || valor <= 0) return toast.error("Valor inválido");
    const conta = contas.find((c) => c.id === form.conta_origem_id);
    if (conta && Number(conta.saldo_inicial) < valor) return toast.error("Saldo insuficiente");
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("movimentacoes_capital").insert({
      tipo: "carregamento_companhia",
      valor,
      conta_origem_id: form.conta_origem_id,
      companhia_id: form.companhia_id,
      observacao: form.descricao.trim() || "Carregamento de companhia",
      responsavel_id: user?.id,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Companhia carregada");
    qc.invalidateQueries({ queryKey: ["contas_financeiras"] });
    qc.invalidateQueries({ queryKey: ["companhias_aereas"] });
    qc.invalidateQueries({ queryKey: ["capital-consistencia"] });
    setForm({ conta_origem_id: capitalId, companhia_id: "", valor: "", descricao: "" });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plane className="h-4 w-4" /> Carregar companhia
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Carregar companhia</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label>Conta origem *</Label>
            <Select value={form.conta_origem_id} onValueChange={(v) => setForm({ ...form, conta_origem_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                {contas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.sistema ? "★ " : ""}{c.nome} — {formatCurrency(c.saldo_inicial, "")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Companhia *</Label>
            <Select value={form.companhia_id} onValueChange={(v) => setForm({ ...form, companhia_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                {companhias.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Valor *</Label>
            <Input type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} autoFocus />
          </div>
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "..." : "Registar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DefinirCirculanteDialog({ settings }: { settings: any }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [valor, setValor] = useState<string>("0");

  useEffect(() => {
    if (open && settings) {
      setValor(String(settings.capital_base_operacional ?? 0));
    }
  }, [open, settings]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const novo = Number(valor);
    if (isNaN(novo) || novo < 0) return toast.error("Valor inválido");
    setSaving(true);
    try {
      if (settings?.id) {
        const { error } = await supabase
          .from("agency_settings")
          .update({ capital_base_operacional: novo } as any)
          .eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("agency_settings")
          .insert({ capital_base_operacional: novo, agency_name: "Minha Agência", currency: "AOA" } as any);
        if (error) throw error;
      }
      const { error: rpcErr } = await (supabase as any).rpc("sincronizar_capital_base");
      if (rpcErr) throw rpcErr;
      toast.success("Capital Circulante atualizado");
      qc.invalidateQueries({ queryKey: ["agency_settings"] });
      qc.invalidateQueries({ queryKey: ["contas_financeiras"] });
      qc.invalidateQueries({ queryKey: ["capital-consistencia"] });
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message ?? "Erro");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Banknote className="h-4 w-4" /> Definir Capital Circulante
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Capital Circulante</DialogTitle>
          <DialogDescription>
            Valor total do dinheiro operacional da agência. Ao guardar, o saldo do Capital
            Circulante é ajustado automaticamente com um movimento no histórico.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label>Valor total *</Label>
            <Input
              type="number"
              step="0.01"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

