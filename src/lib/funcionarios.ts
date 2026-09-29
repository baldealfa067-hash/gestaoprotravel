import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type NovoFuncionario = {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  cargo?: string;
  role: "admin" | "vendedor";
};

// O admin cria um convite (RPC) e o browser regista o funcionário; o trigger
// handle_new_user consome o convite e associa-o à agência com o papel escolhido.
// Não depende de variáveis secretas no servidor.
export async function criarFuncionario(input: NovoFuncionario): Promise<{ precisaConfirmarEmail: boolean }> {
  const email = input.email.trim().toLowerCase();

  const { error: eConvite } = await (supabase as any).rpc("criar_convite_funcionario", {
    _email: email,
    _role: input.role,
  });
  if (eConvite) throw new Error(eConvite.message);

  // Cliente separado e sem sessão persistida: o signUp não pode substituir a sessão do admin
  const registo = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: "sb-registo-funcionario",
      },
    },
  );
  const { data, error } = await registo.auth.signUp({
    email,
    password: input.password,
    options: {
      data: { full_name: input.full_name, phone: input.phone ?? "", cargo: input.cargo ?? "" },
    },
  });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("Falha ao criar utilizador");

  // Confirmar que ficou na agência do admin (se o convite não foi usado, o trigger cria outra agência)
  const { data: perfil } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!perfil) throw new Error("O utilizador foi criado mas não ficou associado à agência");

  return { precisaConfirmarEmail: !data.session };
}
