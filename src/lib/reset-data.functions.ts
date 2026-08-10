import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const resetAllData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ confirm: z.literal("RESET") }).parse(input),
  )
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Acesso negado");

    const { data: me } = await context.supabase
      .from("profiles")
      .select("agency_id")
      .eq("id", context.userId)
      .maybeSingle();
    const agencyId = me?.agency_id;
    if (!agencyId) throw new Error("Agência não encontrada");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Ordem importa por FKs
    const tables = [
      "mudancas_rota",
      "movimentacoes_capital",
      "reservas",
      "bilhetes",
      "clientes",
      "companhias_aereas",
    ] as const;

    for (const t of tables) {
      const { error } = await supabaseAdmin.from(t).delete().eq("agency_id", agencyId);
      if (error) throw new Error(`${t}: ${error.message}`);
    }

    // Contas: apagar não-sistema, zerar sistema
    const { error: eCn } = await supabaseAdmin
      .from("contas_financeiras")
      .delete()
      .eq("agency_id", agencyId)
      .eq("sistema", false);
    if (eCn) throw new Error(`contas_financeiras: ${eCn.message}`);
    await supabaseAdmin
      .from("contas_financeiras")
      .update({ saldo_inicial: 0 })
      .eq("agency_id", agencyId)
      .eq("sistema", true);

    // Fundo de lucro: zerar
    await supabaseAdmin
      .from("fundo_lucro")
      .update({ saldo: 0 })
      .eq("agency_id", agencyId);

    return { ok: true };
  });

