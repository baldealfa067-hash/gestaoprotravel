import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      email: z.string().email().max(255),
      password: z.string().min(6).max(100),
      full_name: z.string().min(2).max(120),
      phone: z.string().max(40).optional().or(z.literal("")),
      cargo: z.string().max(80).optional().or(z.literal("")),
      role: z.enum(["admin", "vendedor"]).default("vendedor"),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Verify caller is admin
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Acesso negado");

    // Agência do admin que está a criar
    const { data: me } = await context.supabase
      .from("profiles")
      .select("agency_id")
      .eq("id", context.userId)
      .maybeSingle();
    const agencyId = me?.agency_id;
    if (!agencyId) throw new Error("Agência não encontrada");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.full_name,
        phone: data.phone,
        cargo: data.cargo,
        role: data.role,
        agency_id: agencyId,
      },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Falha ao criar utilizador");

    // Ensure role row exists with requested role (trigger may default to vendedor)
    await supabaseAdmin.from("user_roles").upsert(
      { user_id: created.user.id, role: data.role, agency_id: agencyId },
      { onConflict: "user_id,role" },
    );
    if (data.role === "admin") {
      // remove vendedor row if any
      await supabaseAdmin.from("user_roles").delete().eq("user_id", created.user.id).eq("role", "vendedor");
    }


    return { ok: true, user_id: created.user.id };
  });

export const deleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Acesso negado");
    if (data.user_id === context.userId) throw new Error("Não pode eliminar a sua própria conta");
    // Só pode eliminar funcionários da própria agência (RLS garante o alcance)
    const { data: target } = await context.supabase
      .from("profiles")
      .select("id")
      .eq("id", data.user_id)
      .maybeSingle();
    if (!target) throw new Error("Funcionário não pertence à sua agência");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Reatribuir registos ao admin (FKs impedem a eliminação direta)
    await supabaseAdmin.from("bilhetes").update({ vendedor_id: context.userId }).eq("vendedor_id", data.user_id);
    await supabaseAdmin.from("reservas").update({ user_id: context.userId }).eq("user_id", data.user_id);
    await supabaseAdmin.from("clientes").update({ created_by: context.userId }).eq("created_by", data.user_id);
    await supabaseAdmin
      .from("movimentacoes_capital")
      .update({ responsavel_id: context.userId })
      .eq("responsavel_id", data.user_id);
    await supabaseAdmin.from("mudancas_rota").update({ responsavel_id: context.userId }).eq("responsavel_id", data.user_id);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
