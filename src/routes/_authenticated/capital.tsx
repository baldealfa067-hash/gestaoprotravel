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
  Trash2,
  FileDown,
} from "lucide-react";

import { exportarRelatorioGeralPDF } from "@/lib/pdf-relatorio-geral";
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
  const circulanteConta = (contas.data ?? []).find((x: any) => x.sistema);
  const emCaixa = Number(circulanteConta?.saldo_inicial ?? 0);
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

      {/* Total geral em destaque */}
      <section>
        <Card className="border-foreground/20 bg-muted/40">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Layers className="h-5 w-5" /> Total geral
            </div>
            <div className="text-4xl md:text-5xl font-bold mt-2 tabular-nums">
              {formatCurrency(totalGeral, currency)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Banco + Companhias + Dívidas
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Cards principais */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          label="Valores totais das agências"
          value={emCompanhias}
          currency={currency}
          tone="neutral"
          onEdit="companhias"
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
        <NovaContaDialog />
      </div>

      <p className="text-xs text-muted-foreground">
        O <b>Total geral</b> é calculado automaticamente e não pode ser editado. Correções
        manuais geram sempre um movimento no histórico com motivo e responsável.
      </p>

      {/* Secções organizadas em abas */}
      <Tabs defaultValue="companhias" className="w-full">
        <TabsList>
          <TabsTrigger value="companhias">Companhias aéreas</TabsTrigger>
          <TabsTrigger value="contas">Contas</TabsTrigger>
          <TabsTrigger value="dividas">Dívidas de clientes</TabsTrigger>
          <TabsTrigger value="dividas-cias">Dívidas a companhias</TabsTrigger>
          <TabsTrigger value="carregamentos">Carregamentos</TabsTrigger>
          <TabsTrigger value="reservas-emitidas">Reservas emitidas</TabsTrigger>
        </TabsList>
        <TabsContent value="companhias" className="mt-4">
          <CompanhiasEditor />
        </TabsContent>
        <TabsContent value="contas" className="mt-4">
          <ContasSection contas={contas.data ?? []} currency={currency} />
        </TabsContent>
        <TabsContent value="dividas" className="mt-4">
          <DividasSection currency={currency} settings={settings} />
        </TabsContent>
        <TabsContent value="dividas-cias" className="mt-4">
          <DividasCompanhiasSection currency={currency} />
        </TabsContent>
        <TabsContent value="carregamentos" className="mt-4">
          <CarregamentosSection currency={currency} />
        </TabsContent>
        <TabsContent value="reservas-emitidas" className="mt-4">
          <ReservasEmitidasSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DividasSection({ currency, settings }: { currency: string; settings: any }) {
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
        if (restante < 0.01) situacao = "pago";
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
              Separado por pago total, pagamento parcial e sem pagamento.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span>Total faturado: <b className="tabular-nums">{formatCurrency(totais.total, currency)}</b></span>
            <span className="text-warning">A receber: <b className="tabular-nums">{formatCurrency(totais.devido, currency)}</b></span>
            <span className="text-success">Pagos: <b>{totais.pagos}</b></span>
            <span className="text-primary">Parciais: <b>{totais.parciais}</b></span>
            <span className="text-destructive">Não pagos: <b>{totais.naoPagos}</b></span>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await exportarRelatorioGeralPDF({
                    currency,
                    agencyName: settings?.agency_name ?? "Agência",
                  });
                } catch (e: any) {
                  toast.error(e?.message ?? "Erro a gerar PDF");
                }
              }}
            >
              <FileDown className="h-4 w-4 mr-1" /> Relatório Geral
            </Button>
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
            {rows
              .slice()
              .sort((a: any, b: any) => {
                const order: Record<string, number> = { parcial: 0, nao_pago: 1, pago: 2 };
                return order[a.situacao] - order[b.situacao];
              })
              .map((r: any) => (
              <TableRow key={r.id} className={r.situacao !== "pago" ? "bg-warning/5" : undefined}>
                <TableCell className="font-medium">{r.cliente?.full_name ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(Number(r.valor_cobrado ?? 0), currency)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(r.pago_valor, currency)}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(r.restante, currency)}</TableCell>
                <TableCell>
                  {r.situacao === "pago" && <Badge className="bg-success text-success-foreground">Pago total</Badge>}
                  {r.situacao === "parcial" && <Badge className="bg-warning/15 text-warning-foreground border border-warning/40">Pagamento parcial</Badge>}
                  {r.situacao === "nao_pago" && <Badge variant="destructive">Ainda deve</Badge>}
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
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (open) {
      setNovo(String(currentValue));
      setMotivo("");
    }
  }, [open, currentValue]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = Number(novo);
    if (Number.isNaN(v) || v < 0) return toast.error("Valor inválido");
    if (motivo.trim().length < 3) return toast.error("Motivo muito curto");
    setSaving(true);
    const { error } = await (supabase as any).rpc("ajustar_capital", {
      _target: target,
      _novo_valor: v,
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
            Gera um movimento auditável no histórico, com motivo e responsável.
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
  const capitalConta = useMemo(() => contas.find((c: any) => c.sistema), [contas]);
  const capitalId = capitalConta?.id ?? "";
  const [form, setForm] = useState({ conta_origem_id: "", companhia_id: "", valor: "", descricao: "" });

  useEffect(() => {
    if (open && !form.conta_origem_id && capitalId) {
      setForm((f) => ({ ...f, conta_origem_id: capitalId }));
    }
  }, [open, capitalId, form.conta_origem_id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!capitalId) return toast.error("Conta Capital Circulante não encontrada");
    if (!form.companhia_id) return toast.error("Escolha a companhia");
    const valor = Number(form.valor);
    if (!valor || valor <= 0) return toast.error("Valor inválido");
    if (capitalConta && Number(capitalConta.saldo_inicial) < valor) return toast.error("Saldo insuficiente no Capital Circulante");
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("movimentacoes_capital").insert({
      tipo: "carregamento_companhia",
      valor,
      conta_origem_id: capitalId,
      companhia_id: form.companhia_id,
      observacao: form.descricao.trim() || "Carregamento de companhia",
      responsavel_id: user?.id,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Companhia carregada");
    qc.invalidateQueries({ queryKey: ["contas_financeiras"] });
    qc.invalidateQueries({ queryKey: ["companhias_aereas"] });
    qc.invalidateQueries({ queryKey: ["companhias-editor"] });
    qc.invalidateQueries({ queryKey: ["capital-consistencia"] });
    qc.invalidateQueries({ queryKey: ["capital-carregamentos"] });
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
            <Label>Origem</Label>
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium">
              {capitalConta
                ? `${capitalConta.nome} — ${formatCurrency(Number(capitalConta.saldo_inicial ?? 0), "")}`
                : "Capital Circulante não encontrado"}
            </div>
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

function DefinirCirculanteDialog({ settings: _settings }: { settings: any }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [valor, setValor] = useState<string>("");

  const { data: circulante } = useQuery({
    queryKey: ["capital-circulante-conta"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("contas_financeiras")
        .select("id, nome, saldo_inicial")
        .eq("sistema", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (open) {
      setValor(String(circulante?.saldo_inicial ?? 0));
    }
  }, [open, circulante]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const novo = Number(valor);
    if (isNaN(novo) || novo < 0) return toast.error("Valor inválido");
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("definir_capital_circulante", {
        _novo_valor: novo,
      });
      if (error) throw error;
      toast.success("Capital Circulante atualizado");
      qc.invalidateQueries({ queryKey: ["contas_financeiras"] });
      qc.invalidateQueries({ queryKey: ["capital-consistencia"] });
      qc.invalidateQueries({ queryKey: ["capital-circulante-conta"] });
      qc.invalidateQueries({ queryKey: ["movimentacoes"] });
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
            Coloque o valor total e clique em Guardar. A alteração fica registada
            automaticamente no histórico.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label>Valor total *</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
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

function ContasSection({ contas, currency }: { contas: any[]; currency: string }) {
  const qc = useQueryClient();

  const toggleAtiva = async (conta: any) => {
    const { error } = await (supabase as any)
      .from("contas_financeiras")
      .update({ ativa: !conta.ativa })
      .eq("id", conta.id);
    if (error) return toast.error(error.message);
    toast.success(conta.ativa ? "Conta inativada" : "Conta ativada");
    qc.invalidateQueries({ queryKey: ["contas_financeiras"] });
    qc.invalidateQueries({ queryKey: ["capital-consistencia"] });
  };

  const eliminar = async (conta: any) => {
    if (conta.sistema) return toast.error("Não pode eliminar a conta de sistema");
    if (!confirm(`Eliminar a conta "${conta.nome}"? Esta ação não pode ser desfeita.`)) return;
    const { error } = await (supabase as any)
      .from("contas_financeiras")
      .delete()
      .eq("id", conta.id);
    if (error) return toast.error(error.message);
    toast.success("Conta eliminada");
    qc.invalidateQueries({ queryKey: ["contas_financeiras"] });
    qc.invalidateQueries({ queryKey: ["capital-consistencia"] });
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div>
          <h2 className="font-semibold">Contas (banco / caixa)</h2>
          <p className="text-xs text-muted-foreground">
            A conta de sistema (★ Capital Circulante) não pode ser eliminada.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contas.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Sem contas.</TableCell></TableRow>
            )}
            {contas.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  {c.sistema && <span className="text-primary mr-1">★</span>}
                  {c.nome}
                </TableCell>
                <TableCell className="capitalize text-muted-foreground">{c.tipo}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(Number(c.saldo_inicial ?? 0), currency)}</TableCell>
                <TableCell>
                  {c.ativa
                    ? <Badge className="bg-success/15 text-success border border-success/40">Ativa</Badge>
                    : <Badge variant="secondary">Inativa</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {!c.sistema && (
                      <Button size="sm" variant="outline" onClick={() => toggleAtiva(c)}>
                        {c.ativa ? "Inativar" : "Ativar"}
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => eliminar(c)}
                      disabled={c.sistema}
                      title={c.sistema ? "Conta de sistema" : "Eliminar"}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ReservasEmitidasSection() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["capital-reservas-emitidas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("reservas")
        .select("id, pnr, companhia, origem, destino, data_viagem, data_limite, updated_at, cliente:clientes(full_name)")
        .eq("status", "emitida")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Emitida em</TableHead>
              <TableHead>PNR</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Rota</TableHead>
              <TableHead>Companhia</TableHead>
              <TableHead>Viagem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  A carregar…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && data.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhuma reserva emitida ainda
                </TableCell>
              </TableRow>
            )}
            {data.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="tabular-nums text-sm">
                  {new Date(r.updated_at).toLocaleString("pt-PT")}
                </TableCell>
                <TableCell className="font-mono text-xs font-semibold">{r.pnr}</TableCell>
                <TableCell>{r.cliente?.full_name ?? "—"}</TableCell>
                <TableCell>{r.origem} → {r.destino}</TableCell>
                <TableCell>{r.companhia}</TableCell>
                <TableCell>{new Date(r.data_viagem).toLocaleDateString("pt-PT")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DividasCompanhiasSection({ currency }: { currency: string }) {
  const qc = useQueryClient();
  const [payFor, setPayFor] = useState<any | null>(null);
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ["capital-dividas-companhias"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("companhias_aereas")
        .select("id, nome, codigo, saldo, ultimo_consumo, ativa")
        .eq("modo", "credito")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as any[];
    },
    refetchInterval: 30_000,
  });

  const total = data.reduce((s: number, r: any) => s + (Number(r.saldo) < 0 ? -Number(r.saldo) : 0), 0);

  const submitPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payFor) return;
    const v = Number(valor);
    if (!v || v <= 0) return toast.error("Valor inválido");
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("movimentacoes_capital").insert({
      tipo: "pagamento_companhia",
      valor: v,
      companhia_id: payFor.id,
      observacao: obs.trim() || `Pagamento a ${payFor.nome}`,
      responsavel_id: user?.id,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Pagamento registado");
    qc.invalidateQueries({ queryKey: ["capital-dividas-companhias"] });
    qc.invalidateQueries({ queryKey: ["companhias_aereas"] });
    qc.invalidateQueries({ queryKey: ["companhias-editor"] });
    qc.invalidateQueries({ queryKey: ["companhias-options"] });
    setPayFor(null); setValor(""); setObs("");
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Dívidas a companhias intermediárias</h2>
            <p className="text-xs text-muted-foreground">
              Companhias em modo Crédito. O pagamento aqui é manual e não mexe no Capital Circulante.
            </p>
          </div>
          <div className="text-xs">
            Total a pagar: <b className="tabular-nums text-destructive">{formatCurrency(total, currency)}</b>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Companhia</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Último uso</TableHead>
              <TableHead className="text-right">Dívida atual</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">A carregar…</TableCell></TableRow>
            )}
            {!isLoading && data.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Nenhuma companhia intermediária cadastrada.</TableCell></TableRow>
            )}
            {data.map((c: any) => {
              const saldo = Number(c.saldo ?? 0);
              const divida = saldo < 0 ? -saldo : 0;
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="font-mono text-xs">{c.codigo ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.ultimo_consumo ? new Date(c.ultimo_consumo).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums font-semibold ${divida > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    {formatCurrency(divida, currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setPayFor(c); setValor(divida > 0 ? String(divida) : ""); setObs(""); }}
                    >
                      Registar pagamento
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pagamento a {payFor?.nome}</DialogTitle>
            <DialogDescription>
              Registo manual — reduz a dívida à companhia sem tocar no Capital Circulante.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitPay} className="space-y-3">
            <div className="space-y-1">
              <Label>Valor *</Label>
              <Input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1">
              <Label>Observação</Label>
              <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex: transferência bancária ref. 1234" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPayFor(null)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "..." : "Registar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

