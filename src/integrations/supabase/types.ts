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
      account_transfers: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          from_account_id: string
          id: string
          notes: string | null
          status: string
          to_account_id: string
          transfer_date: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by?: string | null
          from_account_id: string
          id?: string
          notes?: string | null
          status?: string
          to_account_id: string
          transfer_date: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          from_account_id?: string
          id?: string
          notes?: string | null
          status?: string
          to_account_id?: string
          transfer_date?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_transfers_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_transfers_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_expense_allocations: {
        Row: {
          amount_cents: number
          campaign_id: string
          created_at: string
          created_by: string | null
          expense_id: string
          id: string
          notes: string | null
          remove_reason: string | null
          removed_at: string | null
          removed_by: string | null
          status: string
        }
        Insert: {
          amount_cents: number
          campaign_id: string
          created_at?: string
          created_by?: string | null
          expense_id: string
          id?: string
          notes?: string | null
          remove_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          status?: string
        }
        Update: {
          amount_cents?: number
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          expense_id?: string
          id?: string
          notes?: string | null
          remove_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_expense_allocations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_expense_allocations_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string | null
          external_code: string | null
          id: string
          name: string
          notes: string | null
          planned_budget_cents: number
          platform: string
          platform_label: string | null
          service_id: string | null
          service_label: string | null
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          external_code?: string | null
          id?: string
          name: string
          notes?: string | null
          planned_budget_cents?: number
          platform: string
          platform_label?: string | null
          service_id?: string | null
          service_label?: string | null
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          external_code?: string | null
          id?: string
          name?: string
          notes?: string | null
          planned_budget_cents?: number
          platform?: string
          platform_label?: string | null
          service_id?: string | null
          service_label?: string | null
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_payments: {
        Row: {
          account_id: string | null
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
          account_id?: string | null
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
          account_id?: string | null
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
            foreignKeyName: "customer_payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
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
      expense_payments: {
        Row: {
          account_id: string
          amount_cents: number
          created_at: string
          created_by: string | null
          expense_id: string
          id: string
          method: string
          notes: string | null
          paid_at: string
          receipt_path: string | null
          status: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          account_id: string
          amount_cents: number
          created_at?: string
          created_by?: string | null
          expense_id: string
          id?: string
          method: string
          notes?: string | null
          paid_at: string
          receipt_path?: string | null
          status?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          account_id?: string
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          expense_id?: string
          id?: string
          method?: string
          notes?: string | null
          paid_at?: string
          receipt_path?: string | null
          status?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_payments_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount_cents: number
          cancel_reason: string | null
          category_id: string | null
          competence_date: string
          created_at: string
          created_by: string | null
          description: string
          due_date: string
          id: string
          notes: string | null
          planned_account_id: string | null
          receipt_path: string | null
          recurring_id: string | null
          responsible: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          cancel_reason?: string | null
          category_id?: string | null
          competence_date: string
          created_at?: string
          created_by?: string | null
          description: string
          due_date: string
          id?: string
          notes?: string | null
          planned_account_id?: string | null
          receipt_path?: string | null
          recurring_id?: string | null
          responsible?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          cancel_reason?: string | null
          category_id?: string | null
          competence_date?: string
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string
          id?: string
          notes?: string | null
          planned_account_id?: string | null
          receipt_path?: string | null
          recurring_id?: string | null
          responsible?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_planned_account_id_fkey"
            columns: ["planned_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_expenses"
            referencedColumns: ["id"]
          },
        ]
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
      finance_categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      financial_accounts: {
        Row: {
          account_type: string
          active: boolean
          created_at: string
          holder: string | null
          id: string
          institution: string | null
          name: string
          opening_balance_cents: number
          opening_date: string
          ownership: string
          test_reset_batch: string | null
          updated_at: string
        }
        Insert: {
          account_type?: string
          active?: boolean
          created_at?: string
          holder?: string | null
          id?: string
          institution?: string | null
          name: string
          opening_balance_cents?: number
          opening_date?: string
          ownership?: string
          test_reset_batch?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: string
          active?: boolean
          created_at?: string
          holder?: string | null
          id?: string
          institution?: string | null
          name?: string
          opening_balance_cents?: number
          opening_date?: string
          ownership?: string
          test_reset_batch?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      lead_lost_reasons: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      leads: {
        Row: {
          bairro: string | null
          campaign_id: string | null
          cidade: string | null
          contacted_at: string
          converted_at: string | null
          created_at: string
          created_by: string | null
          creative_code: string | null
          customer_id: string | null
          equipment_type_id: string | null
          full_name: string
          id: string
          interest_label: string | null
          lost_notes: string | null
          lost_reason_id: string | null
          notes: string | null
          order_id: string | null
          origin: string
          phone: string | null
          phone_digits: string | null
          service_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          bairro?: string | null
          campaign_id?: string | null
          cidade?: string | null
          contacted_at?: string
          converted_at?: string | null
          created_at?: string
          created_by?: string | null
          creative_code?: string | null
          customer_id?: string | null
          equipment_type_id?: string | null
          full_name: string
          id?: string
          interest_label?: string | null
          lost_notes?: string | null
          lost_reason_id?: string | null
          notes?: string | null
          order_id?: string | null
          origin: string
          phone?: string | null
          phone_digits?: string | null
          service_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          bairro?: string | null
          campaign_id?: string | null
          cidade?: string | null
          contacted_at?: string
          converted_at?: string | null
          created_at?: string
          created_by?: string | null
          creative_code?: string | null
          customer_id?: string | null
          equipment_type_id?: string | null
          full_name?: string
          id?: string
          interest_label?: string | null
          lost_notes?: string | null
          lost_reason_id?: string | null
          notes?: string | null
          order_id?: string | null
          origin?: string
          phone?: string | null
          phone_digits?: string | null
          service_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_equipment_type_id_fkey"
            columns: ["equipment_type_id"]
            isOneToOne: false
            referencedRelation: "equipment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_lost_reason_id_fkey"
            columns: ["lost_reason_id"]
            isOneToOne: false
            referencedRelation: "lead_lost_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_closings: {
        Row: {
          closed_at: string
          closed_by: string | null
          id: string
          month: string
          notes: string | null
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          snapshot: Json
          status: string
        }
        Insert: {
          closed_at?: string
          closed_by?: string | null
          id?: string
          month: string
          notes?: string | null
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          snapshot?: Json
          status?: string
        }
        Update: {
          closed_at?: string
          closed_by?: string | null
          id?: string
          month?: string
          notes?: string | null
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          snapshot?: Json
          status?: string
        }
        Relationships: []
      }
      operation_resets: {
        Row: {
          actor_user_id: string | null
          batch: string
          counts: Json
          created_at: string
          id: string
          reason: string
        }
        Insert: {
          actor_user_id?: string | null
          batch: string
          counts: Json
          created_at?: string
          id?: string
          reason: string
        }
        Update: {
          actor_user_id?: string | null
          batch?: string
          counts?: Json
          created_at?: string
          id?: string
          reason?: string
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
      origin_corrections: {
        Row: {
          actor_user_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          new_campaign_id: string | null
          new_creative_code: string | null
          new_origin: string | null
          old_campaign_id: string | null
          old_creative_code: string | null
          old_origin: string | null
          reason: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          new_campaign_id?: string | null
          new_creative_code?: string | null
          new_origin?: string | null
          old_campaign_id?: string | null
          old_creative_code?: string | null
          old_origin?: string | null
          reason: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          new_campaign_id?: string | null
          new_creative_code?: string | null
          new_origin?: string | null
          old_campaign_id?: string | null
          old_creative_code?: string | null
          old_origin?: string | null
          reason?: string
        }
        Relationships: []
      }
      other_revenues: {
        Row: {
          account_id: string | null
          amount_cents: number
          category_id: string | null
          competence_date: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          method: string | null
          notes: string | null
          origin: string | null
          receipt_path: string | null
          received_at: string | null
          status: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          account_id?: string | null
          amount_cents: number
          category_id?: string | null
          competence_date: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          method?: string | null
          notes?: string | null
          origin?: string | null
          receipt_path?: string | null
          received_at?: string | null
          status?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          account_id?: string | null
          amount_cents?: number
          category_id?: string | null
          competence_date?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          method?: string | null
          notes?: string | null
          origin?: string | null
          receipt_path?: string | null
          received_at?: string | null
          status?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "other_revenues_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "other_revenues_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      part_purchases: {
        Row: {
          account_id: string | null
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
          account_id?: string | null
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
          account_id?: string | null
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
            foreignKeyName: "part_purchases_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
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
      partner_movements: {
        Row: {
          account_id: string
          amount_cents: number
          created_at: string
          created_by: string
          description: string
          id: string
          movement_date: string
          notes: string | null
          partner_id: string
          receipt_path: string | null
          status: string
          type: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          account_id: string
          amount_cents: number
          created_at?: string
          created_by?: string
          description: string
          id?: string
          movement_date: string
          notes?: string | null
          partner_id: string
          receipt_path?: string | null
          status?: string
          type: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          account_id?: string
          amount_cents?: number
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          movement_date?: string
          notes?: string | null
          partner_id?: string
          receipt_path?: string | null
          status?: string
          type?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_movements_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_movements_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      profit_distribution_payments: {
        Row: {
          account_id: string
          amount_cents: number
          created_at: string
          created_by: string
          distribution_id: string
          id: string
          notes: string | null
          paid_at: string
          partner_id: string
          receipt_path: string | null
          status: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          account_id: string
          amount_cents: number
          created_at?: string
          created_by?: string
          distribution_id: string
          id?: string
          notes?: string | null
          paid_at: string
          partner_id: string
          receipt_path?: string | null
          status?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          account_id?: string
          amount_cents?: number
          created_at?: string
          created_by?: string
          distribution_id?: string
          id?: string
          notes?: string | null
          paid_at?: string
          partner_id?: string
          receipt_path?: string | null
          status?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profit_distribution_payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_distribution_payments_distribution_id_fkey"
            columns: ["distribution_id"]
            isOneToOne: false
            referencedRelation: "profit_distributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_distribution_payments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profit_distributions: {
        Row: {
          created_at: string
          created_by: string
          decision_date: string
          id: string
          notes: string | null
          status: string
          total_cents: number
          validated_distributable: boolean
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          decision_date: string
          id?: string
          notes?: string | null
          status?: string
          total_cents: number
          validated_distributable?: boolean
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          decision_date?: string
          id?: string
          notes?: string | null
          status?: string
          total_cents?: number
          validated_distributable?: boolean
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
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
      recurring_expenses: {
        Row: {
          account_id: string | null
          amount_cents: number
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string
          frequency: string
          id: string
          next_due_date: string
          notes: string | null
          responsible: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          amount_cents: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          frequency: string
          id?: string
          next_due_date: string
          notes?: string | null
          responsible?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          amount_cents?: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          frequency?: string
          id?: string
          next_due_date?: string
          notes?: string | null
          responsible?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
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
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          bairro: string | null
          campaign_id: string | null
          cep: string | null
          cidade: string | null
          code: string
          complemento: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          creative_code: string | null
          customer_id: string
          endereco: string | null
          equipment_type_id: string | null
          estado: string | null
          estimated_minutes: number
          executed_at: string | null
          financial_confirmed_at: string | null
          id: string
          lead_id: string | null
          notes: string | null
          numero: string | null
          opened_at: string
          origin: string | null
          ponto_referencia: string | null
          reported_problem: string
          scheduled_start: string | null
          status: Database["public"]["Enums"]["order_status"]
          technician_id: string | null
          technician_reported_at: string | null
          technician_reported_by: string | null
          technician_reported_cents: number | null
          technician_reported_name: string | null
          technician_reported_parts: Json | null
          test_reset_batch: string | null
          updated_at: string
          visit_billable: boolean
        }
        Insert: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          bairro?: string | null
          campaign_id?: string | null
          cep?: string | null
          cidade?: string | null
          code?: string
          complemento?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          creative_code?: string | null
          customer_id: string
          endereco?: string | null
          equipment_type_id?: string | null
          estado?: string | null
          estimated_minutes?: number
          executed_at?: string | null
          financial_confirmed_at?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          numero?: string | null
          opened_at?: string
          origin?: string | null
          ponto_referencia?: string | null
          reported_problem?: string
          scheduled_start?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          technician_id?: string | null
          technician_reported_at?: string | null
          technician_reported_by?: string | null
          technician_reported_cents?: number | null
          technician_reported_name?: string | null
          technician_reported_parts?: Json | null
          test_reset_batch?: string | null
          updated_at?: string
          visit_billable?: boolean
        }
        Update: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          bairro?: string | null
          campaign_id?: string | null
          cep?: string | null
          cidade?: string | null
          code?: string
          complemento?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          creative_code?: string | null
          customer_id?: string
          endereco?: string | null
          equipment_type_id?: string | null
          estado?: string | null
          estimated_minutes?: number
          executed_at?: string | null
          financial_confirmed_at?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          numero?: string | null
          opened_at?: string
          origin?: string | null
          ponto_referencia?: string | null
          reported_problem?: string
          scheduled_start?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          technician_id?: string | null
          technician_reported_at?: string | null
          technician_reported_by?: string | null
          technician_reported_cents?: number | null
          technician_reported_name?: string | null
          technician_reported_parts?: Json | null
          test_reset_batch?: string | null
          updated_at?: string
          visit_billable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "service_orders_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_technician_reported_by_fkey"
            columns: ["technician_reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          account_id: string | null
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
          account_id?: string | null
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
          account_id?: string | null
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
            foreignKeyName: "technician_transfers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
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
      assert_company_account: { Args: { _id: string }; Returns: undefined }
      assert_month_open: { Args: { _d: string }; Returns: undefined }
      bootstrap_first_admin: { Args: never; Returns: undefined }
      complete_service_with_values: {
        Args: { _cents: number; _order: string; _parts: Json }
        Returns: undefined
      }
      confirm_service_composition: {
        Args: {
          _order: string
          _parts: number
          _reason: string
          _total: number
        }
        Returns: undefined
      }
      confirm_visit_composition: {
        Args: { _order: string; _reason: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      my_technician_id: { Args: never; Returns: string }
      operation_reset_preview: { Args: never; Returns: Json }
      order_in_test_reset: { Args: { _order: string }; Returns: boolean }
      remove_customer: { Args: { _id: string }; Returns: string }
      report_technician_value: {
        Args: { _cents: number; _order: string }
        Returns: undefined
      }
      reset_operation: { Args: { _reason: string }; Returns: Json }
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
        | "visita_concluida"
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
        "visita_concluida",
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
