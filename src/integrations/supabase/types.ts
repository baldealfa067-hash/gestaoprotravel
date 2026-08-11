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
          admin_pin: string | null
          agency_name: string
          capital_base_operacional: number
          created_at: string
          currency: string
          email: string | null
          endereco: string | null
          id: string
          logo_url: string | null
          nif: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          admin_pin?: string | null
          agency_name?: string
          capital_base_operacional?: number
          created_at?: string
          currency?: string
          email?: string | null
          endereco?: string | null
          id?: string
          logo_url?: string | null
          nif?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          admin_pin?: string | null
          agency_name?: string
          capital_base_operacional?: number
          created_at?: string
          currency?: string
          email?: string | null
          endereco?: string | null
          id?: string
          logo_url?: string | null
          nif?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bilhetes: {
        Row: {
          agency_id: string
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
          taxa_mudancas_total: number
          updated_at: string
          valor_cobrado: number
          vendedor_id: string
        }
        Insert: {
          agency_id?: string
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
          taxa_mudancas_total?: number
          updated_at?: string
          valor_cobrado?: number
          vendedor_id: string
        }
        Update: {
          agency_id?: string
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
          taxa_mudancas_total?: number
          updated_at?: string
          valor_cobrado?: number
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bilhetes_agency_fk"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agency_settings"
            referencedColumns: ["id"]
          },
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
          agency_id: string
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
          agency_id?: string
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
          agency_id?: string
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
        Relationships: [
          {
            foreignKeyName: "clientes_agency_fk"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agency_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      companhias_aereas: {
        Row: {
          agency_id: string
          alerta_minimo: number
          ativa: boolean
          codigo: string | null
          created_at: string
          id: string
          modo: string
          nome: string
          saldo: number
          ultimo_carregamento: string | null
          ultimo_consumo: string | null
          updated_at: string
        }
        Insert: {
          agency_id?: string
          alerta_minimo?: number
          ativa?: boolean
          codigo?: string | null
          created_at?: string
          id?: string
          modo?: string
          nome: string
          saldo?: number
          ultimo_carregamento?: string | null
          ultimo_consumo?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          alerta_minimo?: number
          ativa?: boolean
          codigo?: string | null
          created_at?: string
          id?: string
          modo?: string
          nome?: string
          saldo?: number
          ultimo_carregamento?: string | null
          ultimo_consumo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companhias_agency_fk"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agency_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_financeiras: {
        Row: {
          agency_id: string
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
          agency_id?: string
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
          agency_id?: string
          ativa?: boolean
          created_at?: string
          id?: string
          nome?: string
          saldo_inicial?: number
          sistema?: boolean
          tipo?: Database["public"]["Enums"]["conta_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_agency_fk"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agency_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      fundo_lucro: {
        Row: {
          agency_id: string
          id: string
          saldo: number
          updated_at: string
        }
        Insert: {
          agency_id: string
          id?: string
          saldo?: number
          updated_at?: string
        }
        Update: {
          agency_id?: string
          id?: string
          saldo?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fundo_agency_fk"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agency_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      movimentacoes_capital: {
        Row: {
          agency_id: string
          aplicar_saldo: boolean
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
          agency_id?: string
          aplicar_saldo?: boolean
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
          agency_id?: string
          aplicar_saldo?: boolean
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
            foreignKeyName: "movimentacoes_agency_fk"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agency_settings"
            referencedColumns: ["id"]
          },
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
      mudancas_rota: {
        Row: {
          agency_id: string
          bilhete_id: string | null
          classe_antiga: Database["public"]["Enums"]["bilhete_classe"] | null
          classe_nova: Database["public"]["Enums"]["bilhete_classe"] | null
          cliente_id: string | null
          created_at: string
          data_viagem_antiga: string | null
          data_viagem_nova: string | null
          id: string
          motivo: string | null
          reserva_id: string | null
          responsavel_id: string | null
          rota_antiga: string | null
          rota_nova: string | null
          taxa_mudanca: number
          updated_at: string
        }
        Insert: {
          agency_id?: string
          bilhete_id?: string | null
          classe_antiga?: Database["public"]["Enums"]["bilhete_classe"] | null
          classe_nova?: Database["public"]["Enums"]["bilhete_classe"] | null
          cliente_id?: string | null
          created_at?: string
          data_viagem_antiga?: string | null
          data_viagem_nova?: string | null
          id?: string
          motivo?: string | null
          reserva_id?: string | null
          responsavel_id?: string | null
          rota_antiga?: string | null
          rota_nova?: string | null
          taxa_mudanca: number
          updated_at?: string
        }
        Update: {
          agency_id?: string
          bilhete_id?: string | null
          classe_antiga?: Database["public"]["Enums"]["bilhete_classe"] | null
          classe_nova?: Database["public"]["Enums"]["bilhete_classe"] | null
          cliente_id?: string | null
          created_at?: string
          data_viagem_antiga?: string | null
          data_viagem_nova?: string | null
          id?: string
          motivo?: string | null
          reserva_id?: string | null
          responsavel_id?: string | null
          rota_antiga?: string | null
          rota_nova?: string | null
          taxa_mudanca?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mudancas_agency_fk"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agency_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mudancas_rota_bilhete_id_fkey"
            columns: ["bilhete_id"]
            isOneToOne: false
            referencedRelation: "bilhetes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mudancas_rota_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mudancas_rota_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "reservas"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          agency_id: string
          cargo: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          agency_id: string
          cargo?: string | null
          created_at?: string
          full_name?: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          cargo?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_agency_fk"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agency_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      reservas: {
        Row: {
          agency_id: string
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
          agency_id?: string
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
          agency_id?: string
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
            foreignKeyName: "reservas_agency_fk"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agency_settings"
            referencedColumns: ["id"]
          },
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
      superadmins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          agency_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_agency_fk"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agency_settings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ajustar_capital: {
        Args: { _motivo: string; _novo_valor: number; _target: string }
        Returns: undefined
      }
      calcular_taxa_agencia: {
        Args: {
          _classe: Database["public"]["Enums"]["bilhete_classe"]
          _custo: number
          _destino: Database["public"]["Enums"]["continente"]
          _origem: Database["public"]["Enums"]["continente"]
        }
        Returns: number
      }
      current_agency_id: { Args: never; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      definir_capital_circulante: {
        Args: { _novo_valor: number }
        Returns: {
          delta: number
          novo_saldo: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
      sincronizar_capital_base: {
        Args: never
        Returns: {
          delta: number
          novo_saldo_circulante: number
        }[]
      }
      verificar_consistencia_capital: {
        Args: never
        Returns: {
          capital_base: number
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
        | "pagamento_companhia"
        | "pagamento_taxa_mudanca"
        | "adianto_mudanca_rota"
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
        "pagamento_companhia",
        "pagamento_taxa_mudanca",
        "adianto_mudanca_rota",
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
