import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useAgencySettings() {
  return useQuery({
    queryKey: ["agency_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agency_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}