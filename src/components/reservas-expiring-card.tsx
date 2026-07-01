import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { ALERT_BADGE, ALERT_LABEL, alertLevel, formatTimeLeft } from "@/lib/reservas";

export function ReservasExpiringCard() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const { data: reservas = [] } = useQuery({
    queryKey: ["reservas-alertas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservas" as any)
        .select("id, pnr, companhia, origem, destino, data_limite, status, cliente:clientes(full_name)")
        .in("status", ["ativa", "expirada"])
        .order("data_limite", { ascending: true })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const urgent = reservas
    .map((r: any) => ({ r, lvl: alertLevel(r.data_limite, r.status) }))
    .filter((x) => x.lvl !== "ok")
    .slice(0, 8);

  return (
    <Card className="border-warning/40">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          Reservas prestes a expirar
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/reservas">
            Ver todas <ArrowRight className="h-3 w-3 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {urgent.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhuma reserva a expirar. Bom trabalho!
          </p>
        ) : (
          urgent.map(({ r, lvl }) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Badge className={ALERT_BADGE[lvl]} variant="outline">
                  {ALERT_LABEL[lvl]}
                </Badge>
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    <span className="font-mono text-xs mr-2">{r.pnr}</span>
                    {r.cliente?.full_name ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.origem} → {r.destino} · {r.companhia}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-semibold tabular-nums">
                  {r.status === "ativa" ? formatTimeLeft(r.data_limite) : "expirada"}
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {formatDateTime(r.data_limite)}
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
