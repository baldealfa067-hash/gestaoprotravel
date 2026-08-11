import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Ticket,
  UserCog,
  Coins,
  Settings,
  LogOut,
  Plane,
  CalendarClock,
  ShieldCheck,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole, useIsSuperadmin } from "@/hooks/use-auth";


const adminItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Clientes", url: "/clientes", icon: Users },
  { title: "Reservas", url: "/reservas", icon: CalendarClock },
  { title: "Bilhetes", url: "/bilhetes", icon: Ticket },
  { title: "Funcionários", url: "/funcionarios", icon: UserCog },
  { title: "Capital", url: "/capital", icon: Coins },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
];

const vendedorItems = [
  { title: "Reservas", url: "/reservas", icon: CalendarClock },
  { title: "Bilhetes", url: "/bilhetes", icon: Ticket },
  { title: "Clientes", url: "/clientes", icon: Users },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  const { isSuperadmin } = useIsSuperadmin();
  const items = [
    ...(isAdmin ? adminItems : vendedorItems),
    ...(isSuperadmin ? [{ title: "Superadmin", url: "/superadmin", icon: ShieldCheck }] : []),
  ];


  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Plane className="h-5 w-5" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold text-sidebar-foreground leading-tight">
              Gestão Pro
            </span>
            <span className="text-xs text-sidebar-foreground/60">Travel</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active =
                  pathname === item.url || pathname.startsWith(item.url + "/");
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                    >
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <Button
          variant="ghost"
          onClick={signOut}
          className="w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          <span className="group-data-[collapsible=icon]:hidden">Terminar sessão</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}