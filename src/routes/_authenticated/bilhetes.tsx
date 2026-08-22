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
  DialogDescription,
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
  Plus,
  Pencil,
  Search,
  MoreHorizontal,
  Send,
  Wallet,
  Ban,
  AlertTriangle,
  TrendingUp,
  Plane,
  Users,
  CheckCircle2,
  CalendarClock,
  Printer,
  Receipt,
  Route as RouteIcon,
} from "lucide-react";
import { PrintDocDialog, type PrintDocType, type PrintDocData } from "@/components/print/PrintDocDialog";
import { MudancaRotaDialog, type MudancaTarget } from "@/components/mudanca-rota-dialog";
import { toast } from "sonner";


import {
  formatCurrency,
  formatDate,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_OPTIONS,
  type TicketStatus,
} from "@/lib/format";
import { useAgencySettings } from "@/hooks/use-agency-settings";
import { CONTINENTES } from "@/lib/capital";
import { startOfMonth, startOfDay } from "date-fns";

export const Route = createFileRoute("/_authenticated/bilhetes")({
  component: BilhetesPage,
});

const schema = z.object({
  cliente_id: z.string().uuid("Cliente obrigatório"),
  companhia_id: z.string().uuid("Selecione uma companhia").optional().or(z.literal("")),
  companhia: z.string().trim().min(2, "Companhia obrigatória").max(80),
  continente_origem: z.enum(["africa", "europa", "america", "asia", "oceania"]),
  continente_destino: z.enum(["africa", "europa", "america", "asia", "oceania"]),
  classe: z.enum(["economica", "executiva"]),
  origem: z.string().trim().min(2).max(80),
  destino: z.string().trim().min(2).max(80),
  data_viagem: z.string().min(1, "Data obrigatória"),
  pnr: z.string().trim().max(20).optional().or(z.literal("")),
  custo: z.coerce.number().min(0, "Custo inválido"),
  observacoes: z.string().max(500).optional().or(z.literal("")),
});
type Form = z.infer<typeof schema>;

const STATUS_BADGE: Record<TicketStatus, string> = {
  pedido_criado: "bg-muted text-muted-foreground border",
  pendente: "bg-warning/15 text-warning-foreground border border-warning/30",
  pago: "bg-primary/15 text-primary border border-primary/30",
  emitido: "bg-success/15 text-success border border-success/30",
  cancelado: "bg-destructive/15 text-destructive border border-destructive/30",
};

function empty(): Form {
  return {
    cliente_id: "",
    companhia_id: "",
    companhia: "",
    continente_origem: "africa",
    continente_destino: "africa",
    classe: "economica",
    origem: "",
    destino: "",
    data_viagem: new Date().toISOString().slice(0, 10),
    pnr: "",
    custo: 0,
    observacoes: "",
  };
}

// mirrors public.calcular_taxa_agencia — for live preview only
function calcTaxa(
  origem: string,
  destino: string,
  classe: "economica" | "executiva",
  custo: number,
): number {
  if (!origem || !destino) return 0;
  if (origem === destino) return Math.round(Number(custo || 0) * 0.06 * 100) / 100;
  return classe === "executiva" ? 50000 : 30000;
}

function BilhetesPage() {
  const qc = useQueryClient();
  const { data: settings } = useAgencySettings();
  const currency = settings?.currency ?? "AOA";

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(empty());
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPago, setFilterPago] = useState<string>("all");
  const [filterCompanhia, setFilterCompanhia] = useState<string>("all");
  const [search, setSearch] = useState("");

  // pagamento dialog
  const [payTarget, setPayTarget] = useState<any | null>(null);
  const [payContaId, setPayContaId] = useState<string>("");
  const [payValor, setPayValor] = useState<number>(0);
  const [payJaPago, setPayJaPago] = useState<number>(0);

  // pagamento de taxa de mudança
  const [payTaxaTarget, setPayTaxaTarget] = useState<any | null>(null);
  const [payTaxaValor, setPayTaxaValor] = useState<number>(0);
  const [payTaxaJaPago, setPayTaxaJaPago] = useState<number>(0);

  // emitir dialog
  const [emitTarget, setEmitTarget] = useState<any | null>(null);

  const { data: bilhetes = [], isLoading } = useQuery({
    queryKey: ["bilhetes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bilhetes")
        .select("*, cliente:clientes(full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const vendedorIds = Array.from(
        new Set((data ?? []).map((b: any) => b.vendedor_id).filter(Boolean)),
      );
      let vendedorMap: Record<string, string> = {};
      if (vendedorIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", vendedorIds);
        vendedorMap = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.full_name]));
      }
      return (data ?? []).map((b: any) => ({
        ...b,
        vendedor: { full_name: vendedorMap[b.vendedor_id] ?? null },
      }));
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

  const { data: companhias = [] } = useQuery({
    queryKey: ["companhias-options"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("companhias_aereas")
        .select("id, nome, saldo, alerta_minimo, ativa, modo")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: contas = [] } = useQuery({
    queryKey: ["contas-options"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("contas_financeiras")
        .select("id, nome, tipo, saldo_inicial, ativa, sistema")
        .eq("ativa", true)
        .order("sistema", { ascending: false })
        .order("nome");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const capitalCirculante = useMemo(
    () => (contas as any[]).find((c) => c.sistema) ?? null,
    [contas],
  );

  const { data: pagamentosPorBilhete = {} } = useQuery({
    queryKey: ["pagamentos-por-bilhete"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("movimentacoes_capital")
        .select("bilhete_id, valor")
        .eq("tipo", "pagamento_cliente")
        .not("bilhete_id", "is", null);
      if (error) throw error;
      return (data ?? []).reduce((acc: Record<string, number>, m: any) => {
        acc[m.bilhete_id] = (acc[m.bilhete_id] ?? 0) + Number(m.valor ?? 0);
        return acc;
      }, {});
    },
    refetchInterval: 30_000,
  });

  const { data: pagamentosTaxaMudPorBilhete = {} } = useQuery({
    queryKey: ["pagamentos-taxa-mudanca-por-bilhete"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("movimentacoes_capital")
        .select("bilhete_id, valor")
        .eq("tipo", "pagamento_taxa_mudanca")
        .not("bilhete_id", "is", null);
      if (error) throw error;
      return (data ?? []).reduce((acc: Record<string, number>, m: any) => {
        acc[m.bilhete_id] = (acc[m.bilhete_id] ?? 0) + Number(m.valor ?? 0);
        return acc;
      }, {});
    },
    refetchInterval: 30_000,
  });

  const getTaxaMudInfo = (b: any) => {
    const total = Number(b.taxa_mudancas_total || 0);
    const pago = Number((pagamentosTaxaMudPorBilhete as Record<string, number>)[b.id] ?? 0);
    const restante = Math.max(0, total - pago);
    return { total, pago, restante, temTaxa: total > 0.01, aReceber: restante > 0.01 };
  };

  const getPaymentInfo = (b: any) => {
    const total = Number(b.valor_cobrado || 0);
    const pagoCliente = Number((pagamentosPorBilhete as Record<string, number>)[b.id] ?? 0);
    const pagoTaxa = Number((pagamentosTaxaMudPorBilhete as Record<string, number>)[b.id] ?? 0);
    const pago = pagoCliente + pagoTaxa;
    const restante = Math.max(0, total - pago);
    return {
      total,
      pago,
      restante,
      liquidado: restante < 0.01,
      parcial: pago > 0 && restante >= 0.01,
    };
  };

  // reservas ligadas a bilhetes (para badge "tem reserva")
  const { data: reservasBilhetes = new Set<string>() } = useQuery({
    queryKey: ["reservas-por-bilhete"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("reservas")
        .select("bilhete_id")
        .not("bilhete_id", "is", null);
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => r.bilhete_id));
    },
  });

  // estado do diálogo "criar reserva a partir do bilhete"
  const [reservaTarget, setReservaTarget] = useState<any | null>(null);
  const [mudancaTarget, setMudancaTarget] = useState<MudancaTarget | null>(null);

  // impressão
  const [printState, setPrintState] = useState<{ type: PrintDocType; data: PrintDocData } | null>(null);

  function openPrint(b: any, type: PrintDocType) {
    const numero = (b.pnr && String(b.pnr).toUpperCase()) || String(b.id).slice(0, 8).toUpperCase();
    const shared = {
      numero,
      cliente_nome: b.cliente?.full_name ?? null,
      data_emissao: new Date(),
      pnr: b.pnr ?? null,
      companhia: b.companhia ?? null,
      origem: b.origem ?? null,
      destino: b.destino ?? null,
      data_viagem: b.data_viagem ?? null,
      classe: b.classe ?? null,
      vendedor: b.vendedor?.full_name ?? null,
    };
    if (type === "bilhete") {
      setPrintState({
        type,
        data: {
          ...shared,
          custo: Number(b.custo ?? 0),
          taxa: Number(b.taxa_agencia ?? 0),
          total: Number(b.valor_cobrado ?? 0),
        },
      });
    } else {
      setPrintState({
        type,
        data: {
          ...shared,
          valor_pago: Number(b.valor_cobrado ?? 0),
          forma_pagamento: "—",
          bilhete_ref: numero,
          observacao: b.observacoes ?? null,
        },
      });
    }
  }



  // bilhetes já emitidos (para não emitir 2x)
  const { data: emitidosIds = new Set<string>() } = useQuery({
    queryKey: ["bilhetes-emitidos-mov"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("movimentacoes_capital")
        .select("bilhete_id")
        .eq("tipo", "emissao_bilhete");
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => r.bilhete_id).filter(Boolean));
    },
  });

  const companhiaMap = useMemo(
    () => Object.fromEntries(companhias.map((c: any) => [c.id, c])),
    [companhias],
  );

  const upsert = useMutation({
    mutationFn: async (values: Form) => {
      const { data: u } = await supabase.auth.getUser();
      const payload: any = {
        cliente_id: values.cliente_id,
        companhia_id: values.companhia_id || null,
        companhia: values.companhia.trim(),
        continente_origem: values.continente_origem,
        continente_destino: values.continente_destino,
        classe: values.classe,
        origem: values.origem.trim(),
        destino: values.destino.trim(),
        data_viagem: values.data_viagem,
        pnr: values.pnr || null,
        custo: values.custo,
        // valor_cobrado / taxa_agencia / lucro serão recalculados pelo trigger
        observacoes: values.observacoes || null,
      };
      if (editingId) {
        const { error } = await supabase.from("bilhetes").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        payload.status = "pedido_criado";
        payload.pago = false;
        const { error } = await supabase
          .from("bilhetes")
          .insert({ ...payload, vendedor_id: u.user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Bilhete atualizado" : "Bilhete criado — dívida registada");
      qc.invalidateQueries({ queryKey: ["bilhetes"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["capital-consistencia"] });
      setOpen(false);
      setEditingId(null);
      setForm(empty());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const emitir = useMutation({
    mutationFn: async (b: any) => {
      if (!b.companhia_id) {
        throw new Error("Bilhete sem companhia — edite e selecione a companhia.");
      }
      if (b.status === "emitido") {
        throw new Error("Este bilhete já foi emitido.");
      }
      // O trigger `trg_bilhete_debita_companhia` cria o movimento e desconta o saldo da companhia.
      const { error } = await supabase
        .from("bilhetes")
        .update({ status: "emitido" })
        .eq("id", b.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bilhete emitido — companhia debitada");
      qc.invalidateQueries({ queryKey: ["bilhetes"] });
      qc.invalidateQueries({ queryKey: ["bilhetes-emitidos-mov"] });
      qc.invalidateQueries({ queryKey: ["companhias-options"] });
      qc.invalidateQueries({ queryKey: ["capital-consistencia"] });
      qc.invalidateQueries({ queryKey: ["movimentacoes"] });
      qc.invalidateQueries({ queryKey: ["reservas"] });
      qc.invalidateQueries({ queryKey: ["reservas-por-bilhete"] });
      qc.invalidateQueries({ queryKey: ["reservas-expiring"] });
      setEmitTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const registarPagamento = useMutation({
    mutationFn: async ({ b, contaId, valor }: { b: any; contaId: string; valor: number }) => {
      if (!contaId) throw new Error("Selecione a conta destino");
      if (!valor || valor <= 0) throw new Error("Informe um valor de pagamento válido");
      const total = Number(b.valor_cobrado || 0);
      // buscar quanto já foi pago para validar
      const { data: pagosMovs } = await (supabase as any)
        .from("movimentacoes_capital")
        .select("valor")
        .eq("tipo", "pagamento_cliente")
        .eq("bilhete_id", b.id);
      const jaPago = (pagosMovs ?? []).reduce((s: number, m: any) => s + Number(m.valor), 0);
      const restante = Math.max(0, total - jaPago);
      if (valor > restante + 0.01) {
        throw new Error(`Valor superior ao restante (${restante.toFixed(2)})`);
      }
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("movimentacoes_capital").insert({
        tipo: "pagamento_cliente",
        conta_destino_id: contaId,
        cliente_id: b.cliente_id,
        bilhete_id: b.id,
        valor,
        referencia: b.pnr || null,
        observacao:
          valor + 0.01 >= restante
            ? `Pagamento total bilhete ${b.origem}→${b.destino}`
            : `Pagamento parcial bilhete ${b.origem}→${b.destino}`,
        responsavel_id: u.user!.id,
      });
      if (error) throw error;
      // se com este pagamento cobriu tudo e ainda não estava emitido → status "pago"
      if (jaPago + valor + 0.01 >= total && b.status !== "emitido") {
        await supabase.from("bilhetes").update({ status: "pago" }).eq("id", b.id);
      }
    },
    onSuccess: () => {
      toast.success("Pagamento registado");
      qc.invalidateQueries({ queryKey: ["bilhetes"] });
      qc.invalidateQueries({ queryKey: ["contas-options"] });
      qc.invalidateQueries({ queryKey: ["capital-consistencia"] });
      qc.invalidateQueries({ queryKey: ["capital-dividas-lista"] });
      qc.invalidateQueries({ queryKey: ["movimentacoes"] });
      qc.invalidateQueries({ queryKey: ["pagamentos-por-bilhete"] });
      setPayTarget(null);
      setPayContaId("");
      setPayValor(0);
      setPayJaPago(0);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const registarPagamentoTaxaMud = useMutation({
    mutationFn: async ({ b, valor }: { b: any; valor: number }) => {
      if (!valor || valor <= 0) throw new Error("Informe um valor válido");
      const totalTaxa = Number(b.taxa_mudancas_total || 0);
      const { data: pagosMovs } = await (supabase as any)
        .from("movimentacoes_capital")
        .select("valor")
        .eq("tipo", "pagamento_taxa_mudanca")
        .eq("bilhete_id", b.id);
      const jaPago = (pagosMovs ?? []).reduce((s: number, m: any) => s + Number(m.valor), 0);
      const restante = Math.max(0, totalTaxa - jaPago);
      if (valor > restante + 0.01) {
        throw new Error(`Valor superior ao restante da taxa (${restante.toFixed(2)})`);
      }
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("movimentacoes_capital").insert({
        tipo: "pagamento_taxa_mudanca",
        cliente_id: b.cliente_id,
        bilhete_id: b.id,
        valor,
        referencia: b.pnr || null,
        observacao:
          valor + 0.01 >= restante
            ? `Pagamento total da taxa de mudança`
            : `Pagamento parcial da taxa de mudança`,
        responsavel_id: u.user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Taxa de mudança paga — valor enviado ao Fundo de Lucro");
      qc.invalidateQueries({ queryKey: ["bilhetes"] });
      qc.invalidateQueries({ queryKey: ["capital-consistencia"] });
      qc.invalidateQueries({ queryKey: ["capital-dividas-lista"] });
      qc.invalidateQueries({ queryKey: ["movimentacoes"] });
      qc.invalidateQueries({ queryKey: ["pagamentos-taxa-mudanca-por-bilhete"] });
      qc.invalidateQueries({ queryKey: ["pagamentos-por-bilhete"] });
      setPayTaxaTarget(null);
      setPayTaxaValor(0);
      setPayTaxaJaPago(0);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("bilhetes")
        .update({ status: "cancelado" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bilhete cancelado");
      qc.invalidateQueries({ queryKey: ["bilhetes"] });
      qc.invalidateQueries({ queryKey: ["capital-consistencia"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // live preview de taxa e valor cobrado
  const taxaPreview = useMemo(
    () =>
      calcTaxa(form.continente_origem, form.continente_destino, form.classe, Number(form.custo || 0)),
    [form.continente_origem, form.continente_destino, form.classe, form.custo],
  );
  const valorPreview = Number(form.custo || 0) + taxaPreview;
  const companhiaSel = companhiaMap[form.companhia_id || ""];
  const companhiaAlerta =
    companhiaSel && Number(companhiaSel.saldo) - Number(form.custo || 0) < Number(companhiaSel.alerta_minimo || 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = schema.safeParse(form);
    if (!p.success) {
      toast.error(p.error.errors[0].message);
      return;
    }
    upsert.mutate(p.data);
  };

  // resumos
  const kpis = useMemo(() => {
    const list = bilhetes.filter((b: any) => b.status !== "cancelado");
    const mesInicio = startOfMonth(new Date()).getTime();
    const hojeInicio = startOfDay(new Date()).getTime();
    const hoje = list.filter((b: any) => new Date(b.created_at).getTime() >= hojeInicio);
    const mes = list.filter((b: any) => new Date(b.created_at).getTime() >= mesInicio);
    const receitaMes = mes.reduce((s: number, b: any) => s + Number(b.taxa_agencia || 0), 0);
    const dividaPend = list
      .filter((b: any) => ["emitido", "pendente", "pedido_criado", "pago"].includes(b.status))
      .reduce((s: number, b: any) => s + getPaymentInfo(b).restante, 0);
    const aEmitir = list.filter(
      (b: any) => b.status === "pedido_criado" || b.status === "pendente",
    ).length;
    const totalGeral = list.reduce(
      (s: number, b: any) =>
        s + Number(b.custo || 0) + Number(b.taxa_agencia || 0) + Number(b.taxa_mudancas_total || 0),
      0,
    );
    const lucroTotal = list.reduce((s: number, b: any) => s + Number(b.taxa_agencia || 0), 0);
    return { totalHoje: hoje.length, totalMes: mes.length, receitaMes, dividaPend, aEmitir, totalGeral, lucroTotal };

  }, [bilhetes, pagamentosPorBilhete]);

  const filtered = bilhetes.filter((b: any) => {
    if (filterStatus !== "all" && b.status !== filterStatus) return false;
    const paymentInfo = getPaymentInfo(b);
    if (filterPago === "pago" && !paymentInfo.liquidado) return false;
    if (filterPago === "devendo" && paymentInfo.liquidado) return false;
    if (filterCompanhia !== "all" && b.companhia_id !== filterCompanhia) return false;
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
          <p className="text-muted-foreground text-sm">
            Centro operacional — taxa, emissão, dívida e capital automáticos
          </p>
        </div>
        <Dialog
          open={open && !!editingId}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) {
              setEditingId(null);
              setForm(empty());
            }
          }}
        >
          <Button variant="outline" disabled title="Bilhetes agora são emitidos a partir de uma reserva">
            <Plus className="h-4 w-4 mr-2" /> Novo bilhete → via Reservas
          </Button>

          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar bilhete" : "Nova venda de bilhete"}</DialogTitle>
              <DialogDescription>
                A taxa da agência e o valor cobrado são calculados automaticamente.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Cliente *</Label>
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
                  <Label>Companhia aérea *</Label>
                  <Select
                    value={form.companhia_id || ""}
                    onValueChange={(v) => {
                      const c = companhiaMap[v];
                      setForm({
                        ...form,
                        companhia_id: v,
                        companhia: c?.nome ?? form.companhia,
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar companhia" />
                    </SelectTrigger>
                    <SelectContent>
                      {companhias
                        .filter((c: any) => c.ativa)
                        .map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}
                            {c.modo === "credito"
                              ? " — [Crédito / intermediária]"
                              : ` — saldo: ${formatCurrency(c.saldo, currency)}`}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {companhias.length === 0 && (
                    <p className="text-xs text-warning">
                      Nenhuma companhia cadastrada. Adicione em Capital.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Continente origem *</Label>
                  <Select
                    value={form.continente_origem}
                    onValueChange={(v) =>
                      setForm({ ...form, continente_origem: v as Form["continente_origem"] })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTINENTES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Continente destino *</Label>
                  <Select
                    value={form.continente_destino}
                    onValueChange={(v) =>
                      setForm({ ...form, continente_destino: v as Form["continente_destino"] })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTINENTES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Classe *</Label>
                  <Select
                    value={form.classe}
                    onValueChange={(v) => setForm({ ...form, classe: v as "economica" | "executiva" })}
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
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Aeroporto origem *</Label>
                  <Input
                    value={form.origem}
                    placeholder="LAD"
                    onChange={(e) => setForm({ ...form, origem: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Aeroporto destino *</Label>
                  <Input
                    value={form.destino}
                    placeholder="LIS"
                    onChange={(e) => setForm({ ...form, destino: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data da viagem *</Label>
                  <Input
                    type="date"
                    value={form.data_viagem}
                    onChange={(e) => setForm({ ...form, data_viagem: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>PNR</Label>
                  <Input
                    value={form.pnr}
                    onChange={(e) => setForm({ ...form, pnr: e.target.value })}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Custo do bilhete (pago à companhia) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.custo}
                    onChange={(e) => setForm({ ...form, custo: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Cálculo automático
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs">Custo</div>
                    <div className="font-semibold tabular-nums">
                      {formatCurrency(form.custo, currency)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">
                      Taxa da agência{" "}
                      {form.continente_origem === form.continente_destino
                        ? "(6%)"
                        : `(${form.classe === "executiva" ? "50.000" : "30.000"} fixo)`}
                    </div>
                    <div className="font-semibold tabular-nums text-primary">
                      {formatCurrency(taxaPreview, currency)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Valor a cobrar ao cliente</div>
                    <div className="font-bold tabular-nums text-success">
                      {formatCurrency(valorPreview, currency)}
                    </div>
                  </div>
                </div>
                {companhiaSel && (
                  <div
                    className={`text-xs mt-2 flex items-center gap-1.5 ${
                      companhiaAlerta ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {companhiaAlerta && <AlertTriangle className="h-3.5 w-3.5" />}
                    Saldo {companhiaSel.nome}: {formatCurrency(companhiaSel.saldo, currency)}
                    {companhiaAlerta && " — abaixo do mínimo após emissão"}
                  </div>
                )}
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
                  {editingId ? "Guardar alterações" : "Criar bilhete"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard
          label="Total geral (vendas)"
          value={formatCurrency(kpis.totalGeral, currency)}
          icon={<TrendingUp className="h-4 w-4" />}
          accent="muted"
        />
        <KpiCard
          label="Lucro (taxas)"
          value={formatCurrency(kpis.lucroTotal, currency)}
          icon={<TrendingUp className="h-4 w-4" />}
          accent="success"
        />
        <KpiCard
          label="Dívida pendente"
          value={formatCurrency(kpis.dividaPend, currency)}
          icon={<Users className="h-4 w-4" />}
          accent="warning"
        />
        <KpiCard
          label="A emitir"
          value={String(kpis.aEmitir)}
          icon={<Send className="h-4 w-4" />}
          accent={kpis.aEmitir > 0 ? "warning" : "muted"}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <KpiCard label="Hoje" value={String(kpis.totalHoje)} icon={<Plane className="h-4 w-4" />} />
        <KpiCard label="Este mês" value={String(kpis.totalMes)} icon={<Plane className="h-4 w-4" />} />
        <KpiCard
          label="Lucro do mês"
          value={formatCurrency(kpis.receitaMes, currency)}
          icon={<TrendingUp className="h-4 w-4" />}
          accent="success"
        />
      </div>


      <Card>
        <CardHeader className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Pesquisar cliente, rota, companhia ou PNR…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full md:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os estados</SelectItem>
              {TICKET_STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {TICKET_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterPago} onValueChange={setFilterPago}>
            <SelectTrigger className="w-full md:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Pago e devendo</SelectItem>
              <SelectItem value="pago">Só pagos</SelectItem>
              <SelectItem value="devendo">Só devendo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCompanhia} onValueChange={setFilterCompanhia}>
            <SelectTrigger className="w-full md:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas companhias</SelectItem>
              {companhias.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
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
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">Taxa</TableHead>
                <TableHead className="text-right">Cobrado</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Pago</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8">
                    A carregar…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                    Sem bilhetes
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((b: any) => {
                const jaEmitido = emitidosIds.has(b.id) || b.status === "emitido";
                const cancelado = b.status === "cancelado";
                const paymentInfo = getPaymentInfo(b);
                const taxaMudInfo = getTaxaMudInfo(b);
                return (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.cliente?.full_name ?? "—"}</TableCell>
                    <TableCell>
                      {b.origem} → {b.destino}
                    </TableCell>
                    <TableCell>{b.companhia}</TableCell>
                    <TableCell>{formatDate(b.data_viagem)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      <div className="flex items-center gap-1.5">
                        <span>{b.pnr ?? "—"}</span>
                        {reservasBilhetes.has(b.id) && (
                          <Badge
                            variant="outline"
                            className="h-4 px-1 text-[10px] bg-primary/10 text-primary border-primary/30"
                          >
                            reserva
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(b.custo, currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-primary">
                      {formatCurrency(b.taxa_agencia, currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {formatCurrency(b.valor_cobrado, currency)}
                      {Number(b.taxa_mudancas_total ?? 0) > 0 && (
                        <div className="text-[10px] font-normal text-warning">
                          + {formatCurrency(b.taxa_mudancas_total, currency)} mudanças
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_BADGE[b.status as TicketStatus]} variant="outline">
                        {TICKET_STATUS_LABELS[b.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {paymentInfo.liquidado ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success">
                          <CheckCircle2 className="h-3 w-3" /> Pago total
                        </span>
                      ) : paymentInfo.parcial ? (
                        <span className="inline-flex flex-col gap-0.5 text-xs text-warning">
                          <span className="inline-flex items-center gap-1 font-medium">
                            <AlertTriangle className="h-3 w-3" /> Parcial
                          </span>
                          <span className="tabular-nums">
                            Falta {formatCurrency(paymentInfo.restante, currency)}
                          </span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-destructive">
                          <AlertTriangle className="h-3 w-3" /> Ainda deve
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          {!jaEmitido && !cancelado && (
                            <DropdownMenuItem onClick={() => setEmitTarget(b)}>
                              <Send className="h-4 w-4 mr-2" /> Emitir (debita companhia)
                            </DropdownMenuItem>
                          )}
                          {!paymentInfo.liquidado && !cancelado && (
                            <DropdownMenuItem
                              onClick={async () => {
                                const { data: movs } = await (supabase as any)
                                  .from("movimentacoes_capital")
                                  .select("valor")
                                  .eq("tipo", "pagamento_cliente")
                                  .eq("bilhete_id", b.id);
                                const jaPago = (movs ?? []).reduce(
                                  (s: number, m: any) => s + Number(m.valor),
                                  0,
                                );
                                const restante = Math.max(
                                  0,
                                  Number(b.valor_cobrado || 0) - jaPago,
                                );
                                setPayTarget(b);
                                setPayContaId(capitalCirculante?.id ?? "");
                                setPayJaPago(jaPago);
                                setPayValor(restante);
                              }}
                            >
                              <Wallet className="h-4 w-4 mr-2" /> Registar pagamento
                            </DropdownMenuItem>
                          )}
                          {!cancelado && !reservasBilhetes.has(b.id) && (
                            <DropdownMenuItem onClick={() => setReservaTarget(b)}>
                              <CalendarClock className="h-4 w-4 mr-2" /> Criar reserva
                            </DropdownMenuItem>
                          )}
                          {!cancelado && (
                            <DropdownMenuItem
                              onClick={() =>
                                setMudancaTarget({
                                  type: "bilhete",
                                  row: {
                                    id: b.id,
                                    cliente_id: b.cliente_id,
                                    origem: b.origem,
                                    destino: b.destino,
                                    classe: b.classe,
                                    data_viagem: b.data_viagem,
                                    cliente: b.cliente,
                                  },
                                })
                              }
                            >
                              <RouteIcon className="h-4 w-4 mr-2" /> Registar mudança de rota
                            </DropdownMenuItem>
                          )}

                          {!cancelado && taxaMudInfo.aReceber && (
                            <DropdownMenuItem
                              onClick={async () => {
                                const { data: movs } = await (supabase as any)
                                  .from("movimentacoes_capital")
                                  .select("valor")
                                  .eq("tipo", "pagamento_taxa_mudanca")
                                  .eq("bilhete_id", b.id);
                                const jaPago = (movs ?? []).reduce(
                                  (s: number, m: any) => s + Number(m.valor),
                                  0,
                                );
                                const restante = Math.max(
                                  0,
                                  Number(b.taxa_mudancas_total || 0) - jaPago,
                                );
                                setPayTaxaTarget(b);
                                setPayTaxaJaPago(jaPago);
                                setPayTaxaValor(restante);
                              }}
                            >
                              <RouteIcon className="h-4 w-4 mr-2" /> Pagar taxa de mudança
                            </DropdownMenuItem>
                          )}

                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openPrint(b, "bilhete")}>
                            <Printer className="h-4 w-4 mr-2" /> Imprimir bilhete
                          </DropdownMenuItem>
                          {paymentInfo.liquidado && (
                            <DropdownMenuItem onClick={() => openPrint(b, "recibo")}>
                              <Receipt className="h-4 w-4 mr-2" /> Recibo de pagamento
                            </DropdownMenuItem>
                          )}


                          <DropdownMenuItem
                            onClick={() => {
                              setEditingId(b.id);
                              setForm({
                                cliente_id: b.cliente_id,
                                companhia_id: b.companhia_id ?? "",
                                companhia: b.companhia,
                                continente_origem: b.continente_origem ?? "africa",
                                continente_destino: b.continente_destino ?? "africa",
                                classe: b.classe ?? "economica",
                                origem: b.origem,
                                destino: b.destino,
                                data_viagem: b.data_viagem,
                                pnr: b.pnr ?? "",
                                custo: Number(b.custo),
                                observacoes: b.observacoes ?? "",
                              });
                              setOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4 mr-2" /> Editar
                          </DropdownMenuItem>
                          {!cancelado && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setCancelTarget(b)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Ban className="h-4 w-4 mr-2" /> Cancelar bilhete
                              </DropdownMenuItem>
                            </>
                          )}
                          {cancelado && isAdmin && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeleteTarget(b)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Eliminar bilhete
                              </DropdownMenuItem>
                            </>
                          )}

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

      {/* Emitir */}
      <Dialog open={!!emitTarget} onOpenChange={(o) => !o && setEmitTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Emitir bilhete</DialogTitle>
            <DialogDescription>
              Esta ação debita o custo do saldo da companhia e marca o bilhete como emitido.
            </DialogDescription>
          </DialogHeader>
          {emitTarget && (
            <div className="space-y-3 text-sm">
              <Row label="Cliente" value={emitTarget.cliente?.full_name ?? "—"} />
              <Row label="Rota" value={`${emitTarget.origem} → ${emitTarget.destino}`} />
              <Row label="Companhia" value={emitTarget.companhia} />
              <Row label="Custo (debitado)" value={formatCurrency(emitTarget.custo, currency)} />
              {emitTarget.companhia_id && companhiaMap[emitTarget.companhia_id] && (
                <div className="rounded-md border bg-muted/40 p-3 text-xs">
                  Saldo atual da companhia:{" "}
                  <b>{formatCurrency(companhiaMap[emitTarget.companhia_id].saldo, currency)}</b>
                  <br />
                  Após emissão:{" "}
                  <b
                    className={
                      Number(companhiaMap[emitTarget.companhia_id].saldo) -
                        Number(emitTarget.custo) <
                      0
                        ? "text-destructive"
                        : ""
                    }
                  >
                    {formatCurrency(
                      Number(companhiaMap[emitTarget.companhia_id].saldo) -
                        Number(emitTarget.custo),
                      currency,
                    )}
                  </b>
                </div>
              )}
              {!emitTarget.companhia_id && (
                <div className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Bilhete sem companhia associada — edite antes de emitir.
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmitTarget(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => emitTarget && emitir.mutate(emitTarget)}
              disabled={emitir.isPending || !emitTarget?.companhia_id}
            >
              Confirmar emissão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pagamento */}
      <Dialog
        open={!!payTarget}
        onOpenChange={(o) => {
          if (!o) {
            setPayTarget(null);
            setPayContaId("");
            setPayValor(0);
            setPayJaPago(0);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registar pagamento</DialogTitle>
            <DialogDescription>
              Aceita pagamento total ou parcial. O bilhete só fica marcado como pago quando o
              acumulado atinge o valor cobrado.
            </DialogDescription>
          </DialogHeader>
          {payTarget && (() => {
            const total = Number(payTarget.valor_cobrado || 0);
            const restante = Math.max(0, total - payJaPago);
            const cobreTudo = payValor + 0.01 >= restante && payValor > 0;
            return (
              <div className="space-y-3 text-sm">
                <Row label="Cliente" value={payTarget.cliente?.full_name ?? "—"} />
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-md border p-2">
                    <div className="text-muted-foreground">Total</div>
                    <div className="font-semibold tabular-nums">{formatCurrency(total, currency)}</div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-muted-foreground">Já pago</div>
                    <div className="font-semibold tabular-nums text-success">{formatCurrency(payJaPago, currency)}</div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-muted-foreground">Restante</div>
                    <div className="font-semibold tabular-nums text-warning">{formatCurrency(restante, currency)}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Valor a receber agora *</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={restante}
                      step="0.01"
                      value={payValor}
                      onChange={(e) => setPayValor(Number(e.target.value))}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => setPayValor(restante)}>
                      Total
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setPayValor(Math.round(restante / 2))}>
                      ½
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {cobreTudo
                      ? "Este pagamento liquida a dívida por completo."
                      : `Após este pagamento restarão ${formatCurrency(restante - payValor, currency)}.`}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Conta que recebe o custo *</Label>
                  <Select value={payContaId} onValueChange={setPayContaId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolher conta" />
                    </SelectTrigger>
                    <SelectContent>
                      {contas.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.sistema ? "★ " : ""}
                          {c.tipo === "caixa" ? "Caixa" : "Banco"} — {c.nome}
                          {c.sistema ? " (Capital Circulante)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    A parte referente à taxa da agência vai automaticamente para o Fundo de Lucro (proporcional).
                  </p>
                </div>
              </div>
            );
          })()}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPayTarget(null);
                setPayContaId("");
                setPayValor(0);
                setPayJaPago(0);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() =>
                payTarget &&
                registarPagamento.mutate({ b: payTarget, contaId: payContaId, valor: payValor })
              }
              disabled={registarPagamento.isPending || !payContaId || !payValor || payValor <= 0}
            >
              Confirmar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <NovaReservaDoBilheteDialog
        bilhete={reservaTarget}
        onClose={() => setReservaTarget(null)}
        onSaved={() => {
          setReservaTarget(null);
          qc.invalidateQueries({ queryKey: ["reservas-por-bilhete"] });
          qc.invalidateQueries({ queryKey: ["reservas"] });
        }}
      />

      <PrintDocDialog
        open={!!printState}
        onClose={() => setPrintState(null)}
        type={printState?.type ?? "bilhete"}
        data={printState?.data ?? null}
      />

      <MudancaRotaDialog target={mudancaTarget} onClose={() => setMudancaTarget(null)} />

      {/* Pagamento de taxa de mudança */}
      <Dialog
        open={!!payTaxaTarget}
        onOpenChange={(o) => {
          if (!o) {
            setPayTaxaTarget(null);
            setPayTaxaValor(0);
            setPayTaxaJaPago(0);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pagar taxa de mudança</DialogTitle>
            <DialogDescription>
              O valor recebido vai <b>100% para o Fundo de Lucro</b>. Aceita pagamento total ou parcial.
            </DialogDescription>
          </DialogHeader>
          {payTaxaTarget && (() => {
            const total = Number(payTaxaTarget.taxa_mudancas_total || 0);
            const restante = Math.max(0, total - payTaxaJaPago);
            const cobreTudo = payTaxaValor + 0.01 >= restante && payTaxaValor > 0;
            return (
              <div className="space-y-3 text-sm">
                <Row label="Cliente" value={payTaxaTarget.cliente?.full_name ?? "—"} />
                <Row label="Bilhete" value={`${payTaxaTarget.origem} → ${payTaxaTarget.destino}`} />
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-md border p-2">
                    <div className="text-muted-foreground">Total taxas</div>
                    <div className="font-semibold tabular-nums">{formatCurrency(total, currency)}</div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-muted-foreground">Já pago</div>
                    <div className="font-semibold tabular-nums text-success">{formatCurrency(payTaxaJaPago, currency)}</div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-muted-foreground">Restante</div>
                    <div className="font-semibold tabular-nums text-warning">{formatCurrency(restante, currency)}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Valor a receber agora *</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={restante}
                      step="0.01"
                      value={payTaxaValor}
                      onChange={(e) => setPayTaxaValor(Number(e.target.value))}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => setPayTaxaValor(restante)}>
                      Total
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setPayTaxaValor(Math.round(restante / 2))}>
                      ½
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {cobreTudo
                      ? "Este pagamento liquida a taxa de mudança por completo."
                      : `Após este pagamento restarão ${formatCurrency(restante - payTaxaValor, currency)} de taxa.`}
                  </p>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPayTaxaTarget(null);
                setPayTaxaValor(0);
                setPayTaxaJaPago(0);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() =>
                payTaxaTarget &&
                registarPagamentoTaxaMud.mutate({ b: payTaxaTarget, valor: payTaxaValor })
              }
              disabled={registarPagamentoTaxaMud.isPending || !payTaxaValor || payTaxaValor <= 0}
            >
              Confirmar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NovaReservaDoBilheteDialog({
  bilhete,
  onClose,
  onSaved,
}: {
  bilhete: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pnr, setPnr] = useState("");
  const [dataLimite, setDataLimite] = useState("");
  const [saving, setSaving] = useState(false);

  const open = !!bilhete;

  // reset ao abrir
  useEffect(() => {
    if (bilhete) {
      setPnr(bilhete.pnr ?? "");
      const d = new Date(Date.now() + 48 * 36e5);
      d.setSeconds(0, 0);
      const pad = (n: number) => String(n).padStart(2, "0");
      setDataLimite(
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
      );
    }
  }, [bilhete]);


  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bilhete) return;
    if (!pnr.trim()) return toast.error("PNR obrigatório");
    if (!dataLimite) return toast.error("Prazo limite obrigatório");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("reservas").insert({
      cliente_id: bilhete.cliente_id,
      bilhete_id: bilhete.id,
      pnr: pnr.trim().toUpperCase(),
      companhia: bilhete.companhia,
      origem: bilhete.origem,
      destino: bilhete.destino,
      classe: bilhete.classe ?? "economica",
      continente_origem: bilhete.continente_origem ?? null,
      continente_destino: bilhete.continente_destino ?? null,
      data_viagem: bilhete.data_viagem,
      data_limite: new Date(dataLimite).toISOString(),
      status: "ativa",
      observacoes: bilhete.observacoes ?? null,
      user_id: u.user!.id,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Reserva criada");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar reserva a partir do bilhete</DialogTitle>
          <DialogDescription>
            Herda cliente, rota, companhia e data. Falta preencher PNR e prazo limite.
          </DialogDescription>
        </DialogHeader>
        {bilhete && (
          <form onSubmit={submit} className="space-y-3 text-sm">
            <Row label="Cliente" value={bilhete.cliente?.full_name ?? "—"} />
            <Row label="Rota" value={`${bilhete.origem} → ${bilhete.destino}`} />
            <Row label="Companhia" value={bilhete.companhia} />
            <div className="space-y-1">
              <Label>PNR *</Label>
              <Input
                className="font-mono uppercase"
                value={pnr}
                onChange={(e) => setPnr(e.target.value)}
                placeholder="Ex: ABC123"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label className="text-destructive font-semibold">Prazo limite *</Label>
              <Input
                type="datetime-local"
                value={dataLimite}
                onChange={(e) => setDataLimite(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Prazo padrão sugerido: 48h a partir de agora.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "A criar..." : "Criar reserva"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}


function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  accent = "muted",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: "muted" | "success" | "warning";
}) {
  const color =
    accent === "success"
      ? "text-success"
      : accent === "warning"
        ? "text-warning-foreground"
        : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon} {label}
        </div>
        <div className={`text-xl font-bold mt-2 tabular-nums ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
