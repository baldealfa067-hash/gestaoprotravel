import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAgencySettings } from "@/hooks/use-agency-settings";
import { useUserRole } from "@/hooks/use-auth";
import { RequireAdmin } from "@/components/require-admin";
import { Upload, X, AlertTriangle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { resetAllData } from "@/lib/reset-data.functions";


export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: () => (
    <RequireAdmin>
      <ConfiguracoesPage />
    </RequireAdmin>
  ),
});

const CURRENCIES = ["AOA", "XOF", "USD", "EUR", "BRL", "ZAR", "MZN", "CVE", "GBP"];
const MAX_LOGO_BYTES = 1024 * 1024; // 1 MB
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

function ConfiguracoesPage() {
  const qc = useQueryClient();
  const { data: settings } = useAgencySettings();
  const { isAdmin } = useUserRole();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("AOA");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [endereco, setEndereco] = useState("");
  const [nif, setNif] = useState("");
  const [capitalBase, setCapitalBase] = useState<string>("0");
  const [adminPin, setAdminPin] = useState<string>("");

  useEffect(() => {
    if (settings) {
      setName(settings.agency_name);
      setCurrency(settings.currency);
      setLogoUrl((settings as any).logo_url ?? null);
      setTelefone((settings as any).telefone ?? "");
      setEmail((settings as any).email ?? "");
      setEndereco((settings as any).endereco ?? "");
      setNif((settings as any).nif ?? "");
      setCapitalBase(String((settings as any).capital_base_operacional ?? 0));
      setAdminPin(String((settings as any).admin_pin ?? ""));
    }
  }, [settings]);


  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!ACCEPTED_TYPES.includes(f.type)) {
      toast.error("Formato inválido. Use PNG, JPG, WEBP ou SVG.");
      return;
    }
    if (f.size > MAX_LOGO_BYTES) {
      toast.error("Ficheiro maior que 1 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoUrl(reader.result as string);
    reader.onerror = () => toast.error("Erro ao ler ficheiro.");
    reader.readAsDataURL(f);
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        agency_name: name,
        currency,
        logo_url: logoUrl,
        telefone: telefone || null,
        email: email || null,
        endereco: endereco || null,
        nif: nif || null,
        capital_base_operacional: Number(capitalBase) || 0,
      };

      if (settings?.id) {
        const { error } = await supabase
          .from("agency_settings")
          .update(payload)
          .eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("agency_settings").insert(payload);
        if (error) throw error;
      }

      // Sincroniza saldo do Capital Circulante com a nova Base
      const { error: rpcErr } = await supabase.rpc("sincronizar_capital_base" as any);
      if (rpcErr) throw rpcErr;
    },
    onSuccess: () => {
      toast.success("Configurações atualizadas e capital sincronizado");
      qc.invalidateQueries({ queryKey: ["agency_settings"] });
      qc.invalidateQueries({ queryKey: ["contas"] });
      qc.invalidateQueries({ queryKey: ["consistencia"] });
      qc.invalidateQueries({ queryKey: ["movimentacoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground text-sm">
          Identidade da agência — aparece nos bilhetes e recibos emitidos
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agência</CardTitle>
          <CardDescription>
            {isAdmin ? "Edite os dados gerais" : "Apenas administradores podem editar"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Nome da agência</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin} />
          </div>

          <div className="space-y-2">
            <Label>Moeda principal</Label>
            <Select value={currency} onValueChange={setCurrency} disabled={!isAdmin}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Logótipo da agência</Label>
            <div className="flex items-center gap-3">
              <div className="h-16 w-16 rounded border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-xs text-muted-foreground">Sem logo</span>
                )}
              </div>
              <Input
                ref={fileRef}
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                onChange={onPickFile}
                disabled={!isAdmin}
                className="flex-1"
              />
              {logoUrl && isAdmin && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLogoUrl(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                >
                  <X className="h-4 w-4 mr-1" /> Remover
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              PNG, JPG, WEBP ou SVG. Máximo 1 MB.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                disabled={!isAdmin}
                placeholder="+244 900 000 000"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!isAdmin}
                placeholder="contacto@agencia.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Endereço</Label>
            <Textarea
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              disabled={!isAdmin}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>NIF (opcional)</Label>
            <Input value={nif} onChange={(e) => setNif(e.target.value)} disabled={!isAdmin} />
          </div>

          <div className="space-y-2 pt-4 border-t">
            <Label>Capital inicial (aporte)</Label>
            <Input
              type="number"
              min={0}
              step="1"
              value={capitalBase}
              onChange={(e) => setCapitalBase(e.target.value)}
              disabled={!isAdmin}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground">
              Valor total ({currency}) que colocas no Capital Circulante. Ao guardar, o
              sistema ajusta o saldo em caixa para este valor. Depois, carregar companhias
              faz o Capital Circulante diminuir e pagamentos de clientes fazem-no voltar
              a subir. O lucro (taxas) cresce à parte, no Fundo de Lucro.
            </p>
          </div>




          {isAdmin && (
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              <Upload className="h-4 w-4 mr-2" />
              {save.isPending ? "A guardar..." : "Guardar"}
            </Button>
          )}
        </CardContent>
      </Card>

      {isAdmin && <ResetDataCard />}
    </div>
  );
}

function ResetDataCard() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const reset = useServerFn(resetAllData);
  const mut = useMutation({
    mutationFn: async () => await reset({ data: { confirm: "RESET" } }),
    onSuccess: () => {
      toast.success("Todos os dados foram eliminados");
      setOpen(false);
      setConfirm("");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" /> Zona de perigo
        </CardTitle>
        <CardDescription>
          Elimina permanentemente bilhetes, reservas, clientes, companhias, contas,
          movimentações e zera o fundo de lucro. Utilizadores, funções e configurações
          da agência mantêm-se.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          <AlertTriangle className="h-4 w-4 mr-2" /> Reset de dados
        </Button>
      </CardContent>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirm(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Confirmar reset total</DialogTitle>
            <DialogDescription>
              Esta ação é <b>irreversível</b>. Todos os bilhetes, reservas, clientes,
              companhias, contas e movimentações serão eliminados. Escreva <b>RESET</b> para confirmar.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="RESET"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={confirm !== "RESET" || mut.isPending}
              onClick={() => mut.mutate()}
            >
              {mut.isPending ? "A eliminar..." : "Eliminar tudo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

