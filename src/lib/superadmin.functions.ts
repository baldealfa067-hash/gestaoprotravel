import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuperadmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("is_superadmin", { _user_id: context.userId });
  if (!data) throw new Error("Acesso negado");
}

export const listAgencies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: agencies, error } = await supabaseAdmin
      .from("agency_settings")
      .select("id, agency_name, currency, email, telefone, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const { data: profiles } = await supabaseAdmin.from("profiles").select("id, agency_id, full_name");
    const { data: bilhetes } = await supabaseAdmin.from("bilhetes").select("id, agency_id");

    return (agencies ?? []).map((a) => ({
      ...a,
      utilizadores: (profiles ?? []).filter((p) => p.agency_id === a.id).length,
      bilhetes: (bilhetes ?? []).filter((b) => b.agency_id === a.id).length,
    }));
  });

export const deleteAgency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ agency_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Impedir eliminar a própria agência do superadmin
    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("agency_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (me?.agency_id === data.agency_id) throw new Error("Não pode eliminar a sua própria agência");

    const tables = [
      "mudancas_rota",
      "movimentacoes_capital",
      "reservas",
      "bilhetes",
      "clientes",
      "companhias_aereas",
      "contas_financeiras",
      "fundo_lucro",
      "user_roles",
    ] as const;

    for (const t of tables) {
      const { error } = await supabaseAdmin.from(t).delete().eq("agency_id", data.agency_id);
      if (error) throw new Error(`${t}: ${error.message}`);
    }

    const { data: users } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("agency_id", data.agency_id);

    await supabaseAdmin.from("profiles").delete().eq("agency_id", data.agency_id);

    for (const u of users ?? []) {
      if (u.id === context.userId) continue;
      await supabaseAdmin.auth.admin.deleteUser(u.id);
    }

    const { error: eAg } = await supabaseAdmin.from("agency_settings").delete().eq("id", data.agency_id);
    if (eAg) throw new Error(eAg.message);

    return { ok: true };
  });
