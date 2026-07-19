// Généré via `mcp__Supabase__generate_typescript_types` (projet fenuasim-travel-mvp).
// Régénérer après toute migration de schéma — ne pas éditer à la main.
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
      admin_users: {
        Row: {
          auth_user_id: string
          created_at: string
          deleted_at: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          last_login_at: string | null
          mfa_enabled: boolean
          role: Database["public"]["Enums"]["admin_role"]
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          deleted_at?: string | null
          email: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          mfa_enabled?: boolean
          role?: Database["public"]["Enums"]["admin_role"]
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          deleted_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          mfa_enabled?: boolean
          role?: Database["public"]["Enums"]["admin_role"]
          updated_at?: string
        }
        Relationships: []
      }
      answers: {
        Row: {
          answer_value: Json
          created_at: string
          deleted_at: string | null
          id: string
          question_key: string
          question_label_snapshot: string | null
          questionnaire_id: string
          travel_request_id: string
          traveler_id: string
          updated_at: string
        }
        Insert: {
          answer_value: Json
          created_at?: string
          deleted_at?: string | null
          id?: string
          question_key: string
          question_label_snapshot?: string | null
          questionnaire_id: string
          travel_request_id: string
          traveler_id: string
          updated_at?: string
        }
        Update: {
          answer_value?: Json
          created_at?: string
          deleted_at?: string | null
          id?: string
          question_key?: string
          question_label_snapshot?: string | null
          questionnaire_id?: string
          travel_request_id?: string
          traveler_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "answers_questionnaire_id_fkey"
            columns: ["questionnaire_id"]
            isOneToOne: false
            referencedRelation: "questionnaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_travel_request_id_fkey"
            columns: ["travel_request_id"]
            isOneToOne: false
            referencedRelation: "travel_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_traveler_id_fkey"
            columns: ["traveler_id"]
            isOneToOne: false
            referencedRelation: "travelers"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          auth_user_id: string | null
          created_at: string
          deleted_at: string | null
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          locale: string
          marketing_opt_in: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          locale?: string
          marketing_opt_in?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          locale?: string
          marketing_opt_in?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          capture_method: Database["public"]["Enums"]["capture_method"]
          created_at: string
          deleted_at: string | null
          document_type: Database["public"]["Enums"]["document_type"]
          file_size_bytes: number | null
          id: string
          mime_type: string
          ocr_processed_at: string | null
          scheduled_deletion_at: string | null
          storage_bucket: string
          storage_path: string
          travel_request_id: string
          traveler_id: string | null
          updated_at: string
        }
        Insert: {
          capture_method: Database["public"]["Enums"]["capture_method"]
          created_at?: string
          deleted_at?: string | null
          document_type?: Database["public"]["Enums"]["document_type"]
          file_size_bytes?: number | null
          id?: string
          mime_type: string
          ocr_processed_at?: string | null
          scheduled_deletion_at?: string | null
          storage_bucket?: string
          storage_path: string
          travel_request_id: string
          traveler_id?: string | null
          updated_at?: string
        }
        Update: {
          capture_method?: Database["public"]["Enums"]["capture_method"]
          created_at?: string
          deleted_at?: string | null
          document_type?: Database["public"]["Enums"]["document_type"]
          file_size_bytes?: number | null
          id?: string
          mime_type?: string
          ocr_processed_at?: string | null
          scheduled_deletion_at?: string | null
          storage_bucket?: string
          storage_path?: string
          travel_request_id?: string
          traveler_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_travel_request_id_fkey"
            columns: ["travel_request_id"]
            isOneToOne: false
            referencedRelation: "travel_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_traveler_id_fkey"
            columns: ["traveler_id"]
            isOneToOne: false
            referencedRelation: "travelers"
            referencedColumns: ["id"]
          },
        ]
      }
      mandates: {
        Row: {
          accepted_at: string
          content_snapshot: string
          created_at: string
          customer_id: string
          deleted_at: string | null
          id: string
          ip_address: unknown
          proof_hash: string | null
          signer_full_name: string
          travel_request_id: string
          updated_at: string
          user_agent: string | null
          version: string
        }
        Insert: {
          accepted_at?: string
          content_snapshot: string
          created_at?: string
          customer_id: string
          deleted_at?: string | null
          id?: string
          ip_address?: unknown
          proof_hash?: string | null
          signer_full_name: string
          travel_request_id: string
          updated_at?: string
          user_agent?: string | null
          version: string
        }
        Update: {
          accepted_at?: string
          content_snapshot?: string
          created_at?: string
          customer_id?: string
          deleted_at?: string | null
          id?: string
          ip_address?: unknown
          proof_hash?: string | null
          signer_full_name?: string
          travel_request_id?: string
          updated_at?: string
          user_agent?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "mandates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mandates_travel_request_id_fkey"
            columns: ["travel_request_id"]
            isOneToOne: false
            referencedRelation: "travel_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          deleted_at: string | null
          fx_rate_eur_xpf: number | null
          fx_rate_usd_eur: number | null
          id: string
          idempotency_key: string
          metadata: Json
          official_fee_amount: number
          official_fee_amount_usd_cents: number
          payment_method_type: string | null
          refund_reason: string | null
          refunded_amount_cents: number
          refunded_at: string | null
          service_fee_amount: number
          status: Database["public"]["Enums"]["payment_status"]
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          travel_request_id: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          deleted_at?: string | null
          fx_rate_eur_xpf?: number | null
          fx_rate_usd_eur?: number | null
          id?: string
          idempotency_key: string
          metadata?: Json
          official_fee_amount: number
          official_fee_amount_usd_cents: number
          payment_method_type?: string | null
          refund_reason?: string | null
          refunded_amount_cents?: number
          refunded_at?: string | null
          service_fee_amount: number
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          travel_request_id: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          deleted_at?: string | null
          fx_rate_eur_xpf?: number | null
          fx_rate_usd_eur?: number | null
          id?: string
          idempotency_key?: string
          metadata?: Json
          official_fee_amount?: number
          official_fee_amount_usd_cents?: number
          payment_method_type?: string | null
          refund_reason?: string | null
          refunded_amount_cents?: number
          refunded_at?: string | null
          service_fee_amount?: number
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          travel_request_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_travel_request_id_fkey"
            columns: ["travel_request_id"]
            isOneToOne: false
            referencedRelation: "travel_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_scan_sessions: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          status: string
          token_hash: string
          travel_request_id: string
          updated_at: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          status?: string
          token_hash: string
          travel_request_id: string
          updated_at?: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          status?: string
          token_hash?: string
          travel_request_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_scan_sessions_travel_request_id_fkey"
            columns: ["travel_request_id"]
            isOneToOne: false
            referencedRelation: "travel_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      questionnaires: {
        Row: {
          created_at: string
          deleted_at: string | null
          destination_code: Database["public"]["Enums"]["destination_code"]
          id: string
          is_active: boolean
          schema_json: Json
          title: string | null
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          destination_code?: Database["public"]["Enums"]["destination_code"]
          id?: string
          is_active?: boolean
          schema_json: Json
          title?: string | null
          updated_at?: string
          version: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          destination_code?: Database["public"]["Enums"]["destination_code"]
          id?: string
          is_active?: boolean
          schema_json?: Json
          title?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      timeline: {
        Row: {
          actor_id: string | null
          actor_type: Database["public"]["Enums"]["actor_type"]
          created_at: string
          event_type: Database["public"]["Enums"]["timeline_event_type"]
          from_status:
            | Database["public"]["Enums"]["travel_request_status"]
            | null
          id: string
          message: string | null
          metadata: Json
          to_status: Database["public"]["Enums"]["travel_request_status"] | null
          travel_request_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_type: Database["public"]["Enums"]["actor_type"]
          created_at?: string
          event_type: Database["public"]["Enums"]["timeline_event_type"]
          from_status?:
            | Database["public"]["Enums"]["travel_request_status"]
            | null
          id?: string
          message?: string | null
          metadata?: Json
          to_status?:
            | Database["public"]["Enums"]["travel_request_status"]
            | null
          travel_request_id: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: Database["public"]["Enums"]["actor_type"]
          created_at?: string
          event_type?: Database["public"]["Enums"]["timeline_event_type"]
          from_status?:
            | Database["public"]["Enums"]["travel_request_status"]
            | null
          id?: string
          message?: string | null
          metadata?: Json
          to_status?:
            | Database["public"]["Enums"]["travel_request_status"]
            | null
          travel_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_travel_request_id_fkey"
            columns: ["travel_request_id"]
            isOneToOne: false
            referencedRelation: "travel_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_requests: {
        Row: {
          closed_at: string | null
          created_at: string
          customer_id: string
          deleted_at: string | null
          destination_code: Database["public"]["Enums"]["destination_code"]
          id: string
          price_amount_cents: number
          source_platform: string | null
          status: Database["public"]["Enums"]["travel_request_status"]
          submitted_at: string | null
          traveler_count: number
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          customer_id: string
          deleted_at?: string | null
          destination_code?: Database["public"]["Enums"]["destination_code"]
          id?: string
          price_amount_cents: number
          source_platform?: string | null
          status?: Database["public"]["Enums"]["travel_request_status"]
          submitted_at?: string | null
          traveler_count?: number
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          customer_id?: string
          deleted_at?: string | null
          destination_code?: Database["public"]["Enums"]["destination_code"]
          id?: string
          price_amount_cents?: number
          source_platform?: string | null
          status?: Database["public"]["Enums"]["travel_request_status"]
          submitted_at?: string | null
          traveler_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      travelers: {
        Row: {
          created_at: string
          data_validated_at: string | null
          data_validated_by_customer: boolean
          date_of_birth: string | null
          deleted_at: string | null
          encryption_key_version: number
          esta_application_number: string | null
          esta_outcome: Database["public"]["Enums"]["esta_outcome"]
          first_name: string | null
          id: string
          last_name: string | null
          mrz_encrypted: string | null
          nationality: string | null
          ocr_confidence_score: number | null
          ocr_status: Database["public"]["Enums"]["ocr_status"]
          passport_expiry_date: string | null
          passport_issuing_country: string | null
          passport_number_encrypted: string | null
          passport_number_last4: string | null
          sex: string | null
          travel_request_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_validated_at?: string | null
          data_validated_by_customer?: boolean
          date_of_birth?: string | null
          deleted_at?: string | null
          encryption_key_version?: number
          esta_application_number?: string | null
          esta_outcome?: Database["public"]["Enums"]["esta_outcome"]
          first_name?: string | null
          id?: string
          last_name?: string | null
          mrz_encrypted?: string | null
          nationality?: string | null
          ocr_confidence_score?: number | null
          ocr_status?: Database["public"]["Enums"]["ocr_status"]
          passport_expiry_date?: string | null
          passport_issuing_country?: string | null
          passport_number_encrypted?: string | null
          passport_number_last4?: string | null
          sex?: string | null
          travel_request_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_validated_at?: string | null
          data_validated_by_customer?: boolean
          date_of_birth?: string | null
          deleted_at?: string | null
          encryption_key_version?: number
          esta_application_number?: string | null
          esta_outcome?: Database["public"]["Enums"]["esta_outcome"]
          first_name?: string | null
          id?: string
          last_name?: string | null
          mrz_encrypted?: string | null
          nationality?: string | null
          ocr_confidence_score?: number | null
          ocr_status?: Database["public"]["Enums"]["ocr_status"]
          passport_expiry_date?: string | null
          passport_issuing_country?: string | null
          passport_number_encrypted?: string | null
          passport_number_last4?: string | null
          sex?: string | null
          travel_request_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "travelers_travel_request_id_fkey"
            columns: ["travel_request_id"]
            isOneToOne: false
            referencedRelation: "travel_requests"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      actor_type: "customer" | "admin" | "system"
      admin_role: "operator" | "admin" | "superadmin"
      capture_method: "camera_mobile" | "qr_scan" | "desktop_upload"
      destination_code: "ESTA_US"
      document_type: "passport_photo" | "selfie" | "other"
      esta_outcome:
        | "pending"
        | "accepted"
        | "rejected"
        | "additional_info_requested"
      ocr_status: "pending" | "success" | "low_confidence" | "failed" | "manual"
      payment_status:
        | "pending"
        | "requires_action"
        | "succeeded"
        | "failed"
        | "refunded"
        | "partially_refunded"
        | "cancelled"
      timeline_event_type:
        | "status_change"
        | "note"
        | "document_uploaded"
        | "ocr_processed"
        | "payment_event"
        | "mandate_signed"
        | "admin_action"
        | "system_event"
        | "email_sent"
      travel_request_status:
        | "draft"
        | "scan_pending"
        | "ocr_done"
        | "to_verify"
        | "payment_pending"
        | "paid"
        | "to_submit"
        | "submitted"
        | "additional_info_requested"
        | "accepted"
        | "rejected"
        | "cancelled"
        | "refunded"
        | "closed"
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
      actor_type: ["customer", "admin", "system"],
      admin_role: ["operator", "admin", "superadmin"],
      capture_method: ["camera_mobile", "qr_scan", "desktop_upload"],
      destination_code: ["ESTA_US"],
      document_type: ["passport_photo", "selfie", "other"],
      esta_outcome: [
        "pending",
        "accepted",
        "rejected",
        "additional_info_requested",
      ],
      ocr_status: ["pending", "success", "low_confidence", "failed", "manual"],
      payment_status: [
        "pending",
        "requires_action",
        "succeeded",
        "failed",
        "refunded",
        "partially_refunded",
        "cancelled",
      ],
      timeline_event_type: [
        "status_change",
        "note",
        "document_uploaded",
        "ocr_processed",
        "payment_event",
        "mandate_signed",
        "admin_action",
        "system_event",
        "email_sent",
      ],
      travel_request_status: [
        "draft",
        "scan_pending",
        "ocr_done",
        "to_verify",
        "payment_pending",
        "paid",
        "to_submit",
        "submitted",
        "additional_info_requested",
        "accepted",
        "rejected",
        "cancelled",
        "refunded",
        "closed",
      ],
    },
  },
} as const
