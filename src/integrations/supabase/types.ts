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
      creators: {
        Row: {
          created_at: string
          id: string
          name: string
          of_username: string | null
          avatar_url: string | null
          onlyfansapi_acct_id: string | null
          status: Database["public"]["Enums"]["creator_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          of_username?: string | null
          avatar_url?: string | null
          onlyfansapi_acct_id?: string | null
          status?: Database["public"]["Enums"]["creator_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          of_username?: string | null
          avatar_url?: string | null
          onlyfansapi_acct_id?: string | null
          status?: Database["public"]["Enums"]["creator_status"]
          updated_at?: string
        }
        Relationships: []
      }
      posts: {
        Row: {
          comments: number
          created_at: string
          id: string
          post_id: string
          posted_at: string
          reddit_account_id: string
          subreddit: string
          title: string
          upvotes: number
          url: string
        }
        Insert: {
          comments?: number
          created_at?: string
          id?: string
          post_id: string
          posted_at: string
          reddit_account_id: string
          subreddit: string
          title: string
          upvotes?: number
          url: string
        }
        Update: {
          comments?: number
          created_at?: string
          id?: string
          post_id?: string
          posted_at?: string
          reddit_account_id?: string
          subreddit?: string
          title?: string
          upvotes?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_reddit_account_id_fkey"
            columns: ["reddit_account_id"]
            isOneToOne: false
            referencedRelation: "reddit_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      infloww_tracking_stats: {
        Row: {
          id: string
          creator_id: string
          reddit_account_id: string | null
          campaign_code: number
          campaign_url: string | null
          clicks_count: number
          subscribers_count: number
          revenue_total: number
          revenue_per_sub: number
          spenders_count: number
          synced_at: string
        }
        Insert: {
          id?: string
          creator_id: string
          reddit_account_id?: string | null
          campaign_code: number
          campaign_url?: string | null
          clicks_count?: number
          subscribers_count?: number
          revenue_total?: number
          revenue_per_sub?: number
          spenders_count?: number
          synced_at?: string
        }
        Update: {
          id?: string
          creator_id?: string
          reddit_account_id?: string | null
          campaign_code?: number
          campaign_url?: string | null
          clicks_count?: number
          subscribers_count?: number
          revenue_total?: number
          revenue_per_sub?: number
          spenders_count?: number
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "infloww_tracking_stats_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      reddit_accounts: {
        Row: {
          created_at: string
          creator_id: string
          id: string
          infloww_campaign_code: number | null
          notes: string | null
          status: Database["public"]["Enums"]["reddit_account_status"]
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          id?: string
          infloww_campaign_code?: number | null
          notes?: string | null
          status?: Database["public"]["Enums"]["reddit_account_status"]
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          id?: string
          infloww_campaign_code?: number | null
          notes?: string | null
          status?: Database["public"]["Enums"]["reddit_account_status"]
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "reddit_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      subreddits: {
        Row: {
          id: string
          reddit_account_id: string
          name: string
          status: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          reddit_account_id: string
          name: string
          status?: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          reddit_account_id?: string
          name?: string
          status?: string
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subreddits_reddit_account_id_fkey"
            columns: ["reddit_account_id"]
            isOneToOne: false
            referencedRelation: "reddit_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_links: {
        Row: {
          id: string
          reddit_account_id: string
          label: string
          url: string
          created_at: string
        }
        Insert: {
          id?: string
          reddit_account_id: string
          label: string
          url: string
          created_at?: string
        }
        Update: {
          id?: string
          reddit_account_id?: string
          label?: string
          url?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_links_reddit_account_id_fkey"
            columns: ["reddit_account_id"]
            isOneToOne: false
            referencedRelation: "reddit_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      content_items: {
        Row: {
          id: string
          creator_id: string
          reddit_account_id: string | null
          subreddit_id: string | null
          tracking_link_id: string | null
          title: string
          content_type: string
          file_url: string | null
          post_url: string | null
          posted_at: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          creator_id: string
          reddit_account_id?: string | null
          subreddit_id?: string | null
          tracking_link_id?: string | null
          title: string
          content_type?: string
          file_url?: string | null
          post_url?: string | null
          posted_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          creator_id?: string
          reddit_account_id?: string | null
          subreddit_id?: string | null
          tracking_link_id?: string | null
          title?: string
          content_type?: string
          file_url?: string | null
          post_url?: string | null
          posted_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_items_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_reddit_account_id_fkey"
            columns: ["reddit_account_id"]
            isOneToOne: false
            referencedRelation: "reddit_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_subreddit_id_fkey"
            columns: ["subreddit_id"]
            isOneToOne: false
            referencedRelation: "subreddits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_tracking_link_id_fkey"
            columns: ["tracking_link_id"]
            isOneToOne: false
            referencedRelation: "tracking_links"
            referencedColumns: ["id"]
          },
        ]
      }
      organic_entries: {
        Row: {
          id: string
          creator_id: string
          amount: number
          sub_count: number | null
          entry_date: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          creator_id: string
          amount: number
          sub_count?: number | null
          entry_date?: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          creator_id?: string
          amount?: number
          sub_count?: number | null
          entry_date?: string
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organic_entries_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_entries: {
        Row: {
          id: string
          creator_id: string
          amount: number
          entry_type: string
          entry_date: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          creator_id: string
          amount: number
          entry_type?: string
          entry_date?: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          creator_id?: string
          amount?: number
          entry_type?: string
          entry_date?: string
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_entries_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_campaigns: {
        Row: {
          id: string
          creator_id: string
          platform: string
          amount_spent: number
          revenue_generated: number
          start_date: string
          end_date: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          creator_id: string
          platform?: string
          amount_spent: number
          revenue_generated?: number
          start_date?: string
          end_date?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          creator_id?: string
          platform?: string
          amount_spent?: number
          revenue_generated?: number
          start_date?: string
          end_date?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaigns_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_goals: {
        Row: {
          id: string
          creator_id: string
          channel: string
          target_amount: number
          period_start: string
          period_end: string
          created_at: string
        }
        Insert: {
          id?: string
          creator_id: string
          channel?: string
          target_amount: number
          period_start: string
          period_end: string
          created_at?: string
        }
        Update: {
          id?: string
          creator_id?: string
          channel?: string
          target_amount?: number
          period_start?: string
          period_end?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_goals_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_settings: {
        Row: {
          id: string
          agency_name: string
          logo_url: string | null
          theme: string
          updated_at: string
        }
        Insert: {
          id?: string
          agency_name?: string
          logo_url?: string | null
          theme?: string
          updated_at?: string
        }
        Update: {
          id?: string
          agency_name?: string
          logo_url?: string | null
          theme?: string
          updated_at?: string
        }
        Relationships: []
      }
      access_codes: {
        Row: {
          id: string
          code: string
          label: string
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          code: string
          label?: string
          active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          code?: string
          label?: string
          active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      social_accounts: {
        Row: {
          id: string
          creator_id: string
          platform: string
          username: string | null
          followers_count: number
          following_count: number
          posts_count: number
          notes: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          creator_id: string
          platform: string
          username?: string | null
          followers_count?: number
          following_count?: number
          posts_count?: number
          notes?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          creator_id?: string
          platform?: string
          username?: string | null
          followers_count?: number
          following_count?: number
          posts_count?: number
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          }
        ]
      }
      revenue_entries: {
        Row: {
          id: string
          creator_id: string
          reddit_account_id: string | null
          tracking_link_id: string | null
          amount: number
          currency: string
          entry_date: string
          source: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          creator_id: string
          reddit_account_id?: string | null
          tracking_link_id?: string | null
          amount: number
          currency?: string
          entry_date?: string
          source?: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          creator_id?: string
          reddit_account_id?: string | null
          tracking_link_id?: string | null
          amount?: number
          currency?: string
          entry_date?: string
          source?: string
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_entries_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_entries_reddit_account_id_fkey"
            columns: ["reddit_account_id"]
            isOneToOne: false
            referencedRelation: "reddit_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_entries_tracking_link_id_fkey"
            columns: ["tracking_link_id"]
            isOneToOne: false
            referencedRelation: "tracking_links"
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
      creator_status: "active" | "paused" | "inactive"
      reddit_account_status:
        | "active"
        | "shadowbanned"
        | "suspended"
        | "inactive"
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
      creator_status: ["active", "paused", "inactive"],
      reddit_account_status: [
        "active",
        "shadowbanned",
        "suspended",
        "inactive",
      ],
    },
  },
} as const
