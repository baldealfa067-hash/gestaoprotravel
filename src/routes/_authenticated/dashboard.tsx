import { createFileRoute } from "@tanstack/react-router";
import { RequireAdmin } from "@/components/require-admin";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Ticket, TrendingUp, Wallet, Clock, CheckCircle2, Award, CalendarDays, Plane, Layers } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { ReservasExpiringCard } from "@/components/reservas-expiring-card";
import { useAgencySettings } from "@/hooks/use-agency-settings";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import { format, startOfMonth, startOfDay, subDays } from "date-fns";
import { pt } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: () => (
    <RequireAdmin>
      <Dashboard />
    </RequireAdmin>
  ),
});

function Dashboard() {
  const { data: settings } = useAgencySettings();
  const currency = settings?.currency ?? "AOA";

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const { data: bilhetes, error } = await supabase
        .from("bilhetes")
        .select("id, valor_cobrado, custo, lucro, status, vendedor_id, created_at, destino");
      if (error) throw error;
      const { data: profiles } = await supabase.from("profiles").select("id, full_name");
      return { bilhetes: bilhetes ?? [], profiles: profiles ?? [] };
    },
  });

  const bilhetes = data?.bilhetes ?? [];
  const profiles = data?.profiles ?? [];
  const today = startOfDay(new Date());
  const monthStart = startOfMonth(new Date());

  const todayTickets = bilhetes.filter((b) => new Date(b.created_at) >= today);
  const monthTickets = bilhetes.filter((b) => new Date(b.created_at) >= monthStart);
  const receitaMes = monthTickets.reduce((s, b) => s + Number(b.valor_cobrado), 0);
  const lucroMes = monthTickets.reduce((s, b) => s + Number(b.lucro), 0);
  const pendentes = bilhetes.filter((b) => b.status === "pendente" || b.status === "pedido_criado").length;
  const emitidos = bilhetes.filter((b) => b.status === "emitido").length;

  // melhor vendedor do mês
  const vendedorMap = new Map<string, { tickets: number; receita: number }>();
  for (const b of monthTickets) {
    const e = vendedorMap.get(b.vendedor_id) ?? { tickets: 0, receita: 0 };
    e.tickets += 1;
    e.receita += Number(b.valor_cobrado);
    vendedorMap.set(b.vendedor_id, e);
  }
  const best = [...vendedorMap.entries()].sort((a, b) => b[1].receita - a[1].receita)[0];
  const bestName = best ? profiles.find((p) => p.id === best[0])?.full_name ?? "—" : "—";

  // últimos 14 dias
  const series = Array.from({ length: 14 }).map((_, i) => {
    const d = subDays(today, 13 - i);
    const dayTickets = bilhetes.filter(
      (b) => format(new Date(b.created_at), "yyyy-MM-dd") === format(d, "yyyy-MM-dd"),
    );
    return {
      dia: format(d, "dd/MM", { locale: pt }),
      receita: dayTickets.reduce((s, b) => s + Number(b.valor_cobrado), 0),
      lucro: dayTickets.reduce((s, b) => s + Number(b.lucro), 0),
    };
  });

  // top destinos
  const destMap = new Map<string, number>();
  monthTickets.forEach((b) => destMap.set(b.destino, (destMap.get(b.destino) ?? 0) + 1));
  const topDest = [...destMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([destino, count]) => ({ destino, count }));

  const stats = [
    { label: "Bilhetes hoje", value: todayTickets.length, icon: Ticket, color: "text-primary" },
    { label: "Bilhetes no mês", value: monthTickets.length, icon: CalendarDays, color: "text-primary-glow" },
    { label: "Receita do mês", value: formatCurrency(receitaMes, currency), icon: Wallet, color: "text-chart-3" },
    { label: "Lucro do mês", value: formatCurrency(lucroMes, currency), icon: TrendingUp, color: "text-success" },
    { label: "Reservas pendentes", value: pendentes, icon: Clock, color: "text-warning" },
    { label: "Bilhetes emitidos", value: emitidos, icon: CheckCircle2, color: "text-success" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Resumo das vendas e desempenho da agência</p>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <Card key={s.label} className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <div className="text-xl font-bold tabular-nums">{isLoading ? "…" : s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ReservasExpiringCard />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Receita & Lucro — últimos 14 dias</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--success)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--success)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="dia" fontSize={11} />
                <YAxis fontSize={11} width={70} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v: number) => formatCurrency(v, currency)}
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
                />
                <Area type="monotone" dataKey="receita" stroke="var(--primary)" fill="url(#g1)" name="Receita" />
                <Area type="monotone" dataKey="lucro" stroke="var(--success)" fill="url(#g2)" name="Lucro" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="h-4 w-4 text-warning" /> Melhor vendedor do mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bestName}</div>
            {best && (
              <div className="mt-2 text-sm text-muted-foreground">
                {best[1].tickets} bilhetes · {formatCurrency(best[1].receita, currency)}
              </div>
            )}
            <div className="mt-6">
              <div className="text-xs font-medium text-muted-foreground mb-2">Top destinos do mês</div>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topDest}>
                    <XAxis dataKey="destino" fontSize={10} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                    <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}