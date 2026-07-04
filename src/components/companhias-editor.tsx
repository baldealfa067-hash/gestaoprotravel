import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { useAgencySettings } from "@/hooks/use-agency-settings";

type Row = {
  id: string | null;
  nome: string;
  codigo: string;
  saldo: number;
  ativa: boolean;
  _dirty?: boolean;
  _new?: boolean;
};

export function CompanhiasEditor() {
  const qc = useQueryClient();
  const { data: settings } = useAgencySettings();
  const currency = settings?.currency ?? "AOA";

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["companhias-editor"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companhias_aereas")
        .select("id, nome, codigo, saldo, ativa")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const [draft, setDraft] = useState<Row[]>([]);

  useEffect(() => {
    setDraft(
      rows.map((r: any) => ({
        id: r.id,
        nome: r.nome ?? "",
        codigo: r.codigo ?? "",
        saldo: Number(r.saldo ?? 0),
        ativa: !!r.ativa,
      })),
    );
  }, [rows]);

  const save = useMutation({
    mutationFn: async () => {
      const inserts = draft
        .filter((r) => r._new && r.nome.trim())
        .map((r) => ({
          nome: r.nome.trim(),
          codigo: r.codigo.trim() || null,
          ativa: r.ativa,
          saldo: Number(r.saldo) || 0,
        }));
      const updates = draft.filter((r) => r.id && r._dirty && !r._new);

      if (inserts.length) {
        const { error } = await supabase.from("companhias_aereas").insert(inserts as any);
        if (error) throw error;
      }
      for (const u of updates) {
        const { error } = await supabase
          .from("companhias_aereas")
          .update({
            nome: u.nome.trim(),
            codigo: u.codigo.trim() || null,
            ativa: u.ativa,
            saldo: Number(u.saldo) || 0,
          })
          .eq("id", u.id as string);
        if (error) throw error;
      }
    },

    onSuccess: () => {
      toast.success("Companhias guardadas");
      qc.invalidateQueries({ queryKey: ["companhias-editor"] });
      qc.invalidateQueries({ queryKey: ["companhias-options"] });
      qc.invalidateQueries({ queryKey: ["capital-consistencia"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const target = draft.find((r) => r.id === id);
      if (target && target.saldo > 0) {
        throw new Error("Só é possível eliminar uma companhia com saldo 0.");
      }
      const { error } = await supabase.from("companhias_aereas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Companhia eliminada");
      qc.invalidateQueries({ queryKey: ["companhias-editor"] });
      qc.invalidateQueries({ queryKey: ["companhias-options"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addRow = () => {
    setDraft((d) => [
      ...d,
      { id: null, nome: "", codigo: "", saldo: 0, ativa: true, _new: true, _dirty: true },
    ]);
  };

  const update = (idx: number, patch: Partial<Row>) => {
    setDraft((d) => d.map((r, i) => (i === idx ? { ...r, ...patch, _dirty: true } : r)));
  };

  const removeDraft = (idx: number) => {
    const r = draft[idx];
    if (r.id) {
      if (!confirm("Eliminar esta companhia? Só funciona se o saldo for 0.")) return;
      remove.mutate(r.id);
    } else {
      setDraft((d) => d.filter((_, i) => i !== idx));
    }
  };

  const dirtyCount = draft.filter((r) => r._dirty).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Companhias aéreas</CardTitle>
          <CardDescription>
            Cadastro estilo planilha. Adicione, edite e guarde. O saldo é gerido pelos
            carregamentos e pela emissão de bilhetes.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar linha
          </Button>
          <Button
            size="sm"
            onClick={() => save.mutate()}
            disabled={save.isPending || dirtyCount === 0}
          >
            <Save className="h-4 w-4 mr-1" />
            {save.isPending ? "A guardar..." : `Guardar${dirtyCount ? ` (${dirtyCount})` : ""}`}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="w-28">Código</TableHead>
              <TableHead className="text-right w-40">Saldo atual</TableHead>
              <TableHead className="w-24">Ativa</TableHead>
              <TableHead className="w-14"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  A carregar…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && draft.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  Nenhuma companhia. Clique "Adicionar linha".
                </TableCell>
              </TableRow>
            )}
            {draft.map((r, idx) => (
              <TableRow key={r.id ?? `new-${idx}`}>
                <TableCell>
                  <Input
                    value={r.nome}
                    onChange={(e) => update(idx, { nome: e.target.value })}
                    placeholder="Ex: TAP Portugal"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={r.codigo}
                    onChange={(e) => update(idx, { codigo: e.target.value.toUpperCase() })}
                    placeholder="TP"
                    maxLength={4}
                    className="font-mono uppercase"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    step="0.01"
                    value={r.saldo}
                    onChange={(e) => update(idx, { saldo: Number(e.target.value) })}
                    className="text-right tabular-nums font-semibold"
                  />
                </TableCell>

                <TableCell>
                  <input
                    type="checkbox"
                    checked={r.ativa}
                    onChange={(e) => update(idx, { ativa: e.target.checked })}
                    className="h-4 w-4"
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeDraft(idx)}
                    disabled={r.saldo > 0}
                    title={r.saldo > 0 ? "Saldo tem que ser 0" : "Eliminar"}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
