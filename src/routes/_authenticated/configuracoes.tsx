import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAgencySettings } from "@/hooks/use-agency-settings";
import { useUserRole } from "@/hooks/use-auth";
import { RequireAdmin } from "@/components/require-admin";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: () => (
    <RequireAdmin>
      <ConfiguracoesPage />
    </RequireAdmin>
  ),
});

const CURRENCIES = ["AOA", "USD", "EUR", "BRL", "ZAR", "MZN", "CVE", "GBP"];

function ConfiguracoesPage() {
  const qc = useQueryClient();
  const { data: settings } = useAgencySettings();
  const { isAdmin } = useUserRole();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("AOA");

  useEffect(() => {
    if (settings) {
      setName(settings.agency_name);
      setCurrency(settings.currency);
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("agency_settings")
        .update({ agency_name: name, currency })
        .eq("id", settings!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações atualizadas");
      qc.invalidateQueries({ queryKey: ["agency_settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground text-sm">Identidade da agência e moeda</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agência</CardTitle>
          <CardDescription>{isAdmin ? "Edite os dados gerais" : "Apenas administradores podem editar"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nome da agência</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin} />
          </div>
          <div className="space-y-2">
            <Label>Moeda principal</Label>
            <Select value={currency} onValueChange={setCurrency} disabled={!isAdmin}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {isAdmin && (
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Guardar</Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}