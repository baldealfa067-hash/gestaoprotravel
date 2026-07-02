import { useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Download, X } from "lucide-react";
import { useAgencySettings } from "@/hooks/use-agency-settings";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { toast } from "sonner";

export type PrintDocType = "bilhete" | "recibo";

export interface PrintDocData {
  numero: string;
  cliente_nome?: string | null;
  data_emissao?: string | Date | null;
  // Bilhete fields
  pnr?: string | null;
  companhia?: string | null;
  origem?: string | null;
  destino?: string | null;
  data_viagem?: string | Date | null;
  classe?: string | null;
  custo?: number | null;
  taxa?: number | null;
  total?: number | null;
  vendedor?: string | null;
  // Recibo fields
  valor_pago?: number | null;
  forma_pagamento?: string | null;
  bilhete_ref?: string | null;
  observacao?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  type: PrintDocType;
  data: PrintDocData | null;
}

export function PrintDocDialog({ open, onClose, type, data }: Props) {
  const { data: settings } = useAgencySettings();
  const currency = settings?.currency ?? "AOA";
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) document.body.classList.add("print-mode-active");
    else document.body.classList.remove("print-mode-active");
    return () => document.body.classList.remove("print-mode-active");
  }, [open]);

  if (!data) return null;

  const title = type === "bilhete" ? "Bilhete" : "Recibo de Pagamento";

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!printRef.current) return;
    try {
      // dynamic import — keeps bundle lean
      const mod: any = await import("html2pdf.js");
      const html2pdf = mod.default ?? mod;
      await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename: `${title}-${data.numero}.pdf`,
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(printRef.current)
        .save();
    } catch (e: any) {
      toast.error("Erro ao gerar PDF: " + (e?.message ?? String(e)));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 print-dialog-content">
        <DialogHeader className="p-4 border-b no-print">
          <DialogTitle>{title} — pré-visualização</DialogTitle>
        </DialogHeader>

        <div ref={printRef} className="print-area bg-white text-black p-8 font-sans">
          {/* Cabeçalho */}
          <div className="flex items-start gap-4 pb-4 border-b-2 border-gray-800">
            {settings?.logo_url ? (
              <img
                src={settings.logo_url}
                alt="Logo"
                className="h-20 w-20 object-contain rounded"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="h-20 w-20 rounded bg-gray-100 flex items-center justify-center text-gray-400 text-xs">
                Sem logo
              </div>
            )}
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">
                {settings?.agency_name ?? "Agência"}
              </h1>
              {settings?.endereco && (
                <div className="text-sm text-gray-700">{settings.endereco}</div>
              )}
              <div className="text-sm text-gray-700 flex flex-wrap gap-x-3">
                {settings?.telefone && <span>Tel: {settings.telefone}</span>}
                {settings?.email && <span>{settings.email}</span>}
              </div>
              {settings?.nif && (
                <div className="text-xs text-gray-600">NIF: {settings.nif}</div>
              )}
            </div>
            <div className="text-right">
              <div className="uppercase text-xs tracking-wider text-gray-500">
                {title}
              </div>
              <div className="font-mono text-lg font-bold">{data.numero}</div>
              <div className="text-xs text-gray-600">
                {formatDateTime(data.data_emissao ?? new Date())}
              </div>
            </div>
          </div>

          {/* Corpo */}
          {type === "bilhete" ? (
            <div className="mt-6 space-y-6">
              <section>
                <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">
                  Passageiro
                </div>
                <div className="text-lg font-semibold">{data.cliente_nome ?? "—"}</div>
              </section>

              <section className="grid grid-cols-2 gap-4">
                <Field label="Companhia" value={data.companhia ?? "—"} />
                <Field label="PNR" value={data.pnr ?? "—"} mono />
                <Field
                  label="Rota"
                  value={`${data.origem ?? "—"} → ${data.destino ?? "—"}`}
                />
                <Field
                  label="Data da viagem"
                  value={data.data_viagem ? formatDate(data.data_viagem) : "—"}
                />
                <Field
                  label="Classe"
                  value={data.classe === "executiva" ? "Executiva" : "Económica"}
                />
                <Field label="Vendedor" value={data.vendedor ?? "—"} />
              </section>

              <section className="border-t pt-4">
                <table className="w-full text-sm">
                  <tbody>
                    <tr>
                      <td className="py-1 text-gray-700">Custo do bilhete</td>
                      <td className="py-1 text-right tabular-nums">
                        {formatCurrency(data.custo ?? 0, currency)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 text-gray-700">Taxa da agência</td>
                      <td className="py-1 text-right tabular-nums">
                        {formatCurrency(data.taxa ?? 0, currency)}
                      </td>
                    </tr>
                    <tr className="border-t border-gray-800">
                      <td className="pt-2 font-bold">Total a pagar</td>
                      <td className="pt-2 text-right tabular-nums font-bold text-lg">
                        {formatCurrency(data.total ?? 0, currency)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              <section>
                <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">
                  Recebido de
                </div>
                <div className="text-lg font-semibold">{data.cliente_nome ?? "—"}</div>
              </section>

              <section className="grid grid-cols-2 gap-4">
                <Field label="Referente ao bilhete" value={data.bilhete_ref ?? "—"} />
                <Field label="PNR" value={data.pnr ?? "—"} mono />
                <Field
                  label="Rota"
                  value={
                    data.origem || data.destino
                      ? `${data.origem ?? "—"} → ${data.destino ?? "—"}`
                      : "—"
                  }
                />
                <Field label="Forma de pagamento" value={data.forma_pagamento ?? "—"} />
              </section>

              <section className="border-t border-b py-4 my-4 bg-gray-50 px-4 rounded">
                <div className="text-xs uppercase tracking-wider text-gray-600">
                  Valor recebido
                </div>
                <div className="text-3xl font-bold tabular-nums mt-1">
                  {formatCurrency(data.valor_pago ?? 0, currency)}
                </div>
              </section>

              {data.observacao && (
                <section>
                  <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">
                    Observações
                  </div>
                  <div className="text-sm">{data.observacao}</div>
                </section>
              )}

              <section className="pt-16 grid grid-cols-2 gap-8 text-center text-xs text-gray-600">
                <div>
                  <div className="border-t border-gray-500 pt-1">Assinatura Cliente</div>
                </div>
                <div>
                  <div className="border-t border-gray-500 pt-1">
                    {settings?.agency_name ?? "Agência"}
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* Rodapé */}
          <div className="mt-10 pt-3 border-t text-[10px] text-gray-500 text-center">
            Documento emitido pelo sistema {settings?.agency_name ?? ""} —{" "}
            {formatDateTime(new Date())}
          </div>
        </div>

        <DialogFooter className="p-4 border-t no-print">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-2" /> Fechar
          </Button>
          <Button variant="outline" onClick={handleDownloadPdf}>
            <Download className="h-4 w-4 mr-2" /> Baixar PDF
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" /> Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
