export type ReservaStatus = "ativa" | "emitida" | "expirada" | "cancelada";

export const RESERVA_STATUS_LABELS: Record<ReservaStatus, string> = {
  ativa: "Ativa",
  emitida: "Emitida",
  expirada: "Expirada",
  cancelada: "Cancelada",
};

export const RESERVA_STATUS_OPTIONS: ReservaStatus[] = [
  "ativa",
  "emitida",
  "expirada",
  "cancelada",
];

export type AlertLevel = "critical" | "red" | "orange" | "yellow" | "ok";

export function alertLevel(dataLimite: string | Date, status: ReservaStatus): AlertLevel {
  if (status === "emitida" || status === "cancelada") return "ok";
  const now = Date.now();
  const t = new Date(dataLimite).getTime();
  const diff = t - now; // ms
  if (status === "expirada" || diff <= 0) return "critical";
  const h = diff / 36e5;
  if (h <= 6) return "red";
  if (h <= 24) return "orange";
  if (h <= 48) return "yellow";
  return "ok";
}

export const ALERT_BADGE: Record<AlertLevel, string> = {
  critical: "bg-destructive text-destructive-foreground border border-destructive",
  red: "bg-destructive/15 text-destructive border border-destructive/40",
  orange: "bg-warning/20 text-warning-foreground border border-warning/40",
  yellow: "bg-yellow-400/20 text-yellow-700 border border-yellow-400/40 dark:text-yellow-300",
  ok: "bg-muted text-muted-foreground border border-border",
};

export const ALERT_LABEL: Record<AlertLevel, string> = {
  critical: "EXPIRADA",
  red: "Urgente · < 6h",
  orange: "Atenção · < 24h",
  yellow: "Acompanhar · < 48h",
  ok: "No prazo",
};

export function formatTimeLeft(dataLimite: string | Date): string {
  const diff = new Date(dataLimite).getTime() - Date.now();
  if (diff <= 0) {
    const abs = Math.abs(diff);
    const h = Math.floor(abs / 36e5);
    if (h < 24) return `expirou há ${h}h`;
    return `expirou há ${Math.floor(h / 24)}d`;
  }
  const h = Math.floor(diff / 36e5);
  if (h < 1) return `${Math.floor(diff / 6e4)} min`;
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
