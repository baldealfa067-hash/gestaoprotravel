import { createFileRoute } from "@tanstack/react-router";
import { RequireAdmin } from "@/components/require-admin";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  CheckCircle2,
  Wallet,
  PiggyBank,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
} from "lucide-react";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { useAgencySettings } from "@/hooks/use-agency-settings";
import {
  DIR_COLOR,
  MOV_TIPO_LABEL,
  MOV_TIPO_OPTIONS,
  debtStatus,
  movDirection,
} from "@/lib/capital";
import { differenceInCalendarDays } from "date-fns";


export const Route = createFileRoute("/_authenticated/capital")({
  component: () => (
    <RequireAdmin>
      <CapitalPage />
    </RequireAdmin>
  ),
});

function CapitalPage() {
  const { data: settings } = useAgencySettings();
  const currency = settings?.currency ?? "AOA";
  const qc = useQueryClient();

  const consistencia = useQuery({
    queryKey: ["capital-consistencia"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("verificar_consistencia_capital");
      if (error) throw error;
      return (data?.[0] ?? null) as {
        capital_contas: number;
        capital_companhias: number;
        capital_dividas: number;
        capital_total: number;
        capital_base: number;
        fundo_lucro: number;
        taxa_acumulada: number;
        diferenca: number;
        consistente: boolean;
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

  const bilhetes = useQuery({
    queryKey: ["capital-bilhetes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bilhetes")
        .select(
          "id, created_at, custo, valor_cobrado, taxa_agencia, lucro, continente_origem, continente_destino, classe, origem, destino, status, pago, vendedor_id, cliente_id, cliente:clientes(full_name)",
        );
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const vendedores = useQuery({
    queryKey: ["capital-vendedores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const [movFilters, setMovFilters] = useState({
    from: "",
    to: "",
    tipo: "all",
    conta: "all",
    companhia: "all",
    vendedor: "all",
  });

  const movs = useQuery({
    queryKey: ["movimentacoes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("movimentacoes_capital")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const vendedorMap = useMemo(
    () => Object.fromEntries((vendedores.data ?? []).map((p: any) => [p.id, p.full_name])),
    [vendedores.data],
  );
  const contaMap = useMemo(
    () => Object.fromEntries((contas.data ?? []).map((c: any) => [c.id, c.nome])),
    [contas.data],
  );
  const cieMap = useMemo(
    () => Object.fromEntries((companhias.data ?? []).map((c: any) => [c.id, c.nome])),
    [companhias.data],
  );

  const filteredMovs = useMemo(() => {
    return (movs.data ?? []).filter((m: any) => {
      const d = new Date(m.created_at);
      if (movFilters.from && d < new Date(movFilters.from)) return false;
      if (movFilters.to && d > new Date(new Date(movFilters.to).getTime() + 86400000)) return false;
      if (movFilters.tipo !== "all" && m.tipo !== movFilters.tipo) return false;
      if (
        movFilters.conta !== "all" &&
        m.conta_origem_id !== movFilters.conta &&
        m.conta_destino_id !== movFilters.conta
      )
        return false;
      if (movFilters.companhia !== "all" && m.companhia_id !== movFilters.companhia) return false;
      if (movFilters.vendedor !== "all" && m.responsavel_id !== movFilters.vendedor) return false;
      return true;
    });
  }, [movs.data, movFilters]);




  // Dívidas
  const dividas = useMemo(() => {
    const now = Date.now();
    const list = (bilhetes.data ?? [])
      .filter(
        (b: any) => !b.pago && ["emitido", "pendente", "pedido_criado"].includes(b.status),
      )
      .map((b: any) => {
        const dias = differenceInCalendarDays(now, new Date(b.created_at));
        return { ...b, dias };
      })
      .sort((a: any, b: any) => b.dias - a.dias);
    const total = list.reduce((s: number, b: any) => s + Number(b.valor_cobrado ?? 0), 0);
    const clientesDist = new Set(list.map((b: any) => b.cliente_id)).size;
    return { list, total, clientesDist };
  }, [bilhetes.data]);

  const c = consistencia.data;
  const capitalBase = c?.capital_base ?? 0;
  const circulacao = c?.capital_total ?? 0;
  const divergencia = c?.diferenca ?? 0;
  const integro = c?.consistente ?? false;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Capital</h1>
          <p className="text-muted-foreground text-sm">
            Rastreamento operacional — o dinheiro circula, o lucro é separado
          </p>
        </div>
        {c &&
          (integro ? (
            <Badge className="bg-success/15 text-success border border-success/40 gap-1.5 py-1.5 px-3">
              <CheckCircle2 className="h-3.5 w-3.5" /> Capital operacional íntegro
            </Badge>
          ) : (
            <Badge className="bg-destructive/15 text-destructive border border-destructive/40 gap-1.5 py-1.5 px-3">
              <AlertCircle className="h-3.5 w-3.5" />
              Divergência: {divergencia > 0 ? "+" : ""}
              {formatCurrency(divergencia, currency)}
            </Badge>
          ))}
      </div>

      {/* Resumo operacional */}
      <section className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Wallet className="h-4 w-4" /> Capital Base
            </div>
            <div className="text-2xl font-bold mt-2 tabular-nums">
              {formatCurrency(capitalBase, currency)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Valor fixo definido em Configurações
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ArrowLeftRight className="h-4 w-4" /> Capital em Circulação
            </div>
            <div className="text-2xl font-bold mt-2 tabular-nums text-primary">
              {formatCurrency(circulacao, currency)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Caixa/Bancos + Companhias + Dívidas
            </div>
          </CardContent>
        </Card>

        <Card
          className={
            integro
              ? "border-success/40 bg-success/5"
              : "border-destructive/40 bg-destructive/5"
          }
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {integro ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}{" "}
              Divergência
            </div>
            <div
              className={`text-2xl font-bold mt-2 tabular-nums ${
                integro ? "text-success" : "text-destructive"
              }`}
            >
              {integro
                ? formatCurrency(0, currency)
                : `${divergencia > 0 ? "+" : ""}${formatCurrency(divergencia, currency)}`}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {integro
                ? "Capital operacional íntegro"
                : divergencia > 0
                  ? "Sobra em circulação"
                  : "Falta em circulação"}
            </div>
          </CardContent>
        </Card>

        <Card className="border-success/40 bg-success/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <PiggyBank className="h-4 w-4" /> Fundo de Lucro
            </div>
            <div className="text-2xl font-bold mt-2 tabular-nums text-success">
              {formatCurrency(c?.fundo_lucro ?? 0, currency)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Separado do capital operacional
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Ações rápidas */}
      <div className="flex flex-wrap gap-2">
        <AporteDialog contas={contas.data ?? []} />
        <CarregarCompanhiaDialog
          contas={contas.data ?? []}
          companhias={companhias.data ?? []}
        />
        <NovaContaDialog />
        <NovaCompanhiaDialog />
      </div>

      <Tabs defaultValue="movimentacoes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="movimentacoes">Movimento do capital</TabsTrigger>
          <TabsTrigger value="dividas">Dívidas</TabsTrigger>
          <TabsTrigger value="companhias">Companhias</TabsTrigger>
        </TabsList>

        {/* Movimentações */}
        <TabsContent value="movimentacoes" className="space-y-4">

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filtros</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-6">
              <div className="space-y-1.5">
                <Label className="text-xs">De</Label>
                <Input
                  type="date"
                  value={movFilters.from}
                  onChange={(e) => setMovFilters({ ...movFilters, from: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Até</Label>
                <Input
                  type="date"
                  value={movFilters.to}
                  onChange={(e) => setMovFilters({ ...movFilters, to: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo</Label>
                <Select
                  value={movFilters.tipo}
                  onValueChange={(v) => setMovFilters({ ...movFilters, tipo: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {MOV_TIPO_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {MOV_TIPO_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Conta</Label>
                <Select
                  value={movFilters.conta}
                  onValueChange={(v) => setMovFilters({ ...movFilters, conta: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {(contas.data ?? []).map((k: any) => (
                      <SelectItem key={k.id} value={k.id}>
                        {k.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Companhia</Label>
                <Select
                  value={movFilters.companhia}
                  onValueChange={(v) => setMovFilters({ ...movFilters, companhia: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {(companhias.data ?? []).map((k: any) => (
                      <SelectItem key={k.id} value={k.id}>
                        {k.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Responsável</Label>
                <Select
                  value={movFilters.vendedor}
                  onValueChange={(v) => setMovFilters({ ...movFilters, vendedor: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {(vendedores.data ?? []).map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Movimentações ({filteredMovs.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Destino</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Ref.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMovs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Nenhuma movimentação registada
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredMovs.map((m: any) => {
                      const dir = movDirection(m.tipo);
                      const Icon =
                        dir === "in"
                          ? ArrowDownLeft
                          : dir === "out"
                          ? ArrowUpRight
                          : ArrowLeftRight;
                      const origem =
                        contaMap[m.conta_origem_id] ?? cieMap[m.companhia_id] ?? "—";
                      const destino =
                        contaMap[m.conta_destino_id] ??
                        (m.tipo === "carregamento_companhia" ? cieMap[m.companhia_id] : null) ??
                        (m.tipo === "transferencia_lucro" ? "Fundo de lucro" : "—");
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="text-xs">{formatDateTime(m.created_at)}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center gap-1.5 ${DIR_COLOR[dir]}`}>
                              <Icon className="h-3.5 w-3.5" />
                              <span className="text-xs">{MOV_TIPO_LABEL[m.tipo]}</span>
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">{origem}</TableCell>
                          <TableCell className="text-xs">{destino}</TableCell>
                          <TableCell
                            className={`text-right tabular-nums font-medium ${DIR_COLOR[dir]}`}
                          >
                            {formatCurrency(m.valor, currency)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {vendedorMap[m.responsavel_id] ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {m.referencia ?? "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 6. Dívidas */}
        <TabsContent value="dividas" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Total em dívida</div>
                <div className="text-2xl font-bold mt-2 tabular-nums text-destructive">
                  {formatCurrency(dividas.total, currency)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Clientes devedores</div>
                <div className="text-2xl font-bold mt-2">{dividas.clientesDist}</div>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Rota</TableHead>
                    <TableHead>Emitido</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">Dias</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dividas.list.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Nenhuma dívida em aberto
                      </TableCell>
                    </TableRow>
                  ) : (
                    dividas.list.map((b: any) => {
                      const s = debtStatus(b.dias);
                      return (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium">
                            {b.cliente?.full_name ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {b.origem} → {b.destino}
                          </TableCell>
                          <TableCell className="text-xs">{formatDate(b.created_at)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(b.valor_cobrado, currency)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{b.dias}</TableCell>
                          <TableCell>
                            <Badge className={s.className} variant="outline">
                              {s.label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 7. Companhias */}
        <TabsContent value="companhias">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Companhias aéreas</CardTitle>
              <NovaCompanhiaDialog />
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Companhia</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead>Último carregamento</TableHead>
                    <TableHead>Último consumo</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(companhias.data ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Nenhuma companhia registada. Clique em "Nova companhia" para começar.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (companhias.data ?? []).map((c: any) => {
                      const baixo =
                        Number(c.alerta_minimo ?? 0) > 0 &&
                        Number(c.saldo) <= Number(c.alerta_minimo);
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.nome}</TableCell>
                          <TableCell className="text-xs uppercase text-muted-foreground">
                            {c.codigo ?? "—"}
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${
                              baixo ? "text-destructive font-semibold" : ""
                            }`}
                          >
                            {formatCurrency(c.saldo, currency)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {c.ultimo_carregamento ? formatDateTime(c.ultimo_carregamento) : "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {c.ultimo_consumo ? formatDateTime(c.ultimo_consumo) : "—"}
                          </TableCell>
                          <TableCell>
                            {baixo ? (
                              <Badge className="bg-destructive/15 text-destructive border border-destructive/40">
                                Saldo baixo
                              </Badge>
                            ) : (
                              <Badge variant="outline">OK</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ResumoCard({
  icon,
  label,
  value,
  currency,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  currency: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon} {label}
        </div>
        <div className="text-xl font-bold mt-2 tabular-nums">
          {formatCurrency(value, currency)}
        </div>
        <div className="text-xs text-muted-foreground mt-1">{hint}</div>
      </CardContent>
    </Card>
  );
}

function BreakdownCard({
  title,
  data,
  currency,
}: {
  title: string;
  data: [string, number][];
  currency: string;
}) {
  const max = Math.max(1, ...data.map((d) => d[1]));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4">Sem dados</p>
        ) : (
          data.map(([label, val]) => (
            <div key={label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate mr-2">{label}</span>
                <span className="tabular-nums font-medium">{formatCurrency(val, currency)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${(val / max) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function NovaCompanhiaDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    codigo: "",
    saldo: "0",
    alerta_minimo: "0",
  });

  const reset = () =>
    setForm({ nome: "", codigo: "", saldo: "0", alerta_minimo: "0" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) {
      toast.error("Informe o nome da companhia");
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).from("companhias_aereas").insert({
      nome: form.nome.trim(),
      codigo: form.codigo.trim() || null,
      saldo: Number(form.saldo) || 0,
      alerta_minimo: Number(form.alerta_minimo) || 0,
      ativa: true,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Companhia criada");
    qc.invalidateQueries({ queryKey: ["companhias_aereas"] });
    qc.invalidateQueries({ queryKey: ["capital-consistencia"] });
    reset();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> Nova companhia
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova companhia aérea</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label>Nome *</Label>
            <Input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="TAAG, TAP, Air France..."
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label>Código IATA</Label>
            <Input
              value={form.codigo}
              onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })}
              placeholder="DT, TP, AF"
              maxLength={4}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Saldo inicial</Label>
              <Input
                type="number"
                step="0.01"
                value={form.saldo}
                onChange={(e) => setForm({ ...form, saldo: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Alerta mínimo</Label>
              <Input
                type="number"
                step="0.01"
                value={form.alerta_minimo}
                onChange={(e) => setForm({ ...form, alerta_minimo: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "A guardar..." : "Criar companhia"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
            <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="BAI Principal, Caixa Escritório..." autoFocus />
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
            <Button type="submit" disabled={saving}>{saving ? "A guardar..." : "Criar conta"}</Button>
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
  }, [open, capitalId]);


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
    qc.invalidateQueries({ queryKey: ["movimentacoes"] });
    qc.invalidateQueries({ queryKey: ["capital-consistencia"] });
    setForm({ conta_destino_id: capitalId, valor: "", descricao: "" });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-success hover:bg-success/90 text-success-foreground">
          <ArrowDownLeft className="h-4 w-4" /> Aporte de capital
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aporte de capital</DialogTitle>
          <p className="text-sm text-muted-foreground">Entrada de dinheiro no capital circulante.</p>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label>Conta destino *</Label>
            <Select value={form.conta_destino_id} onValueChange={(v) => setForm({ ...form, conta_destino_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecionar Caixa/Banco" /></SelectTrigger>
              <SelectContent>
                {contas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.sistema ? "★ " : ""}
                    {c.nome} ({c.tipo === "caixa" ? "Caixa" : "Banco"})
                    {c.sistema ? " — Capital Circulante" : ""}
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
            <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Depósito inicial, reforço mensal..." />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "A registar..." : "Registar aporte"}</Button>
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
  }, [open, capitalId]);


  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.conta_origem_id) return toast.error("Escolha a conta origem");
    if (!form.companhia_id) return toast.error("Escolha a companhia");
    const valor = Number(form.valor);
    if (!valor || valor <= 0) return toast.error("Valor inválido");
    const conta = contas.find((c) => c.id === form.conta_origem_id);
    if (conta && Number(conta.saldo_inicial) < valor) {
      return toast.error("Saldo insuficiente na conta origem");
    }
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
    qc.invalidateQueries({ queryKey: ["movimentacoes"] });
    qc.invalidateQueries({ queryKey: ["capital-consistencia"] });
    setForm({ conta_origem_id: capitalId, companhia_id: "", valor: "", descricao: "" });
    setOpen(false);
  };


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <ArrowLeftRight className="h-4 w-4" /> Carregar companhia
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Carregar companhia aérea</DialogTitle>
          <p className="text-sm text-muted-foreground">Transfere capital da conta para o saldo pré-pago da companhia.</p>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label>Conta origem *</Label>
            <Select value={form.conta_origem_id} onValueChange={(v) => setForm({ ...form, conta_origem_id: v })}>
              <SelectTrigger><SelectValue placeholder="Caixa/Banco" /></SelectTrigger>
              <SelectContent>
                {contas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.sistema ? "★ " : ""}
                    {c.nome} — saldo {Number(c.saldo_inicial).toLocaleString()}
                    {c.sistema ? " (Capital Circulante)" : ""}
                  </SelectItem>
                ))}

              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Companhia *</Label>
            <Select value={form.companhia_id} onValueChange={(v) => setForm({ ...form, companhia_id: v })}>
              <SelectTrigger><SelectValue placeholder="Companhia" /></SelectTrigger>
              <SelectContent>
                {companhias.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Valor *</Label>
            <Input type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "A carregar..." : "Carregar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
