import { format } from "date-fns";
import { pt } from "date-fns/locale";

export function formatCurrency(value: number | string | null | undefined, currency = "AOA") {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  try {
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export function formatDate(d: string | Date | null | undefined, fmt = "dd/MM/yyyy") {
  if (!d) return "—";
  return format(new Date(d), fmt, { locale: pt });
}

export function formatDateTime(d: string | Date | null | undefined) {
  return formatDate(d, "dd/MM/yyyy HH:mm");
}

export const TICKET_STATUS_LABELS: Record<string, string> = {
  pedido_criado: "Pedido criado",
  pendente: "Pendente",
  pago: "Pago",
  emitido: "Emitido",
  cancelado: "Cancelado",
};

export const TICKET_STATUS_OPTIONS = [
  "pedido_criado",
  "pendente",
  "pago",
  "emitido",
  "cancelado",
] as const;

export type TicketStatus = (typeof TICKET_STATUS_OPTIONS)[number];