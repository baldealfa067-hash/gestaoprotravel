import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type MudancaTarget = {
  type: "bilhete" | "reserva";
  row: {
    id: string;
    cliente_id?: string | null;
    origem?: string | null;
    destino?: string | null;
    classe?: "economica" | "executiva" | null;
    data_viagem?: string | null;
    cliente?: { full_name?: string | null } | null;
  };
};

export function MudancaRotaDialog({
  target,
  onClose,
}: {
  target: MudancaTarget | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [classe, setClasse] = useState<"economica" | "executiva">("economica");
  const [dataViagem, setDataViagem] = useState("");
  const [taxa, setTaxa] = useState<number>(0);
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (target) {
      setOrigem(target.row.origem ?? "");
      setDestino(target.row.destino ?? "");
      setClasse((target.row.classe as any) ?? "economica");
      setDataViagem(target.row.data_viagem ?? new Date().toISOString().slice(0, 10));
      setTaxa(0);
      setMotivo("");
    }
  }, [target]);

  const save = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("Alvo inválido");
      if (!origem.trim() || !destino.trim()) throw new Error("Nova rota (origem → destino) obrigatória");
      if (!taxa || taxa <= 0) throw new Error("Taxa da mudança deve ser maior que zero");

      const rotaAntiga = `${target.row.origem ?? "?"} → ${target.row.destino ?? "?"}`;
      const rotaNova = `${origem.trim()} → ${destino.trim()}`;
      const { data: u } = await supabase.auth.getUser();

      const payload: any = {
        bilhete_id: target.type === "bilhete" ? target.row.id : null,
        reserva_id: target.type === "reserva" ? target.row.id : null,
        cliente_id: target.row.cliente_id ?? null,
        rota_antiga: rotaAntiga,
        rota_nova: rotaNova,
        classe_antiga: target.row.classe ?? null,
        classe_nova: classe,
        data_viagem_antiga: target.row.data_viagem ?? null,
        data_viagem_nova: dataViagem || null,
        taxa_mudanca: taxa,
        motivo: motivo.trim() || null,
        responsavel_id: u.user?.id ?? null,
      };

      const { error } = await (supabase as any).from("mudancas_rota").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mudança de rota registada");
      qc.invalidateQueries({ queryKey: ["bilhetes"] });
      qc.invalidateQueries({ queryKey: ["reservas"] });
      qc.invalidateQueries({ queryKey: ["mudancas-rota"] });
      qc.invalidateQueries({ queryKey: ["mudancas-por-bilhete"] });
      qc.invalidateQueries({ queryKey: ["capital-consistencia"] });
      qc.invalidateQueries({ queryKey: ["capital-dividas-lista"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registar mudança de rota</DialogTitle>
          <DialogDescription>
            {target?.row.cliente?.full_name && (
              <span className="font-medium">{target.row.cliente.full_name} — </span>
            )}
            Rota atual: <b>{target?.row.origem} → {target?.row.destino}</b>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Nova origem</Label>
              <Input value={origem} onChange={(e) => setOrigem(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Novo destino</Label>
              <Input value={destino} onChange={(e) => setDestino(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Nova classe</Label>
              <Select value={classe} onValueChange={(v) => setClasse(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="economica">Económica</SelectItem>
                  <SelectItem value="executiva">Executiva</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nova data viagem</Label>
              <Input type="date" value={dataViagem} onChange={(e) => setDataViagem(e.target.value)} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label className="text-primary font-semibold">Taxa da mudança *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={taxa}
                onChange={(e) => setTaxa(Number(e.target.value))}
                placeholder="Ex: 15000"
              />
              <p className="text-xs text-muted-foreground">
                {target?.type === "bilhete"
                  ? "É somada ao valor do bilhete e vira dívida do cliente. Quando paga, entra no lucro."
                  : "Vai ser aplicada quando o bilhete for emitido a partir desta reserva."}
              </p>
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Motivo (opcional)</Label>
              <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Registar mudança
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
