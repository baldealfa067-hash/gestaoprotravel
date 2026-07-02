import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { alertLevel, type AlertLevel } from "@/lib/reservas";
import { toast } from "sonner";

function playBeep(pattern: "warn" | "critical") {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const beeps = pattern === "critical"
      ? [{ f: 880, t: 0 }, { f: 880, t: 0.25 }, { f: 1100, t: 0.5 }, { f: 1100, t: 0.75 }]
      : [{ f: 660, t: 0 }, { f: 880, t: 0.2 }];
    for (const b of beeps) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = b.f;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + b.t);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + b.t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + b.t + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + b.t);
      osc.stop(ctx.currentTime + b.t + 0.2);
    }
    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch {
    // ignore
  }
}

export function useReservasAlarm() {
  // seen[id] = last alert level we alarmed on
  const seenRef = useRef<Map<string, AlertLevel>>(new Map());
  const armedRef = useRef(false);

  useEffect(() => {
    const arm = () => { armedRef.current = true; window.removeEventListener("click", arm); window.removeEventListener("keydown", arm); };
    window.addEventListener("click", arm);
    window.addEventListener("keydown", arm);
    return () => { window.removeEventListener("click", arm); window.removeEventListener("keydown", arm); };
  }, []);

  const { data: reservas = [] } = useQuery({
    queryKey: ["reservas-alarm"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservas" as any)
        .select("id, pnr, origem, destino, data_limite, status")
        .in("status", ["ativa", "expirada"]);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!reservas.length) return;
    const seen = seenRef.current;
    let firstRun = seen.size === 0;

    for (const r of reservas) {
      const lvl = alertLevel(r.data_limite, r.status);
      const prev = seen.get(r.id);

      // Only alarm on escalation into an alert level
      const escalated =
        (lvl === "critical" && prev !== "critical") ||
        (lvl === "red" && prev !== "red" && prev !== "critical") ||
        (lvl === "orange" && prev !== "orange" && prev !== "red" && prev !== "critical");

      seen.set(r.id, lvl);

      if (firstRun) continue; // don't spam on first mount
      if (!escalated) continue;

      const label =
        lvl === "critical" ? `Reserva ${r.pnr} EXPIROU`
        : lvl === "red" ? `Reserva ${r.pnr} expira em menos de 6h`
        : `Reserva ${r.pnr} expira em menos de 24h`;

      toast.warning(label, {
        description: `${r.origem} → ${r.destino}`,
        duration: 10_000,
      });

      if (armedRef.current) {
        playBeep(lvl === "critical" || lvl === "red" ? "critical" : "warn");
      }
    }

    // Periodic re-check for time-based escalation without data changes
  }, [reservas]);

  // Re-evaluate every minute against latest cache too
  useEffect(() => {
    const id = setInterval(() => {
      const seen = seenRef.current;
      for (const r of reservas) {
        const lvl = alertLevel(r.data_limite, r.status);
        const prev = seen.get(r.id);
        const escalated =
          (lvl === "critical" && prev !== "critical") ||
          (lvl === "red" && prev !== "red" && prev !== "critical") ||
          (lvl === "orange" && prev !== "orange" && prev !== "red" && prev !== "critical");
        seen.set(r.id, lvl);
        if (!escalated) continue;
        const label =
          lvl === "critical" ? `Reserva ${r.pnr} EXPIROU`
          : lvl === "red" ? `Reserva ${r.pnr} expira em menos de 6h`
          : `Reserva ${r.pnr} expira em menos de 24h`;
        toast.warning(label, { description: `${r.origem} → ${r.destino}`, duration: 10_000 });
        if (armedRef.current) playBeep(lvl === "critical" || lvl === "red" ? "critical" : "warn");
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [reservas]);
}
