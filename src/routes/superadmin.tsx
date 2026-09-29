import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, LogOut, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/superadmin")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const { data: sa } = await supabase
      .from("superadmins")
      .select("user_id")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (!sa) throw redirect({ to: "/dashboard" });
    return { user: data.user };
  },
  component: SuperadminLayout,
  head: () => ({
    meta: [
      { title: "Superadministração | Gestão Pro Travel" },
      { name: "description", content: "Gestão global de agências da plataforma Gestão Pro Travel." },
      { property: "og:title", content: "Superadministração | Gestão Pro Travel" },
      { property: "og:description", content: "Gestão global de agências da plataforma." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function SuperadminLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/95 backdrop-blur px-4 md:px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <span className="font-semibold">Gestão Pro — Superadmin</span>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden sm:inline text-sm text-muted-foreground">{user.email}</span>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-1" /> Sair
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl">
        <SuperadminPage />
      </main>
    </div>
  );
}

function SuperadminPage() {
  const qc = useQueryClient();
  const [target, setTarget] = useState<{ id: string; nome: string } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["superadmin-agencies"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("listar_agencias");
      if (error) throw new Error(error.message);
      return (data ?? []) as any[];
    },
    retry: false,
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("eliminar_agencia", { _agency_id: id });
      if (error) throw new Error(error.message);
    },
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
