export const CONTINENTES = [
  { value: "africa", label: "África" },
  { value: "europa", label: "Europa" },
  { value: "america", label: "América" },
  { value: "asia", label: "Ásia" },
  { value: "oceania", label: "Oceania" },
] as const;

export const CONTINENTE_LABEL: Record<string, string> = Object.fromEntries(
  CONTINENTES.map((c) => [c.value, c.label]),
);

export const MOV_TIPO_LABEL: Record<string, string> = {
  aporte_capital: "Aporte de capital",
  carregamento_companhia: "Carregamento de companhia",
  emissao_bilhete: "Emissão de bilhete",
  pagamento_cliente: "Pagamento de cliente",
  pagamento_companhia: "Pagamento a companhia",
  pagamento_taxa_mudanca: "Pagamento de taxa de mudança",
  adianto_mudanca_rota: "Adiantamento mudança de rota",
  transferencia_lucro: "Transferência para lucro",
  despesa_operacional: "Despesa operacional",
  transferencia_interna: "Transferência interna",
};

export const MOV_TIPO_OPTIONS = Object.keys(MOV_TIPO_LABEL);

export type MovDirection = "in" | "out" | "transfer" | "alert";

export function movDirection(tipo: string): MovDirection {
  if (tipo === "pagamento_cliente" || tipo === "aporte_capital" || tipo === "pagamento_taxa_mudanca") return "in";
  if (tipo === "emissao_bilhete" || tipo === "despesa_operacional" || tipo === "adianto_mudanca_rota") return "out";
  if (tipo === "transferencia_interna" || tipo === "transferencia_lucro" || tipo === "carregamento_companhia")
    return "transfer";
  return "alert";
}

export const DIR_COLOR: Record<MovDirection, string> = {
  in: "text-success",
  out: "text-destructive",
  transfer: "text-primary",
  alert: "text-warning",
};

export function debtStatus(days: number): { label: string; className: string } {
  if (days <= 7) return { label: "Normal", className: "bg-muted text-muted-foreground border" };
  if (days <= 15)
    return {
      label: "Atenção",
      className: "bg-warning/15 text-warning-foreground border border-warning/40",
    };
  return {
    label: "Crítico",
    className: "bg-destructive/15 text-destructive border border-destructive/40",
  };
}
