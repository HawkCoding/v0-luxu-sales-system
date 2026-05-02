export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      audit_log_archives: {
        Row: {
          action: string
          actor: string
          actor_user_id: string | null
          after_json: Json | null
          archive_batch_id: string
          archived_at: string
          before_json: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          meta_json: Json | null
        }
        Insert: {
          action: string
          actor: string
          actor_user_id?: string | null
          after_json?: Json | null
          archive_batch_id?: string
          archived_at?: string
          before_json?: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          meta_json?: Json | null
        }
        Update: {
          action?: string
          actor?: string
          actor_user_id?: string | null
          after_json?: Json | null
          archive_batch_id?: string
          archived_at?: string
          before_json?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          meta_json?: Json | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor: string
          actor_user_id: string | null
          after_json: Json | null
          before_json: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          meta_json: Json | null
          overridden_by: string | null
          override_reason: string | null
        }
        Insert: {
          action: string
          actor: string
          actor_user_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          meta_json?: Json | null
          overridden_by?: string | null
          override_reason?: string | null
        }
        Update: {
          action?: string
          actor?: string
          actor_user_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          meta_json?: Json | null
          overridden_by?: string | null
          override_reason?: string | null
        }
        Relationships: []
      }
      booking_suites: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          suite_number: number
          suite_type_id: string | null
          suite_type_name: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          suite_number: number
          suite_type_id?: string | null
          suite_type_name?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          suite_number?: number
          suite_type_id?: string | null
          suite_type_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_suites_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_suites_suite_type_id_fkey"
            columns: ["suite_type_id"]
            isOneToOne: false
            referencedRelation: "suite_types"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_transport_requests: {
        Row: {
          booking_id: string
          created_at: string
          dropoff_point: string
          flight_number: string | null
          id: string
          luggage_count: number | null
          notes: string | null
          passenger_count: number | null
          pickup_at: string | null
          pickup_point: string
          return_at: string | null
          route_id: string | null
          service_type: string
          sort_order: number
          suite_type_id: string | null
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          dropoff_point: string
          flight_number?: string | null
          id?: string
          luggage_count?: number | null
          notes?: string | null
          passenger_count?: number | null
          pickup_at?: string | null
          pickup_point: string
          return_at?: string | null
          route_id?: string | null
          service_type: string
          sort_order?: number
          suite_type_id?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          dropoff_point?: string
          flight_number?: string | null
          id?: string
          luggage_count?: number | null
          notes?: string | null
          passenger_count?: number | null
          pickup_at?: string | null
          pickup_point?: string
          return_at?: string | null
          route_id?: string | null
          service_type?: string
          sort_order?: number
          suite_type_id?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_transport_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_transport_requests_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_transport_requests_suite_type_id_fkey"
            columns: ["suite_type_id"]
            isOneToOne: false
            referencedRelation: "suite_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_transport_requests_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          accepted_at: string | null
          additional_services: boolean
          additional_services_details: string | null
          booking_number: string
          cancel_reason: string | null
          cancelled_at: string | null
          child_ages: number[] | null
          closed_at: string | null
          consultant: string | null
          created_at: string
          customer_id: string
          departure_date: string | null
          deposit_paid: boolean
          deposit_paid_at: string | null
          deposit_requested_at: string | null
          duration_nights: number | null
          email_import_duplicate_of_booking_id: string | null
          email_import_mailbox: string | null
          email_import_missing_fields: string[]
          email_import_needs_review: boolean
          email_import_raw_preview: string | null
          email_import_received_at: string | null
          email_import_review_resolved_at: string | null
          email_import_review_resolved_by: string | null
          email_import_source_message_id: string | null
          email_import_subject: string | null
          email_import_warnings: string[]
          extend_stay: boolean
          extra_nights: number | null
          extracted_json: Json | null
          final_paid_at: string | null
          hotel_phase: Database["public"]["Enums"]["hotel_phase"]
          hotel_supplier_id: string | null
          id: string
          invoice_balance: number | null
          no_of_adults: number
          no_of_children: number
          no_of_suites: number
          owner_user_id: string | null
          package_id: string | null
          promotion_code: string | null
          purpose: Database["public"]["Enums"]["booking_purpose"]
          quote_sent_at: string | null
          raw_text: string | null
          refund_amount: number | null
          refund_reference: string | null
          refund_status: string | null
          refunded_at: string | null
          route_id: string | null
          source: Database["public"]["Enums"]["source_kind"]
          stage: Database["public"]["Enums"]["pipeline_stage"]
          terms_accepted: boolean
          updated_at: string
          voucher_sent_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          additional_services?: boolean
          additional_services_details?: string | null
          booking_number?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          child_ages?: number[] | null
          closed_at?: string | null
          consultant?: string | null
          created_at?: string
          customer_id: string
          departure_date?: string | null
          deposit_paid?: boolean
          deposit_paid_at?: string | null
          deposit_requested_at?: string | null
          duration_nights?: number | null
          email_import_duplicate_of_booking_id?: string | null
          email_import_mailbox?: string | null
          email_import_missing_fields?: string[]
          email_import_needs_review?: boolean
          email_import_raw_preview?: string | null
          email_import_received_at?: string | null
          email_import_review_resolved_at?: string | null
          email_import_review_resolved_by?: string | null
          email_import_source_message_id?: string | null
          email_import_subject?: string | null
          email_import_warnings?: string[]
          extend_stay?: boolean
          extra_nights?: number | null
          extracted_json?: Json | null
          final_paid_at?: string | null
          hotel_phase?: Database["public"]["Enums"]["hotel_phase"]
          hotel_supplier_id?: string | null
          id?: string
          invoice_balance?: number | null
          no_of_adults?: number
          no_of_children?: number
          no_of_suites?: number
          owner_user_id?: string | null
          package_id?: string | null
          promotion_code?: string | null
          purpose: Database["public"]["Enums"]["booking_purpose"]
          quote_sent_at?: string | null
          raw_text?: string | null
          refund_amount?: number | null
          refund_reference?: string | null
          refund_status?: string | null
          refunded_at?: string | null
          route_id?: string | null
          source?: Database["public"]["Enums"]["source_kind"]
          stage?: Database["public"]["Enums"]["pipeline_stage"]
          terms_accepted?: boolean
          updated_at?: string
          voucher_sent_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          additional_services?: boolean
          additional_services_details?: string | null
          booking_number?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          child_ages?: number[] | null
          closed_at?: string | null
          consultant?: string | null
          created_at?: string
          customer_id?: string
          departure_date?: string | null
          deposit_paid?: boolean
          deposit_paid_at?: string | null
          deposit_requested_at?: string | null
          duration_nights?: number | null
          email_import_duplicate_of_booking_id?: string | null
          email_import_mailbox?: string | null
          email_import_missing_fields?: string[]
          email_import_needs_review?: boolean
          email_import_raw_preview?: string | null
          email_import_received_at?: string | null
          email_import_review_resolved_at?: string | null
          email_import_review_resolved_by?: string | null
          email_import_source_message_id?: string | null
          email_import_subject?: string | null
          email_import_warnings?: string[]
          extend_stay?: boolean
          extra_nights?: number | null
          extracted_json?: Json | null
          final_paid_at?: string | null
          hotel_phase?: Database["public"]["Enums"]["hotel_phase"]
          hotel_supplier_id?: string | null
          id?: string
          invoice_balance?: number | null
          no_of_adults?: number
          no_of_children?: number
          no_of_suites?: number
          owner_user_id?: string | null
          package_id?: string | null
          promotion_code?: string | null
          purpose?: Database["public"]["Enums"]["booking_purpose"]
          quote_sent_at?: string | null
          raw_text?: string | null
          refund_amount?: number | null
          refund_reference?: string | null
          refund_status?: string | null
          refunded_at?: string | null
          route_id?: string | null
          source?: Database["public"]["Enums"]["source_kind"]
          stage?: Database["public"]["Enums"]["pipeline_stage"]
          terms_accepted?: boolean
          updated_at?: string
          voucher_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_email_import_duplicate_of_booking_id_fkey"
            columns: ["email_import_duplicate_of_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_email_import_source_message_id_fkey"
            columns: ["email_import_source_message_id"]
            isOneToOne: false
            referencedRelation: "inbound_email_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_hotel_supplier_id_fkey"
            columns: ["hotel_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      correspondences: {
        Row: {
          body_html: string | null
          booking_id: string
          channel: string
          created_at: string
          error: string | null
          id: string
          kind: string | null
          scheduled_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["correspondence_status"]
          subject: string
        }
        Insert: {
          body_html?: string | null
          booking_id: string
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          kind?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["correspondence_status"]
          subject: string
        }
        Update: {
          body_html?: string | null
          booking_id?: string
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          kind?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["correspondence_status"]
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "correspondences_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          created_at: string
          id: string
          iso_alpha2: string | null
          iso_alpha3: string | null
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          iso_alpha2?: string | null
          iso_alpha3?: string | null
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          iso_alpha2?: string | null
          iso_alpha3?: string | null
          name?: string
        }
        Relationships: []
      }
      country_aliases: {
        Row: {
          alias: string
          country_id: string
          created_at: string
          id: string
        }
        Insert: {
          alias: string
          country_id: string
          created_at?: string
          id?: string
        }
        Update: {
          alias?: string
          country_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "country_aliases_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_linked_accounts: {
        Row: {
          created_at: string
          customer_id: string
          email: string | null
          first_name: string | null
          id: string
          is_mirror: boolean
          last_name: string | null
          linked_customer_id: string | null
          phone: string | null
          relationship: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          email?: string | null
          first_name?: string | null
          id?: string
          is_mirror?: boolean
          last_name?: string | null
          linked_customer_id?: string | null
          phone?: string | null
          relationship?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          email?: string | null
          first_name?: string | null
          id?: string
          is_mirror?: boolean
          last_name?: string | null
          linked_customer_id?: string | null
          phone?: string | null
          relationship?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_linked_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_linked_accounts_linked_customer_id_fkey"
            columns: ["linked_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          country: string | null
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          notes: string | null
          phone: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          email: string
          first_name: string
          id?: string
          last_name: string
          notes?: string | null
          phone?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          notes?: string | null
          phone?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["document_kind"]
          status: Database["public"]["Enums"]["document_status"]
          storage_path: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["document_kind"]
          status?: Database["public"]["Enums"]["document_status"]
          storage_path?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["document_kind"]
          status?: Database["public"]["Enums"]["document_status"]
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_offers: {
        Row: {
          active: boolean
          created_at: string
          hotel_supplier_id: string
          id: string
          location_id: string
          package_id: string | null
          phase: Database["public"]["Enums"]["hotel_phase"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          hotel_supplier_id: string
          id?: string
          location_id: string
          package_id?: string | null
          phase: Database["public"]["Enums"]["hotel_phase"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          hotel_supplier_id?: string
          id?: string
          location_id?: string
          package_id?: string | null
          phase?: Database["public"]["Enums"]["hotel_phase"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_offers_hotel_supplier_id_fkey"
            columns: ["hotel_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_offers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_offers_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_email_accounts: {
        Row: {
          created_at: string
          email: string
          enabled: boolean
          first_sync_completed: boolean
          host: string
          id: string
          inbox_folder: string
          last_seen_uid: number
          last_synced_at: string | null
          last_uidvalidity: number | null
          needs_review_folder: string
          password_encrypted: string
          port: number
          processed_folder: string
          tls_mode: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          email: string
          enabled?: boolean
          first_sync_completed?: boolean
          host: string
          id?: string
          inbox_folder?: string
          last_seen_uid?: number
          last_synced_at?: string | null
          last_uidvalidity?: number | null
          needs_review_folder?: string
          password_encrypted: string
          port?: number
          processed_folder?: string
          tls_mode?: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          email?: string
          enabled?: boolean
          first_sync_completed?: boolean
          host?: string
          id?: string
          inbox_folder?: string
          last_seen_uid?: number
          last_synced_at?: string | null
          last_uidvalidity?: number | null
          needs_review_folder?: string
          password_encrypted?: string
          port?: number
          processed_folder?: string
          tls_mode?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      inbound_email_messages: {
        Row: {
          booking_id: string | null
          created_at: string
          email_account_id: string
          error: string | null
          filing_status: string
          from_address: string | null
          id: string
          message_id: string | null
          missing_fields: string[]
          raw_preview: string | null
          received_at: string | null
          status: string
          subject: string
          sync_run_id: string | null
          uid: number
          uidvalidity: number
          updated_at: string
          warnings: string[]
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          email_account_id: string
          error?: string | null
          filing_status?: string
          from_address?: string | null
          id?: string
          message_id?: string | null
          missing_fields?: string[]
          raw_preview?: string | null
          received_at?: string | null
          status?: string
          subject: string
          sync_run_id?: string | null
          uid: number
          uidvalidity: number
          updated_at?: string
          warnings?: string[]
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          email_account_id?: string
          error?: string | null
          filing_status?: string
          from_address?: string | null
          id?: string
          message_id?: string | null
          missing_fields?: string[]
          raw_preview?: string | null
          received_at?: string | null
          status?: string
          subject?: string
          sync_run_id?: string | null
          uid?: number
          uidvalidity?: number
          updated_at?: string
          warnings?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "inbound_email_messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_email_messages_email_account_id_fkey"
            columns: ["email_account_id"]
            isOneToOne: false
            referencedRelation: "inbound_email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_email_messages_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "inbound_email_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_email_rules: {
        Row: {
          active: boolean
          created_at: string
          id: string
          match_type: string
          name: string
          subject_pattern: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          match_type?: string
          name: string
          subject_pattern: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          match_type?: string
          name?: string
          subject_pattern?: string
          updated_at?: string
        }
        Relationships: []
      }
      inbound_email_sync_runs: {
        Row: {
          duplicate_count: number
          email_account_id: string | null
          error: string | null
          finished_at: string | null
          id: string
          imported_count: number
          needs_review_count: number
          scanned_count: number
          started_at: string
          status: string
        }
        Insert: {
          duplicate_count?: number
          email_account_id?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          imported_count?: number
          needs_review_count?: number
          scanned_count?: number
          started_at?: string
          status?: string
        }
        Update: {
          duplicate_count?: number
          email_account_id?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          imported_count?: number
          needs_review_count?: number
          scanned_count?: number
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_email_sync_runs_email_account_id_fkey"
            columns: ["email_account_id"]
            isOneToOne: false
            referencedRelation: "inbound_email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      itineraries: {
        Row: {
          accepted_at: string | null
          booking_id: string
          created_at: string
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          booking_id: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          booking_id?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "itineraries_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          country: string
          created_at: string
          id: string
          name: string
          region_code: string | null
          updated_at: string
        }
        Insert: {
          country?: string
          created_at?: string
          id?: string
          name: string
          region_code?: string | null
          updated_at?: string
        }
        Update: {
          country?: string
          created_at?: string
          id?: string
          name?: string
          region_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      package_leg_routes: {
        Row: {
          created_at: string
          package_leg_id: string
          route_id: string
        }
        Insert: {
          created_at?: string
          package_leg_id: string
          route_id: string
        }
        Update: {
          created_at?: string
          package_leg_id?: string
          route_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_leg_routes_package_leg_id_fkey"
            columns: ["package_leg_id"]
            isOneToOne: false
            referencedRelation: "package_legs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_leg_routes_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      package_legs: {
        Row: {
          created_at: string
          id: string
          label: string | null
          package_id: string
          sort_order: number
          supplier_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          package_id: string
          sort_order?: number
          supplier_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          package_id?: string
          sort_order?: number
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_legs_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_legs_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          description: string | null
          duration_nights: number | null
          fixed_price_per_person: number | null
          id: string
          name: string
          single_supplement_pct: number
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          duration_nights?: number | null
          fixed_price_per_person?: number | null
          id?: string
          name: string
          single_supplement_pct?: number
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          duration_nights?: number | null
          fixed_price_per_person?: number | null
          id?: string
          name?: string
          single_supplement_pct?: number
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          id: string
          method: string | null
          notes: string | null
          received_at: string
          reference: string | null
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          id?: string
          method?: string | null
          notes?: string | null
          received_at?: string
          reference?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          id?: string
          method?: string | null
          notes?: string | null
          received_at?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_history: {
        Row: {
          booking_id: string
          from_stage: Database["public"]["Enums"]["pipeline_stage"]
          id: string
          moved_at: string
          moved_by: string | null
          moved_by_user_id: string | null
          to_stage: Database["public"]["Enums"]["pipeline_stage"]
        }
        Insert: {
          booking_id: string
          from_stage: Database["public"]["Enums"]["pipeline_stage"]
          id?: string
          moved_at?: string
          moved_by?: string | null
          moved_by_user_id?: string | null
          to_stage: Database["public"]["Enums"]["pipeline_stage"]
        }
        Update: {
          booking_id?: string
          from_stage?: Database["public"]["Enums"]["pipeline_stage"]
          id?: string
          moved_at?: string
          moved_by?: string | null
          moved_by_user_id?: string | null
          to_stage?: Database["public"]["Enums"]["pipeline_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_history_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          clearance_level: Database["public"]["Enums"]["user_role"]
          created_at: string
          email: string
          is_active: boolean
          name: string
          surname: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          clearance_level?: Database["public"]["Enums"]["user_role"]
          created_at?: string
          email: string
          is_active?: boolean
          name: string
          surname?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          clearance_level?: Database["public"]["Enums"]["user_role"]
          created_at?: string
          email?: string
          is_active?: boolean
          name?: string
          surname?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quote_line_items: {
        Row: {
          created_at: string
          description: string
          id: string
          qty: number
          quote_id: string
          sort_order: number
          total: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          qty?: number
          quote_id: string
          sort_order?: number
          total?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          qty?: number
          quote_id?: string
          sort_order?: number
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_line_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          itinerary_id: string | null
          last_sent_at: string | null
          override_pin: string | null
          override_reason: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          total: number
          updated_at: string
          validity_until: string | null
          vat: number
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          itinerary_id?: string | null
          last_sent_at?: string | null
          override_pin?: string | null
          override_reason?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          validity_until?: string | null
          vat?: number
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          itinerary_id?: string | null
          last_sent_at?: string | null
          override_pin?: string | null
          override_reason?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          validity_until?: string | null
          vat?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_cards: {
        Row: {
          child_price: number | null
          created_at: string
          currency: string
          id: string
          infant_price: number | null
          price_per_person: number
          route_id: string
          suite_type_id: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          child_price?: number | null
          created_at?: string
          currency?: string
          id?: string
          infant_price?: number | null
          price_per_person: number
          route_id: string
          suite_type_id: string
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          child_price?: number | null
          created_at?: string
          currency?: string
          id?: string
          infant_price?: number | null
          price_per_person?: number
          route_id?: string
          suite_type_id?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rate_cards_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_cards_suite_type_id_fkey"
            columns: ["suite_type_id"]
            isOneToOne: false
            referencedRelation: "suite_types"
            referencedColumns: ["id"]
          },
        ]
      }
      report_snapshots: {
        Row: {
          created_at: string
          id: string
          metrics: Json
          period_end: string
          period_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          metrics?: Json
          period_end: string
          period_start: string
        }
        Update: {
          created_at?: string
          id?: string
          metrics?: Json
          period_end?: string
          period_start?: string
        }
        Relationships: []
      }
      routes: {
        Row: {
          active: boolean
          created_at: string
          destination_location_id: string | null
          dropoff_point: string | null
          extra_km_price: number | null
          id: string
          included_km_per_day: number | null
          name: string
          one_way_fee: number | null
          origin_location_id: string | null
          pickup_point: string | null
          security_deposit: number | null
          supplier_id: string
          transport_service_type: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          destination_location_id?: string | null
          dropoff_point?: string | null
          extra_km_price?: number | null
          id?: string
          included_km_per_day?: number | null
          name: string
          one_way_fee?: number | null
          origin_location_id?: string | null
          pickup_point?: string | null
          security_deposit?: number | null
          supplier_id: string
          transport_service_type?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          destination_location_id?: string | null
          dropoff_point?: string | null
          extra_km_price?: number | null
          id?: string
          included_km_per_day?: number | null
          name?: string
          one_way_fee?: number | null
          origin_location_id?: string | null
          pickup_point?: string | null
          security_deposit?: number | null
          supplier_id?: string
          transport_service_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routes_destination_location_id_fkey"
            columns: ["destination_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_origin_location_id_fkey"
            columns: ["origin_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suite_types: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          luggage_capacity: number | null
          name: string
          passenger_capacity: number | null
          supplier_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          luggage_capacity?: number | null
          name: string
          passenger_capacity?: number | null
          supplier_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          luggage_capacity?: number | null
          name?: string
          passenger_capacity?: number | null
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suite_types_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_email_labels: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      supplier_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          label: string
          supplier_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          label?: string
          supplier_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          label?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_emails_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_pricing_options: {
        Row: {
          created_at: string
          currency: string
          double_price: number
          family_price: number
          id: string
          is_primary: boolean
          name: string
          single_price: number
          supplier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          double_price: number
          family_price: number
          id?: string
          is_primary?: boolean
          name: string
          single_price: number
          supplier_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          double_price?: number
          family_price?: number
          id?: string
          is_primary?: boolean
          name?: string
          single_price?: number
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_pricing_options_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_seasonal_periods: {
        Row: {
          created_at: string
          id: string
          label: string | null
          supplier_id: string
          valid_from: string
          valid_to: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          supplier_id: string
          valid_from: string
          valid_to: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          supplier_id?: string
          valid_from?: string
          valid_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_seasonal_periods_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_seasonal_prices: {
        Row: {
          created_at: string
          double_price: number
          family_price: number
          id: string
          option_id: string
          period_id: string
          single_price: number
        }
        Insert: {
          created_at?: string
          double_price: number
          family_price: number
          id?: string
          option_id: string
          period_id: string
          single_price: number
        }
        Update: {
          created_at?: string
          double_price?: number
          family_price?: number
          id?: string
          option_id?: string
          period_id?: string
          single_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_seasonal_prices_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "supplier_pricing_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_seasonal_prices_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "supplier_seasonal_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          id: string
          kind: Database["public"]["Enums"]["supplier_kind"]
          location: string | null
          location_id: string | null
          name: string
          notes: string | null
          phone: string | null
          single_supplement_pct: number
          slug: string
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          kind: Database["public"]["Enums"]["supplier_kind"]
          location?: string | null
          location_id?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          single_supplement_pct?: number
          slug: string
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["supplier_kind"]
          location?: string | null
          location_id?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          single_supplement_pct?: number
          slug?: string
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          active: boolean
          body_html: string
          created_at: string
          id: string
          key: string
          subject: string
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          body_html: string
          created_at?: string
          id?: string
          key: string
          subject: string
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          body_html?: string
          created_at?: string
          id?: string
          key?: string
          subject?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      travellers: {
        Row: {
          booking_id: string
          created_at: string
          date_of_birth: string | null
          first_name: string
          id: string
          id_passport: string | null
          is_child: boolean
          last_name: string
          prefix: string | null
          sort_order: number
        }
        Insert: {
          booking_id: string
          created_at?: string
          date_of_birth?: string | null
          first_name: string
          id?: string
          id_passport?: string | null
          is_child?: boolean
          last_name: string
          prefix?: string | null
          sort_order?: number
        }
        Update: {
          booking_id?: string
          created_at?: string
          date_of_birth?: string | null
          first_name?: string
          id?: string
          id_passport?: string | null
          is_child?: boolean
          last_name?: string
          prefix?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "travellers_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      archive_old_audit_logs: { Args: { cutoff_date: string }; Returns: number }
      auth_has_role: {
        Args: { required_roles: Database["public"]["Enums"]["user_role"][] }
        Returns: boolean
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      replace_quote_line_items: {
        Args: {
          p_line_items: Json
          p_quote_id: string
          p_subtotal: number
          p_total: number
          p_vat: number
        }
        Returns: undefined
      }
    }
    Enums: {
      booking_purpose: "quote" | "availability" | "reservation"
      correspondence_status: "sent" | "failed" | "scheduled"
      document_kind:
        | "quote_pdf"
        | "invoice_pdf"
        | "voucher_pdf"
        | "summary_pdf"
        | "other"
      document_status: "required" | "received" | "generated" | "sent"
      hotel_phase: "pre" | "post" | "none"
      pipeline_stage:
        | "enquiry"
        | "quoted"
        | "quote_sent"
        | "accepted"
        | "deposit_requested"
        | "deposit_paid"
        | "final_paid"
        | "voucher_sent"
        | "closed"
        | "lost"
        | "form_done"
        | "payment_schedule"
        | "trip_active"
      quote_status:
        | "draft"
        | "pricing_incomplete"
        | "ready"
        | "sent"
        | "accepted"
      source_kind:
        | "web_form"
        | "paste_import"
        | "advertisement"
        | "walk_in"
        | "referral"
        | "social_media"
        | "phone_call"
        | "email"
        | "travel_agent"
      supplier_kind:
        | "train_operator"
        | "hotel_property"
        | "transfers"
        | "tour_operator"
        | "airline"
      user_role: "admin" | "manager" | "consultant" | "readonly"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      booking_purpose: ["quote", "availability", "reservation"],
      correspondence_status: ["sent", "failed", "scheduled"],
      document_kind: [
        "quote_pdf",
        "invoice_pdf",
        "voucher_pdf",
        "summary_pdf",
        "other",
      ],
      document_status: ["required", "received", "generated", "sent"],
      hotel_phase: ["pre", "post", "none"],
      pipeline_stage: [
        "enquiry",
        "quoted",
        "quote_sent",
        "accepted",
        "deposit_requested",
        "deposit_paid",
        "final_paid",
        "voucher_sent",
        "closed",
        "lost",
        "form_done",
        "payment_schedule",
        "trip_active",
      ],
      quote_status: [
        "draft",
        "pricing_incomplete",
        "ready",
        "sent",
        "accepted",
      ],
      source_kind: [
        "web_form",
        "paste_import",
        "advertisement",
        "walk_in",
        "referral",
        "social_media",
        "phone_call",
        "email",
        "travel_agent",
      ],
      supplier_kind: [
        "train_operator",
        "hotel_property",
        "transfers",
        "tour_operator",
        "airline",
      ],
      user_role: ["admin", "manager", "consultant", "readonly"],
    },
  },
} as const
