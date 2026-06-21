import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useUserRole } from "@/hooks/use-auth";
import { Loader2, ShieldAlert } from "lucide-react";

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading, role } = useUserRole();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && role && !isAdmin) {
      navigate({ to: "/bilhetes", replace: true });
    }
  }, [loading, role, isAdmin, navigate]);

  if (loading || !role) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground mb-2" />
        <p className="text-muted-foreground">Acesso restrito ao administrador.</p>
      </div>
    );
  }
  return <>{children}</>;
}
