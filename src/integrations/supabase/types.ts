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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      customer_payments: {
        Row: {
          amount_cents: number
          authorized_reason: string | null
          created_at: string
          created_by: string | null
          destination_account: string | null
          id: string
          method: string
          notes: string | null
          order_id: string
          paid_at: string
          receipt_path: string | null
          receiver_label: string | null
          receiver_technician_id: string | null
          receiver_type: string
          status: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount_cents: number
          authorized_reason?: string | null
          created_at?: string
          created_by?: string | null
          destination_account?: string | null
          id?: string
          method: string
          notes?: string | null
          order_id: string
          paid_at: string
          receipt_path?: string | null
          receiver_label?: string | null
          receiver_technician_id?: string | null
          receiver_type: string
          status?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount_cents?: number
          authorized_reason?: string | null
          created_at?: string
          created_by?: string | null
          destination_account?: string | null
          id?: string
          method?: string
          notes?: string | null
          order_id?: string
          paid_at?: string
          receipt_path?: string | null
          receiver_label?: string | null
          receiver_technician_id?: string | null
          receiver_type?: string
          status?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_receiver_technician_id_fkey"
            columns: ["receiver_technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          active: boolean
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          created_at: string
          email: string | null
          endereco: string | null
          estado: string | null
          full_name: string
          id: string
          numero: string | null
          phone: string | null
          ponto_referencia: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string | null
          full_name: string
          id?: string
          numero?: string | null
          phone?: string | null
          ponto_referencia?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string | null
          full_name?: string
          id?: string
          numero?: string | null
          phone?: string | null
          ponto_referencia?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      equipment_types: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      finance_audit: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      order_financials: {
        Row: {
          company_share_cents: number
          created_at: string
          created_by: string | null
          id: string
          kind: string
          labor_cents: number
          order_id: string
          parts_estimated_cents: number
          quote_id: string | null
          receiver_label: string | null
          receiver_type: string | null
          rule_company_fixed_cents: number | null
          rule_company_percent: number | null
          rule_technician_fixed_cents: number | null
          rule_technician_percent: number | null
          status: string
          technician_share_cents: number
          total_cents: number
          updated_at: string
        }
        Insert: {
          company_share_cents?: number
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          labor_cents?: number
          order_id: string
          parts_estimated_cents?: number
          quote_id?: string | null
          receiver_label?: string | null
          receiver_type?: string | null
          rule_company_fixed_cents?: number | null
          rule_company_percent?: number | null
          rule_technician_fixed_cents?: number | null
          rule_technician_percent?: number | null
          status?: string
          technician_share_cents?: number
          total_cents?: number
          updated_at?: string
        }
        Update: {
          company_share_cents?: number
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          labor_cents?: number
          order_id?: string
          parts_estimated_cents?: number
          quote_id?: string | null
          receiver_label?: string | null
          receiver_type?: string | null
          rule_company_fixed_cents?: number | null
          rule_company_percent?: number | null
          rule_technician_fixed_cents?: number | null
          rule_technician_percent?: number | null
          status?: string
          technician_share_cents?: number
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_financials_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_financials_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      part_purchases: {
        Row: {
          buyer_label: string | null
          buyer_technician_id: string | null
          buyer_type: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          notes: string | null
          order_id: string
          purchased_at: string
          quantity: number
          quote_part_id: string | null
          receipt_url: string | null
          total_cents: number
          unit_price_cents: number
        }
        Insert: {
          buyer_label?: string | null
          buyer_technician_id?: string | null
          buyer_type: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          notes?: string | null
          order_id: string
          purchased_at?: string
          quantity?: number
          quote_part_id?: string | null
          receipt_url?: string | null
          total_cents?: number
          unit_price_cents?: number
        }
        Update: {
          buyer_label?: string | null
          buyer_technician_id?: string | null
          buyer_type?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          notes?: string | null
          order_id?: string
          purchased_at?: string
          quantity?: number
          quote_part_id?: string | null
          receipt_url?: string | null
          total_cents?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "part_purchases_buyer_technician_id_fkey"
            columns: ["buyer_technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_purchases_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_purchases_quote_part_id_fkey"
            columns: ["quote_part_id"]
            isOneToOne: false
            referencedRelation: "quote_parts"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_audit: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          new_value: string | null
          old_value: string | null
          target_user_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          target_user_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          target_user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          theme: Database["public"]["Enums"]["theme_pref"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          phone?: string | null
          theme?: Database["public"]["Enums"]["theme_pref"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          theme?: Database["public"]["Enums"]["theme_pref"]
          updated_at?: string
        }
        Relationships: []
      }
      quote_parts: {
        Row: {
          description: string
          id: string
          quantity: number
          quote_id: string
          total_cents: number
          unit_price_cents: number
        }
        Insert: {
          description: string
          id?: string
          quantity?: number
          quote_id: string
          total_cents?: number
          unit_price_cents?: number
        }
        Update: {
          description?: string
          id?: string
          quantity?: number
          quote_id?: string
          total_cents?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_parts_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          labor_cents: number
          notes: string | null
          order_id: string
          parts_total_cents: number
          status: Database["public"]["Enums"]["quote_status"]
          total_cents: number
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          labor_cents?: number
          notes?: string | null
          order_id: string
          parts_total_cents?: number
          status?: Database["public"]["Enums"]["quote_status"]
          total_cents?: number
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          labor_cents?: number
          notes?: string | null
          order_id?: string
          parts_total_cents?: number
          status?: Database["public"]["Enums"]["quote_status"]
          total_cents?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_events: {
        Row: {
          actor_name: string | null
          actor_user_id: string | null
          created_at: string
          description: string
          event_type: string
          id: string
          order_id: string
        }
        Insert: {
          actor_name?: string | null
          actor_user_id?: string | null
          created_at?: string
          description: string
          event_type: string
          id?: string
          order_id: string
        }
        Update: {
          actor_name?: string | null
          actor_user_id?: string | null
          created_at?: string
          description?: string
          event_type?: string
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          code: string
          complemento: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          endereco: string | null
          equipment_type_id: string | null
          estado: string | null
          estimated_minutes: number
          executed_at: string | null
          id: string
          notes: string | null
          numero: string | null
          opened_at: string
          ponto_referencia: string | null
          reported_problem: string
          scheduled_start: string | null
          status: Database["public"]["Enums"]["order_status"]
          technician_id: string | null
          updated_at: string
          visit_billable: boolean
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          code?: string
          complemento?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          endereco?: string | null
          equipment_type_id?: string | null
          estado?: string | null
          estimated_minutes?: number
          executed_at?: string | null
          id?: string
          notes?: string | null
          numero?: string | null
          opened_at?: string
          ponto_referencia?: string | null
          reported_problem?: string
          scheduled_start?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          technician_id?: string | null
          updated_at?: string
          visit_billable?: boolean
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          code?: string
          complemento?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          endereco?: string | null
          equipment_type_id?: string | null
          estado?: string | null
          estimated_minutes?: number
          executed_at?: string | null
          id?: string
          notes?: string | null
          numero?: string | null
          opened_at?: string
          ponto_referencia?: string | null
          reported_problem?: string
          scheduled_start?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          technician_id?: string | null
          updated_at?: string
          visit_billable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_equipment_type_id_fkey"
            columns: ["equipment_type_id"]
            isOneToOne: false
            referencedRelation: "equipment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          created_at: string
          equipment_type_id: string | null
          id: string
          name: string
          suggested_price_cents: number | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          equipment_type_id?: string | null
          id?: string
          name: string
          suggested_price_cents?: number | null
        }
        Update: {
          active?: boolean
          created_at?: string
          equipment_type_id?: string | null
          id?: string
          name?: string
          suggested_price_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "services_equipment_type_id_fkey"
            columns: ["equipment_type_id"]
            isOneToOne: false
            referencedRelation: "equipment_types"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_closings: {
        Row: {
          client_pending_cents: number
          closed_at: string
          closed_by: string | null
          company_share_cents: number
          id: string
          notes: string | null
          pending_cents: number
          period_end: string
          period_start: string
          received_cents: number
          reimbursement_cents: number
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          settled_cents: number
          status: string
          technician_id: string
          technician_share_cents: number
          to_pay_technician_cents: number
          to_receive_technician_cents: number
        }
        Insert: {
          client_pending_cents?: number
          closed_at?: string
          closed_by?: string | null
          company_share_cents?: number
          id?: string
          notes?: string | null
          pending_cents?: number
          period_end: string
          period_start: string
          received_cents?: number
          reimbursement_cents?: number
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          settled_cents?: number
          status: string
          technician_id: string
          technician_share_cents?: number
          to_pay_technician_cents?: number
          to_receive_technician_cents?: number
        }
        Update: {
          client_pending_cents?: number
          closed_at?: string
          closed_by?: string | null
          company_share_cents?: number
          id?: string
          notes?: string | null
          pending_cents?: number
          period_end?: string
          period_start?: string
          received_cents?: number
          reimbursement_cents?: number
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          settled_cents?: number
          status?: string
          technician_id?: string
          technician_share_cents?: number
          to_pay_technician_cents?: number
          to_receive_technician_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "settlement_closings_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      split_rules: {
        Row: {
          company_fixed_cents: number | null
          company_percent: number | null
          created_at: string
          id: string
          kind: string
          technician_fixed_cents: number | null
          technician_percent: number | null
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          company_fixed_cents?: number | null
          company_percent?: number | null
          created_at?: string
          id?: string
          kind: string
          technician_fixed_cents?: number | null
          technician_percent?: number | null
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          company_fixed_cents?: number | null
          company_percent?: number | null
          created_at?: string
          id?: string
          kind?: string
          technician_fixed_cents?: number | null
          technician_percent?: number | null
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      technician_transfers: {
        Row: {
          amount_cents: number
          authorized_reason: string | null
          created_at: string
          created_by: string | null
          destination_account: string | null
          direction: string
          id: string
          method: string
          notes: string | null
          order_ids: string[]
          payer_label: string | null
          receipt_path: string | null
          receiver_label: string | null
          source_account: string | null
          status: string
          technician_id: string
          transfer_date: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount_cents: number
          authorized_reason?: string | null
          created_at?: string
          created_by?: string | null
          destination_account?: string | null
          direction: string
          id?: string
          method: string
          notes?: string | null
          order_ids?: string[]
          payer_label?: string | null
          receipt_path?: string | null
          receiver_label?: string | null
          source_account?: string | null
          status?: string
          technician_id: string
          transfer_date: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount_cents?: number
          authorized_reason?: string | null
          created_at?: string
          created_by?: string | null
          destination_account?: string | null
          direction?: string
          id?: string
          method?: string
          notes?: string | null
          order_ids?: string[]
          payer_label?: string | null
          receipt_path?: string | null
          receiver_label?: string | null
          source_account?: string | null
          status?: string
          technician_id?: string
          transfer_date?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "technician_transfers_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      technicians: {
        Row: {
          active: boolean
          bairro: string | null
          cidade: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          profile_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          bairro?: string | null
          cidade?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          profile_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          bairro?: string | null
          cidade?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          profile_id?: string | null
          updated_at?: string
        }
        Relationships: []
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
      active_admin_count: { Args: never; Returns: number }
      admin_exists: { Args: never; Returns: boolean }
      bootstrap_first_admin: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      my_technician_id: { Args: never; Returns: string }
      set_user_active: {
        Args: { _active: boolean; _target: string }
        Returns: undefined
      }
      set_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _target: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "tecnico"
      order_status:
        | "novo"
        | "aguardando_agendamento"
        | "visita_agendada"
        | "tecnico_a_caminho"
        | "em_diagnostico"
        | "orcamento_enviado"
        | "aguardando_aprovacao"
        | "orcamento_aprovado"
        | "orcamento_recusado"
        | "aguardando_peca"
        | "servico_em_andamento"
        | "servico_concluido"
        | "aguardando_pagamento"
        | "finalizado"
        | "cancelado"
      quote_status:
        | "rascunho"
        | "enviado"
        | "aprovado"
        | "recusado"
        | "substituido"
      theme_pref: "light" | "dark" | "system"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "tecnico"],
      order_status: [
        "novo",
        "aguardando_agendamento",
        "visita_agendada",
        "tecnico_a_caminho",
        "em_diagnostico",
        "orcamento_enviado",
        "aguardando_aprovacao",
        "orcamento_aprovado",
        "orcamento_recusado",
        "aguardando_peca",
        "servico_em_andamento",
        "servico_concluido",
        "aguardando_pagamento",
        "finalizado",
        "cancelado",
      ],
      quote_status: [
        "rascunho",
        "enviado",
        "aprovado",
        "recusado",
        "substituido",
      ],
      theme_pref: ["light", "dark", "system"],
    },
  },
} as const
