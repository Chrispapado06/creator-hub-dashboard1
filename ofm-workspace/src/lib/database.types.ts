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
      databases: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          icon: string | null
          id: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          title?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "databases_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      db_properties: {
        Row: {
          config: Json
          created_at: string
          database_id: string
          id: string
          name: string
          position: number
          type: Database["public"]["Enums"]["db_property_type"]
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          database_id: string
          id?: string
          name?: string
          position?: number
          type?: Database["public"]["Enums"]["db_property_type"]
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          database_id?: string
          id?: string
          name?: string
          position?: number
          type?: Database["public"]["Enums"]["db_property_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "db_properties_database_id_fkey"
            columns: ["database_id"]
            isOneToOne: false
            referencedRelation: "databases"
            referencedColumns: ["id"]
          },
        ]
      }
      db_records: {
        Row: {
          created_at: string
          created_by: string | null
          database_id: string
          id: string
          position: number
          properties: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          database_id: string
          id?: string
          position?: number
          properties?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          database_id?: string
          id?: string
          position?: number
          properties?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "db_records_database_id_fkey"
            columns: ["database_id"]
            isOneToOne: false
            referencedRelation: "databases"
            referencedColumns: ["id"]
          },
        ]
      }
      db_views: {
        Row: {
          config: Json
          created_at: string
          database_id: string
          id: string
          name: string
          position: number
          type: Database["public"]["Enums"]["db_view_type"]
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          database_id: string
          id?: string
          name?: string
          position?: number
          type?: Database["public"]["Enums"]["db_view_type"]
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          database_id?: string
          id?: string
          name?: string
          position?: number
          type?: Database["public"]["Enums"]["db_view_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "db_views_database_id_fkey"
            columns: ["database_id"]
            isOneToOne: false
            referencedRelation: "databases"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["invite_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["invite_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["invite_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      page_favorites: {
        Row: {
          created_at: string
          page_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          page_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          page_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_favorites_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          archived_at: string | null
          content: Json
          created_at: string
          created_by: string | null
          icon: string | null
          id: string
          parent_id: string | null
          position: number
          public_token: string | null
          published: boolean
          published_at: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          parent_id?: string | null
          position?: number
          public_token?: string | null
          published?: boolean
          published_at?: string | null
          title?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          parent_id?: string | null
          position?: number
          public_token?: string | null
          published?: boolean
          published_at?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string | null
          icon: string | null
          id: string
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_my_invites: { Args: never; Returns: number }
      add_workspace_member_by_email: {
        Args: {
          p_email: string
          p_workspace: string
          p_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: string
      }
      can_manage_db: { Args: { p_db: string }; Returns: boolean }
      can_manage_profile: { Args: { p_id: string }; Returns: boolean }
      can_read_db: { Args: { p_db: string }; Returns: boolean }
      create_workspace: { Args: { p_name: string }; Returns: string }
      delete_workspace: { Args: { p_workspace: string }; Returns: undefined }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      db_workspace: { Args: { p_db: string }; Returns: string }
      is_active_member: { Args: { p_workspace: string }; Returns: boolean }
      is_active_member_any: { Args: never; Returns: boolean }
      is_manager_or_owner: { Args: { p_workspace: string }; Returns: boolean }
      is_owner: { Args: { p_workspace: string }; Returns: boolean }
      membership_role: {
        Args: { p_workspace: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      remove_workspace_member: {
        Args: { p_user: string; p_workspace: string }
        Returns: undefined
      }
      revoke_user_sessions: { Args: { p_user: string }; Returns: undefined }
      set_member_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user: string
          p_workspace: string
        }
        Returns: undefined
      }
      shares_workspace: { Args: { p_other: string }; Returns: boolean }
    }
    Enums: {
      app_role: "owner" | "manager" | "chatter"
      db_property_type:
        | "text"
        | "number"
        | "select"
        | "multi_select"
        | "date"
        | "checkbox"
        | "person"
        | "url"
        | "created_time"
        | "updated_time"
        | "relation"
      db_view_type: "table" | "board" | "calendar" | "gallery" | "list"
      invite_status: "pending" | "accepted" | "revoked" | "expired"
      membership_status: "active" | "deactivated"
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
      app_role: ["owner", "manager", "chatter"],
      db_property_type: [
        "text",
        "number",
        "select",
        "multi_select",
        "date",
        "checkbox",
        "person",
        "url",
        "created_time",
        "updated_time",
        "relation",
      ],
      db_view_type: ["table", "board", "calendar", "gallery", "list"],
      invite_status: ["pending", "accepted", "revoked", "expired"],
      membership_status: ["active", "deactivated"],
    },
  },
} as const
