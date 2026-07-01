export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agency_settings: {
        Row: {
          agency_name: string
          created_at: string
          currency: string
          id: string
          updated_at: string
        }
        Insert: {
          agency_name?: string
          created_at?: string
          currency?: string
          id?: string
          updated_at?: string
        }
        Update: {
          agency_name?: string
          created_at?: string
          currency?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      bilhetes: {
        Row: {
          classe: Database["public"]["Enums"]["bilhete_classe"]
          cliente_id: string
          companhia: string
          companhia_id: string | null
          continente_destino: Database["public"]["Enums"]["continente"] | null
          continente_origem: Database["public"]["Enums"]["continente"] | null
          created_at: string
          custo: number
          data_viagem: string
          destino: string
          id: string
          lucro: number | null
          observacoes: string | null
          origem: string
          pago: boolean
          pnr: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          taxa_agencia: number
          updated_at: string
          valor_cobrado: number
          vendedor_id: string
        }
        Insert: {
          classe?: Database["public"]["Enums"]["bilhete_classe"]
          cliente_id: string
          companhia: string
          companhia_id?: string | null
          continente_destino?: Database["public"]["Enums"]["continente"] | null
          continente_origem?: Database["public"]["Enums"]["continente"] | null
          created_at?: string
          custo?: number
          data_viagem: string
          destino: string
          id?: string
          lucro?: number | null
          observacoes?: string | null
          origem: string
          pago?: boolean
          pnr?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          taxa_agencia?: number
          updated_at?: string
          valor_cobrado?: number
          vendedor_id: string
        }
        Update: {
          classe?: Database["public"]["Enums"]["bilhete_classe"]
          cliente_id?: string
          companhia?: string
          companhia_id?: string | null
          continente_destino?: Database["public"]["Enums"]["continente"] | null
          continente_origem?: Database["public"]["Enums"]["continente"] | null
          created_at?: string
          custo?: number
          data_viagem?: string
          destino?: string
          id?: string
          lucro?: number | null
          observacoes?: string | null
          origem?: string
          pago?: boolean
          pnr?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          taxa_agencia?: number
          updated_at?: string
          valor_cobrado?: number
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bilhetes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bilhetes_companhia_id_fkey"
            columns: ["companhia_id"]
            isOneToOne: false
            referencedRelation: "companhias_aereas"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          nationality: string | null
          passport_number: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          nationality?: string | null
          passport_number?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          nationality?: string | null
          passport_number?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      companhias_aereas: {
        Row: {
          alerta_minimo: number
          ativa: boolean
          codigo: string | null
          created_at: string
          id: string
          nome: string
          saldo: number
          ultimo_carregamento: string | null
          ultimo_consumo: string | null
          updated_at: string
        }
        Insert: {
          alerta_minimo?: number
          ativa?: boolean
          codigo?: string | null
          created_at?: string
          id?: string
          nome: string
          saldo?: number
          ultimo_carregamento?: string | null
          ultimo_consumo?: string | null
          updated_at?: string
        }
        Update: {
          alerta_minimo?: number
          ativa?: boolean
          codigo?: string | null
          created_at?: string
          id?: string
          nome?: string
          saldo?: number
          ultimo_carregamento?: string | null
          ultimo_consumo?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      contas_financeiras: {
        Row: {
          ativa: boolean
          created_at: string
          id: string
          nome: string
          saldo_inicial: number
          sistema: boolean
          tipo: Database["public"]["Enums"]["conta_tipo"]
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome: string
          saldo_inicial?: number
          sistema?: boolean
          tipo: Database["public"]["Enums"]["conta_tipo"]
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome?: string
          saldo_inicial?: number
          sistema?: boolean
          tipo?: Database["public"]["Enums"]["conta_tipo"]
          updated_at?: string
        }
        Relationships: []
      }
      fundo_lucro: {
        Row: {
          id: string
          saldo: number
          updated_at: string
        }
        Insert: {
          id?: string
          saldo?: number
          updated_at?: string
        }
        Update: {
          id?: string
          saldo?: number
          updated_at?: string
        }
        Relationships: []
      }
      movimentacoes_capital: {
        Row: {
          bilhete_id: string | null
          cliente_id: string | null
          companhia_id: string | null
          conta_destino_id: string | null
          conta_origem_id: string | null
          created_at: string
          id: string
          observacao: string | null
          referencia: string | null
          responsavel_id: string | null
          tipo: Database["public"]["Enums"]["mov_tipo"]
          valor: number
        }
        Insert: {
          bilhete_id?: string | null
          cliente_id?: string | null
          companhia_id?: string | null
          conta_destino_id?: string | null
          conta_origem_id?: string | null
          created_at?: string
          id?: string
          observacao?: string | null
          referencia?: string | null
          responsavel_id?: string | null
          tipo: Database["public"]["Enums"]["mov_tipo"]
          valor: number
        }
        Update: {
          bilhete_id?: string | null
          cliente_id?: string | null
          companhia_id?: string | null
          conta_destino_id?: string | null
          conta_origem_id?: string | null
          created_at?: string
          id?: string
          observacao?: string | null
          referencia?: string | null
          responsavel_id?: string | null
          tipo?: Database["public"]["Enums"]["mov_tipo"]
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "movimentacoes_capital_bilhete_id_fkey"
            columns: ["bilhete_id"]
            isOneToOne: false
            referencedRelation: "bilhetes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_capital_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_capital_companhia_id_fkey"
            columns: ["companhia_id"]
            isOneToOne: false
            referencedRelation: "companhias_aereas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_capital_conta_destino_id_fkey"
            columns: ["conta_destino_id"]
            isOneToOne: false
            referencedRelation: "contas_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_capital_conta_origem_id_fkey"
            columns: ["conta_origem_id"]
            isOneToOne: false
            referencedRelation: "contas_financeiras"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          cargo: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          cargo?: string | null
          created_at?: string
          full_name?: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          cargo?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reservas: {
        Row: {
          bilhete_id: string | null
          classe: string
          cliente_contactado: boolean
          cliente_id: string
          companhia: string
          continente_destino: string | null
          continente_origem: string | null
          created_at: string
          data_limite: string
          data_viagem: string
          destino: string
          id: string
          observacoes: string | null
          origem: string
          pnr: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bilhete_id?: string | null
          classe?: string
          cliente_contactado?: boolean
          cliente_id: string
          companhia: string
          continente_destino?: string | null
          continente_origem?: string | null
          created_at?: string
          data_limite: string
          data_viagem: string
          destino: string
          id?: string
          observacoes?: string | null
          origem: string
          pnr: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bilhete_id?: string | null
          classe?: string
          cliente_contactado?: boolean
          cliente_id?: string
          companhia?: string
          continente_destino?: string | null
          continente_origem?: string | null
          created_at?: string
          data_limite?: string
          data_viagem?: string
          destino?: string
          id?: string
          observacoes?: string | null
          origem?: string
          pnr?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservas_bilhete_id_fkey"
            columns: ["bilhete_id"]
            isOneToOne: false
            referencedRelation: "bilhetes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calcular_taxa_agencia: {
        Args: {
          _classe: Database["public"]["Enums"]["bilhete_classe"]
          _custo: number
          _destino: Database["public"]["Enums"]["continente"]
          _origem: Database["public"]["Enums"]["continente"]
        }
        Returns: number
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      verificar_consistencia_capital: {
        Args: never
        Returns: {
          capital_companhias: number
          capital_contas: number
          capital_dividas: number
          capital_total: number
          consistente: boolean
          diferenca: number
          fundo_lucro: number
          taxa_acumulada: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "vendedor"
      bilhete_classe: "economica" | "executiva"
      conta_tipo: "caixa" | "banco"
      continente: "africa" | "europa" | "america" | "asia" | "oceania"
      mov_tipo:
        | "carregamento_companhia"
        | "emissao_bilhete"
        | "pagamento_cliente"
        | "transferencia_lucro"
        | "despesa_operacional"
        | "transferencia_interna"
        | "aporte_capital"
      ticket_status:
        | "pedido_criado"
        | "pendente"
        | "pago"
        | "emitido"
        | "cancelado"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "vendedor"],
      bilhete_classe: ["economica", "executiva"],
      conta_tipo: ["caixa", "banco"],
      continente: ["africa", "europa", "america", "asia", "oceania"],
      mov_tipo: [
        "carregamento_companhia",
        "emissao_bilhete",
        "pagamento_cliente",
        "transferencia_lucro",
        "despesa_operacional",
        "transferencia_interna",
        "aporte_capital",
      ],
      ticket_status: [
        "pedido_criado",
        "pendente",
        "pago",
        "emitido",
        "cancelado",
      ],
    },
  },
} as const
