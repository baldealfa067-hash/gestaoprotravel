import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAgencies, deleteAgency } from "@/lib/superadmin.functions";

export const Route = createFileRoute("/_authenticated/superadmin")({
  component: SuperadminPage,
  head: () => ({
    meta: [
      { title: "Superadministração | Gestão Pro Travel" },
      { name: "description", content: "Gestão global de agências da plataforma Gestão Pro Travel." },
      { property: "og:title", content: "Superadministração | Gestão Pro Travel" },
      { property: "og:description", content: "Gestão global de agências da plataforma." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function SuperadminPage() {
  const qc = useQueryClient();
  const fetchAgencies = useServerFn(listAgencies);
  const removeAgency = useServerFn(deleteAgency);
  const [target, setTarget] = useState<{ id: string; nome: string } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["superadmin-agencies"],
    queryFn: () => fetchAgencies(),
    retry: false,
  });

  const del = useMutation({
    mutationFn: (id: string) => removeAgency({ data: { agency_id: id } }),
    onSuccess: () => {
      toast.success("Negócio eliminado");
      setTarget(null);
      qc.invalidateQueries({ queryKey: ["superadmin-agencies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex items-center gap-3 py-10 text-muted-foreground">
            <ShieldAlert className="h-5 w-5" />
            Acesso restrito ao superadministrador da plataforma.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Superadministração</h1>
        <p className="text-sm text-muted-foreground">Todos os negócios registados na plataforma.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Negócios ({data?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agência</TableHead>
                  <TableHead>Moeda</TableHead>
                  <TableHead className="text-right">Utilizadores</TableHead>
                  <TableHead className="text-right">Bilhetes</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.agency_name}</TableCell>
                    <TableCell>{a.currency}</TableCell>
                    <TableCell className="text-right">{a.utilizadores}</TableCell>
                    <TableCell className="text-right">{a.bilhetes}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setTarget({ id: a.id, nome: a.agency_name })}
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar "{target?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação elimina definitivamente o negócio, os seus utilizadores e todos os dados
              associados. Não pode ser revertida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={del.isPending}
              onClick={() => target && del.mutate(target.id)}
            >
              {del.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>

      </AlertDialog>
    </div>
  );
}
