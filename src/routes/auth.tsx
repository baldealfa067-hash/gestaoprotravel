import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plane, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/" });
  },
  component: AuthPage,
});

const loginSchema = z.object({
  email: z.string().trim().email("Email inválido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(100),
});

const signupSchema = loginSchema.extend({
  full_name: z.string().trim().min(2, "Indique o nome").max(100),
  agency_name: z.string().trim().min(2, "Indique o nome da agência").max(120),
});

function AuthPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"login" | "setup" | "forgot">("login");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", agency_name: "" });


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = loginSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message || "Credenciais inválidas");
      return;
    }
    toast.success("Sessão iniciada");
    navigate({ to: "/" });
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = signupSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: parsed.data.full_name, cargo: "Administrador" },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Conta de administrador criada. Pode iniciar sessão.");
    setTab("login");
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = form.email.trim();
    if (!z.string().email().safeParse(email).success) {
      toast.error("Email inválido");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Verifique o email para recuperar a senha");
    setTab("login");
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4" style={{ background: "var(--gradient-primary)" }}>
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6 text-primary-foreground">
          <div className="h-14 w-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center mb-3">
            <Plane className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold">Gestão Pro Travel</h1>
          <p className="text-sm text-primary-foreground/80">Plataforma de gestão para agências</p>
        </div>
        <Card className="shadow-2xl border-0">
          <CardHeader className="pb-2">
            <CardTitle>
              {tab === "login" && "Iniciar sessão"}
              {tab === "setup" && "Criar Administrador"}
              {tab === "forgot" && "Recuperar senha"}
            </CardTitle>
            <CardDescription>
              {tab === "login" && "Entre com as suas credenciais"}
              {tab === "setup" && "Primeiro acesso à plataforma"}
              {tab === "forgot" && "Enviaremos um link para o seu email"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="setup">Criar agência</TabsTrigger>

              </TabsList>
              <TabsContent value="login">
                {tab !== "forgot" ? (
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password">Senha</Label>
                        <button type="button" className="text-xs text-primary hover:underline" onClick={() => setTab("forgot")}>
                          Esqueceu?
                        </button>
                      </div>
                      <Input id="password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Entrar
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleForgot} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email-f">Email</Label>
                      <Input id="email-f" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" className="flex-1" onClick={() => setTab("login")}>
                        Voltar
                      </Button>
                      <Button type="submit" className="flex-1" disabled={loading}>
                        {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Enviar
                      </Button>
                    </div>
                  </form>
                )}
              </TabsContent>
              <TabsContent value="setup">
                <form onSubmit={handleSetup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="agency_name">Nome da agência</Label>
                    <Input id="agency_name" value={form.agency_name} onChange={(e) => setForm({ ...form, agency_name: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="full_name">Nome completo</Label>
                    <Input id="full_name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email-s">Email</Label>
                    <Input id="email-s" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password-s">Senha</Label>
                    <Input id="password-s" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Criar Administrador
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Esta opção só está disponível na primeira instalação. Depois, novos utilizadores devem ser convidados pelo admin.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}