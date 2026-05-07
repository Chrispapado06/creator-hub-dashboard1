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
          payout_split_pct: number
          of_platform_fee_pct: number
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
          payout_split_pct?: number
          of_platform_fee_pct?: number
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
          payout_split_pct?: number
          of_platform_fee_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      creator_payouts: {
        Row: {
          id: string
          creator_id: string
          period_start: string
          period_end: string
          gross_revenue: number
          of_platform_fee: number
          agency_cut: number
          deductions: { label: string; amount: number }[]
          net_to_creator: number
          split_pct_snapshot: number | null
          fee_pct_snapshot: number | null
          status: "draft" | "sent" | "paid"
          payment_method: string | null
          paid_at: string | null
          paid_by: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          creator_id: string
          period_start: string
          period_end: string
          gross_revenue?: number
          of_platform_fee?: number
          agency_cut?: number
          deductions?: { label: string; amount: number }[]
          net_to_creator?: number
          split_pct_snapshot?: number | null
          fee_pct_snapshot?: number | null
          status?: "draft" | "sent" | "paid"
          payment_method?: string | null
          paid_at?: string | null
          paid_by?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          creator_id?: string
          period_start?: string
          period_end?: string
          gross_revenue?: number
          of_platform_fee?: number
          agency_cut?: number
          deductions?: { label: string; amount: number }[]
          net_to_creator?: number
          split_pct_snapshot?: number | null
          fee_pct_snapshot?: number | null
          status?: "draft" | "sent" | "paid"
          payment_method?: string | null
          paid_at?: string | null
          paid_by?: string | null
          notes?: string | null
          created_at?: string
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
          name: string | null
          platform: string
          status: "active" | "paused" | "completed" | "cancelled"
          amount_spent: number
          revenue_generated: number
          start_date: string
          end_date: string | null
          notes: string | null
          infloww_campaign_code: number | null
          meta_campaign_id: string | null
          impressions: number
          clicks: number
          ctr: number | null
          cpc: number | null
          cpm: number | null
          meta_synced_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          creator_id: string
          name?: string | null
          platform?: string
          status?: "active" | "paused" | "completed" | "cancelled"
          amount_spent: number
          revenue_generated?: number
          start_date?: string
          end_date?: string | null
          notes?: string | null
          infloww_campaign_code?: number | null
          meta_campaign_id?: string | null
          impressions?: number
          clicks?: number
          ctr?: number | null
          cpc?: number | null
          cpm?: number | null
          meta_synced_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          creator_id?: string
          name?: string | null
          platform?: string
          status?: "active" | "paused" | "completed" | "cancelled"
          amount_spent?: number
          revenue_generated?: number
          start_date?: string
          end_date?: string | null
          notes?: string | null
          infloww_campaign_code?: number | null
          meta_campaign_id?: string | null
          impressions?: number
          clicks?: number
          ctr?: number | null
          cpc?: number | null
          cpm?: number | null
          meta_synced_at?: string | null
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
          meta_ads_access_token: string | null
          meta_ad_account_id: string | null
          meta_ads_connected_at: string | null
          scrapecreators_api_key: string | null
          anthropic_api_key: string | null
          airtable_api_key: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          agency_name?: string
          logo_url?: string | null
          theme?: string
          meta_ads_access_token?: string | null
          meta_ad_account_id?: string | null
          meta_ads_connected_at?: string | null
          scrapecreators_api_key?: string | null
          anthropic_api_key?: string | null
          airtable_api_key?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          agency_name?: string
          logo_url?: string | null
          theme?: string
          meta_ads_access_token?: string | null
          meta_ad_account_id?: string | null
          meta_ads_connected_at?: string | null
          scrapecreators_api_key?: string | null
          anthropic_api_key?: string | null
          airtable_api_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      chatters: {
        Row: {
          id: string
          name: string
          email: string | null
          role: "chatter" | "reddit_va" | "instagram_va" | "facebook_va" | "x_va" | "tiktok_va" | "social_media_va" | "content_editor" | "recruiter" | "manager" | "other"
          status: "active" | "paused" | "inactive"
          commission_pct: number
          hourly_rate: number | null
          languages: string | null
          hire_date: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          email?: string | null
          role?: "chatter" | "reddit_va" | "instagram_va" | "facebook_va" | "x_va" | "tiktok_va" | "social_media_va" | "content_editor" | "recruiter" | "manager" | "other"
          status?: "active" | "paused" | "inactive"
          commission_pct?: number
          hourly_rate?: number | null
          languages?: string | null
          hire_date?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string | null
          role?: "chatter" | "reddit_va" | "instagram_va" | "facebook_va" | "x_va" | "tiktok_va" | "social_media_va" | "content_editor" | "recruiter" | "manager" | "other"
          status?: "active" | "paused" | "inactive"
          commission_pct?: number
          hourly_rate?: number | null
          languages?: string | null
          hire_date?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      chatter_assignments: {
        Row: {
          id: string
          chatter_id: string
          creator_id: string
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          chatter_id: string
          creator_id: string
          active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          chatter_id?: string
          creator_id?: string
          active?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatter_assignments_chatter_id_fkey"
            columns: ["chatter_id"]
            isOneToOne: false
            referencedRelation: "chatters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatter_assignments_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          }
        ]
      }
      shifts: {
        Row: {
          id: string
          chatter_id: string
          creator_id: string
          start_at: string
          end_at: string | null
          ppv_count: number
          ppv_revenue: number
          tips_revenue: number
          custom_revenue: number
          total_revenue: number
          message_count: number
          avg_response_seconds: number | null
          quality_flag: "off_brand" | "missed_ppv" | "inappropriate" | "late" | "other" | null
          notes: string | null
          posts_count: number
          upvotes_count: number
          comments_received: number
          dms_handled: number
          target_platform: string | null
          target_account_id: string | null
          target_account_name: string | null
          created_at: string
        }
        Insert: {
          id?: string
          chatter_id: string
          creator_id: string
          start_at: string
          end_at?: string | null
          ppv_count?: number
          ppv_revenue?: number
          tips_revenue?: number
          custom_revenue?: number
          total_revenue?: number
          message_count?: number
          avg_response_seconds?: number | null
          quality_flag?: "off_brand" | "missed_ppv" | "inappropriate" | "late" | "other" | null
          notes?: string | null
          posts_count?: number
          upvotes_count?: number
          comments_received?: number
          dms_handled?: number
          target_platform?: string | null
          target_account_id?: string | null
          target_account_name?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          chatter_id?: string
          creator_id?: string
          start_at?: string
          end_at?: string | null
          ppv_count?: number
          ppv_revenue?: number
          tips_revenue?: number
          custom_revenue?: number
          total_revenue?: number
          message_count?: number
          avg_response_seconds?: number | null
          quality_flag?: "off_brand" | "missed_ppv" | "inappropriate" | "late" | "other" | null
          notes?: string | null
          posts_count?: number
          upvotes_count?: number
          comments_received?: number
          dms_handled?: number
          target_platform?: string | null
          target_account_id?: string | null
          target_account_name?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_chatter_id_fkey"
            columns: ["chatter_id"]
            isOneToOne: false
            referencedRelation: "chatters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          }
        ]
      }
      creator_leads: {
        Row: {
          id: string
          name: string
          handle: string | null
          status: "new" | "outreach" | "replied" | "negotiating" | "signed" | "lost"
          source_platform: string | null
          contact_method: string | null
          contact_value: string | null
          follower_estimate: number | null
          notes: string | null
          signed_at: string | null
          lost_reason: string | null
          creator_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          handle?: string | null
          status?: "new" | "outreach" | "replied" | "negotiating" | "signed" | "lost"
          source_platform?: string | null
          contact_method?: string | null
          contact_value?: string | null
          follower_estimate?: number | null
          notes?: string | null
          signed_at?: string | null
          lost_reason?: string | null
          creator_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          handle?: string | null
          status?: "new" | "outreach" | "replied" | "negotiating" | "signed" | "lost"
          source_platform?: string | null
          contact_method?: string | null
          contact_value?: string | null
          follower_estimate?: number | null
          notes?: string | null
          signed_at?: string | null
          lost_reason?: string | null
          creator_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_leads_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          }
        ]
      }
      automation_rules: {
        Row: {
          id: string
          label: string
          description: string | null
          enabled: boolean
          trigger: string
          trigger_params: unknown
          action: string
          action_params: unknown
          cooldown_hours: number
          fire_count: number
          last_fired_at: string | null
          last_evaluated_at: string | null
          last_eval_message: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          label: string
          description?: string | null
          enabled?: boolean
          trigger: string
          trigger_params?: unknown
          action: string
          action_params?: unknown
          cooldown_hours?: number
          fire_count?: number
          last_fired_at?: string | null
          last_evaluated_at?: string | null
          last_eval_message?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          label?: string
          description?: string | null
          enabled?: boolean
          trigger?: string
          trigger_params?: unknown
          action?: string
          action_params?: unknown
          cooldown_hours?: number
          fire_count?: number
          last_fired_at?: string | null
          last_evaluated_at?: string | null
          last_eval_message?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      rule_fires: {
        Row: {
          id: string
          rule_id: string
          entity_type: string
          entity_id: string
          details: string | null
          fired_at: string
        }
        Insert: {
          id?: string
          rule_id: string
          entity_type: string
          entity_id: string
          details?: string | null
          fired_at?: string
        }
        Update: {
          id?: string
          rule_id?: string
          entity_type?: string
          entity_id?: string
          details?: string | null
          fired_at?: string
        }
        Relationships: []
      }
      creator_form_templates: {
        Row: {
          id: string
          label: string
          description: string | null
          provider: string
          master_url: string | null
          category: string | null
          required_for_active: boolean
          archive_as_document: boolean
          document_category: string | null
          display_order: number
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          label: string
          description?: string | null
          provider?: string
          master_url?: string | null
          category?: string | null
          required_for_active?: boolean
          archive_as_document?: boolean
          document_category?: string | null
          display_order?: number
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          label?: string
          description?: string | null
          provider?: string
          master_url?: string | null
          category?: string | null
          required_for_active?: boolean
          archive_as_document?: boolean
          document_category?: string | null
          display_order?: number
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      creator_form_submissions: {
        Row: {
          id: string
          template_id: string
          creator_id: string
          status: string
          share_url: string | null
          submission_url: string | null
          notes: string | null
          sent_at: string | null
          submitted_at: string | null
          marked_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          template_id: string
          creator_id: string
          status?: string
          share_url?: string | null
          submission_url?: string | null
          notes?: string | null
          sent_at?: string | null
          submitted_at?: string | null
          marked_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          template_id?: string
          creator_id?: string
          status?: string
          share_url?: string | null
          submission_url?: string | null
          notes?: string | null
          sent_at?: string | null
          submitted_at?: string | null
          marked_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      creator_landing_pages: {
        Row: {
          id: string
          creator_id: string
          slug: string
          custom_domain: string | null
          is_published: boolean
          is_verified: boolean
          display_name: string | null
          tagline: string | null
          bio: string | null
          avatar_url: string | null
          cover_url: string | null
          theme: string
          accent_color: string | null
          font: string
          links: unknown
          media: unknown
          seo_title: string | null
          seo_description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          creator_id: string
          slug: string
          custom_domain?: string | null
          is_published?: boolean
          is_verified?: boolean
          display_name?: string | null
          tagline?: string | null
          bio?: string | null
          avatar_url?: string | null
          cover_url?: string | null
          theme?: string
          accent_color?: string | null
          font?: string
          links?: unknown
          media?: unknown
          seo_title?: string | null
          seo_description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          creator_id?: string
          slug?: string
          custom_domain?: string | null
          is_published?: boolean
          is_verified?: boolean
          display_name?: string | null
          tagline?: string | null
          bio?: string | null
          avatar_url?: string | null
          cover_url?: string | null
          theme?: string
          accent_color?: string | null
          font?: string
          links?: unknown
          media?: unknown
          seo_title?: string | null
          seo_description?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      landing_views: {
        Row: {
          id: string
          landing_id: string
          referrer: string | null
          user_agent: string | null
          country: string | null
          city: string | null
          region: string | null
          occurred_at: string
        }
        Insert: {
          id?: string
          landing_id: string
          referrer?: string | null
          user_agent?: string | null
          country?: string | null
          city?: string | null
          region?: string | null
          occurred_at?: string
        }
        Update: {
          id?: string
          landing_id?: string
          referrer?: string | null
          user_agent?: string | null
          country?: string | null
          city?: string | null
          region?: string | null
          occurred_at?: string
        }
        Relationships: []
      }
      landing_clicks: {
        Row: {
          id: string
          landing_id: string
          link_url: string
          link_label: string | null
          referrer: string | null
          user_agent: string | null
          occurred_at: string
        }
        Insert: {
          id?: string
          landing_id: string
          link_url: string
          link_label?: string | null
          referrer?: string | null
          user_agent?: string | null
          occurred_at?: string
        }
        Update: {
          id?: string
          landing_id?: string
          link_url?: string
          link_label?: string | null
          referrer?: string | null
          user_agent?: string | null
          occurred_at?: string
        }
        Relationships: []
      }
      creator_documents: {
        Row: {
          id: string
          creator_id: string
          label: string
          category: string
          file_path: string
          file_size_bytes: number | null
          mime_type: string | null
          notes: string | null
          expires_at: string | null
          supersedes_id: string | null
          uploaded_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          creator_id: string
          label: string
          category?: string
          file_path: string
          file_size_bytes?: number | null
          mime_type?: string | null
          notes?: string | null
          expires_at?: string | null
          supersedes_id?: string | null
          uploaded_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          creator_id?: string
          label?: string
          category?: string
          file_path?: string
          file_size_bytes?: number | null
          mime_type?: string | null
          notes?: string | null
          expires_at?: string | null
          supersedes_id?: string | null
          uploaded_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_announcements: {
        Row: {
          id: string
          body: string
          pinned: boolean
          scope: string
          expires_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          body: string
          pinned?: boolean
          scope?: string
          expires_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          body?: string
          pinned?: boolean
          scope?: string
          expires_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_training_materials: {
        Row: {
          id: string
          label: string
          body: string | null
          video_url: string | null
          category: string | null
          creator_id: string | null
          scope: string
          display_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          label: string
          body?: string | null
          video_url?: string | null
          category?: string | null
          creator_id?: string | null
          scope?: string
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          label?: string
          body?: string | null
          video_url?: string | null
          category?: string | null
          creator_id?: string | null
          scope?: string
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_scripts: {
        Row: {
          id: string
          label: string
          body: string
          category: string
          creator_id: string | null
          display_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          label: string
          body: string
          category: string
          creator_id?: string | null
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          label?: string
          body?: string
          category?: string
          creator_id?: string | null
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_coaching_notes: {
        Row: {
          id: string
          chatter_id: string
          body: string
          visible_to_staff: boolean
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          chatter_id: string
          body: string
          visible_to_staff?: boolean
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          chatter_id?: string
          body?: string
          visible_to_staff?: boolean
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      staff_goals: {
        Row: {
          id: string
          chatter_id: string
          label: string
          metric: string
          target_amount: number
          period_start: string
          period_end: string
          set_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          chatter_id: string
          label: string
          metric?: string
          target_amount: number
          period_start: string
          period_end: string
          set_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          chatter_id?: string
          label?: string
          metric?: string
          target_amount?: number
          period_start?: string
          period_end?: string
          set_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      airtable_embeds: {
        Row: {
          id: string
          scope: string
          label: string
          url: string
          description: string | null
          display_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          scope?: string
          label: string
          url: string
          description?: string | null
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          scope?: string
          label?: string
          url?: string
          description?: string | null
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      sync_status: {
        Row: {
          id: string
          last_synced_at: string | null
          last_status: string | null
          last_message: string | null
          last_actor: string | null
          items_processed: number
          errors_count: number
          locked_until: string | null
          locked_by: string | null
          auto_enabled: boolean
          interval_minutes: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          last_synced_at?: string | null
          last_status?: string | null
          last_message?: string | null
          last_actor?: string | null
          items_processed?: number
          errors_count?: number
          locked_until?: string | null
          locked_by?: string | null
          auto_enabled?: boolean
          interval_minutes?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          last_synced_at?: string | null
          last_status?: string | null
          last_message?: string | null
          last_actor?: string | null
          items_processed?: number
          errors_count?: number
          locked_until?: string | null
          locked_by?: string | null
          auto_enabled?: boolean
          interval_minutes?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          id: string
          actor_username: string | null
          action: string
          entity_type: string
          entity_id: string | null
          entity_name: string | null
          details: string | null
          metadata: Record<string, unknown> | null
          created_at: string
        }
        Insert: {
          id?: string
          actor_username?: string | null
          action: string
          entity_type: string
          entity_id?: string | null
          entity_name?: string | null
          details?: string | null
          metadata?: Record<string, unknown> | null
          created_at?: string
        }
        Update: {
          id?: string
          actor_username?: string | null
          action?: string
          entity_type?: string
          entity_id?: string | null
          entity_name?: string | null
          details?: string | null
          metadata?: Record<string, unknown> | null
          created_at?: string
        }
        Relationships: []
      }
      onboarding_tasks: {
        Row: {
          id: string
          creator_id: string
          task_key: string
          label: string
          description: string | null
          completed_at: string | null
          completed_by: string | null
          notes: string | null
          display_order: number
          created_at: string
        }
        Insert: {
          id?: string
          creator_id: string
          task_key: string
          label: string
          description?: string | null
          completed_at?: string | null
          completed_by?: string | null
          notes?: string | null
          display_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          creator_id?: string
          task_key?: string
          label?: string
          description?: string | null
          completed_at?: string | null
          completed_by?: string | null
          notes?: string | null
          display_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_tasks_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          }
        ]
      }
      of_creator_stats: {
        Row: {
          creator_id: string
          username: string | null
          display_name: string | null
          avatar_url: string | null
          bio: string | null
          followers_count: number
          posts_count: number
          active_subscribers: number
          expired_subscribers: number
          sub_price: number | null
          total_earnings: number
          earnings_subs: number
          earnings_tips: number
          earnings_ppv: number
          earnings_messages: number
          earnings_streams: number
          earnings_referrals: number
          synced_at: string
          created_at: string
        }
        Insert: {
          creator_id: string
          username?: string | null
          display_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          followers_count?: number
          posts_count?: number
          active_subscribers?: number
          expired_subscribers?: number
          sub_price?: number | null
          total_earnings?: number
          earnings_subs?: number
          earnings_tips?: number
          earnings_ppv?: number
          earnings_messages?: number
          earnings_streams?: number
          earnings_referrals?: number
          synced_at?: string
          created_at?: string
        }
        Update: {
          creator_id?: string
          username?: string | null
          display_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          followers_count?: number
          posts_count?: number
          active_subscribers?: number
          expired_subscribers?: number
          sub_price?: number | null
          total_earnings?: number
          earnings_subs?: number
          earnings_tips?: number
          earnings_ppv?: number
          earnings_messages?: number
          earnings_streams?: number
          earnings_referrals?: number
          synced_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "of_creator_stats_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: true
            referencedRelation: "creators"
            referencedColumns: ["id"]
          }
        ]
      }
      of_earnings_daily: {
        Row: {
          id: string
          creator_id: string
          entry_date: string
          earnings_subs: number
          earnings_tips: number
          earnings_ppv: number
          earnings_messages: number
          earnings_streams: number
          earnings_referrals: number
          total: number
          created_at: string
        }
        Insert: {
          id?: string
          creator_id: string
          entry_date: string
          earnings_subs?: number
          earnings_tips?: number
          earnings_ppv?: number
          earnings_messages?: number
          earnings_streams?: number
          earnings_referrals?: number
          total?: number
          created_at?: string
        }
        Update: {
          id?: string
          creator_id?: string
          entry_date?: string
          earnings_subs?: number
          earnings_tips?: number
          earnings_ppv?: number
          earnings_messages?: number
          earnings_streams?: number
          earnings_referrals?: number
          total?: number
          created_at?: string
        }
        Relationships: []
      }
      of_subscribers: {
        Row: {
          id: string
          creator_id: string
          fan_id: string
          username: string | null
          display_name: string | null
          avatar_url: string | null
          total_spent: number
          tips_total: number
          ppv_total: number
          messages_total: number
          subscribed_at: string | null
          expires_at: string | null
          is_active: boolean
          last_seen_at: string | null
          notes: string | null
          synced_at: string
          created_at: string
        }
        Insert: {
          id?: string
          creator_id: string
          fan_id: string
          username?: string | null
          display_name?: string | null
          avatar_url?: string | null
          total_spent?: number
          tips_total?: number
          ppv_total?: number
          messages_total?: number
          subscribed_at?: string | null
          expires_at?: string | null
          is_active?: boolean
          last_seen_at?: string | null
          notes?: string | null
          synced_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          creator_id?: string
          fan_id?: string
          username?: string | null
          display_name?: string | null
          avatar_url?: string | null
          total_spent?: number
          tips_total?: number
          ppv_total?: number
          messages_total?: number
          subscribed_at?: string | null
          expires_at?: string | null
          is_active?: boolean
          last_seen_at?: string | null
          notes?: string | null
          synced_at?: string
          created_at?: string
        }
        Relationships: []
      }
      of_subscriber_metrics_daily: {
        Row: {
          id: string
          creator_id: string
          entry_date: string
          active_count: number
          new_count: number
          lost_count: number
          expired_count: number
          created_at: string
        }
        Insert: {
          id?: string
          creator_id: string
          entry_date: string
          active_count?: number
          new_count?: number
          lost_count?: number
          expired_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          creator_id?: string
          entry_date?: string
          active_count?: number
          new_count?: number
          lost_count?: number
          expired_count?: number
          created_at?: string
        }
        Relationships: []
      }
      of_ppv_messages: {
        Row: {
          id: string
          creator_id: string
          message_id: string | null
          sent_at: string | null
          price: number | null
          recipients_count: number
          unlocks_count: number
          revenue: number
          preview: string | null
          notes: string | null
          synced_at: string
          created_at: string
        }
        Insert: {
          id?: string
          creator_id: string
          message_id?: string | null
          sent_at?: string | null
          price?: number | null
          recipients_count?: number
          unlocks_count?: number
          revenue?: number
          preview?: string | null
          notes?: string | null
          synced_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          creator_id?: string
          message_id?: string | null
          sent_at?: string | null
          price?: number | null
          recipients_count?: number
          unlocks_count?: number
          revenue?: number
          preview?: string | null
          notes?: string | null
          synced_at?: string
          created_at?: string
        }
        Relationships: []
      }
      of_promotions: {
        Row: {
          id: string
          creator_id: string
          name: string
          promo_type: "discount" | "free_trial" | "bundle" | "price_change" | "other"
          discount_pct: number | null
          trial_days: number | null
          starts_at: string
          ends_at: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          creator_id: string
          name: string
          promo_type?: "discount" | "free_trial" | "bundle" | "price_change" | "other"
          discount_pct?: number | null
          trial_days?: number | null
          starts_at: string
          ends_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          creator_id?: string
          name?: string
          promo_type?: "discount" | "free_trial" | "bundle" | "price_change" | "other"
          discount_pct?: number | null
          trial_days?: number | null
          starts_at?: string
          ends_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_payouts: {
        Row: {
          id: string
          chatter_id: string
          period_start: string
          period_end: string
          amount: number
          hours: number | null
          commission_amount: number | null
          hourly_amount: number | null
          shifts_count: number | null
          paid_at: string
          paid_by: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          chatter_id: string
          period_start: string
          period_end: string
          amount: number
          hours?: number | null
          commission_amount?: number | null
          hourly_amount?: number | null
          shifts_count?: number | null
          paid_at?: string
          paid_by?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          chatter_id?: string
          period_start?: string
          period_end?: string
          amount?: number
          hours?: number | null
          commission_amount?: number | null
          hourly_amount?: number | null
          shifts_count?: number | null
          paid_at?: string
          paid_by?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_payouts_chatter_id_fkey"
            columns: ["chatter_id"]
            isOneToOne: false
            referencedRelation: "chatters"
            referencedColumns: ["id"]
          }
        ]
      }
      lead_activities: {
        Row: {
          id: string
          lead_id: string
          activity_type: "dm_sent" | "reply_received" | "call" | "meeting" | "contract_sent" | "follow_up" | "note" | "status_change" | "other"
          description: string | null
          occurred_at: string
          created_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          activity_type: "dm_sent" | "reply_received" | "call" | "meeting" | "contract_sent" | "follow_up" | "note" | "status_change" | "other"
          description?: string | null
          occurred_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          activity_type?: "dm_sent" | "reply_received" | "call" | "meeting" | "contract_sent" | "follow_up" | "note" | "status_change" | "other"
          description?: string | null
          occurred_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "creator_leads"
            referencedColumns: ["id"]
          }
        ]
      }
      lead_tasks: {
        Row: {
          id: string
          lead_id: string | null
          description: string
          due_at: string | null
          completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          lead_id?: string | null
          description: string
          due_at?: string | null
          completed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          lead_id?: string | null
          description?: string
          due_at?: string | null
          completed_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "creator_leads"
            referencedColumns: ["id"]
          }
        ]
      }
      lead_templates: {
        Row: {
          id: string
          name: string
          body: string
          category: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          body: string
          category?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          body?: string
          category?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      access_codes: {
        Row: {
          id: string
          username: string
          password: string
          label: string
          active: boolean
          account_type: "admin" | "staff"
          chatter_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          username: string
          password: string
          label?: string
          active?: boolean
          account_type?: "admin" | "staff"
          chatter_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          username?: string
          password?: string
          label?: string
          active?: boolean
          account_type?: "admin" | "staff"
          chatter_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_codes_chatter_id_fkey"
            columns: ["chatter_id"]
            isOneToOne: false
            referencedRelation: "chatters"
            referencedColumns: ["id"]
          }
        ]
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
      instagram_accounts: {
        Row: {
          id: string
          creator_id: string
          username: string
          status: "active" | "warm_up" | "shadowbanned" | "banned" | "inactive"
          followers_count: number
          following_count: number
          posts_count: number
          bio_link: string | null
          notes: string | null
          infloww_campaign_code: number | null
          last_synced_at: string | null
          meta_access_token: string | null
          meta_ig_user_id: string | null
          meta_connected_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          creator_id: string
          username: string
          status?: "active" | "warm_up" | "shadowbanned" | "banned" | "inactive"
          followers_count?: number
          following_count?: number
          posts_count?: number
          bio_link?: string | null
          notes?: string | null
          infloww_campaign_code?: number | null
          last_synced_at?: string | null
          meta_access_token?: string | null
          meta_ig_user_id?: string | null
          meta_connected_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          creator_id?: string
          username?: string
          status?: "active" | "warm_up" | "shadowbanned" | "banned" | "inactive"
          followers_count?: number
          following_count?: number
          posts_count?: number
          bio_link?: string | null
          notes?: string | null
          infloww_campaign_code?: number | null
          last_synced_at?: string | null
          meta_access_token?: string | null
          meta_ig_user_id?: string | null
          meta_connected_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          }
        ]
      }
      instagram_posts: {
        Row: {
          id: string
          instagram_account_id: string
          post_id: string | null
          caption: string | null
          media_type: "image" | "video" | "reel" | "carousel" | "story"
          posted_at: string
          likes_count: number
          comments_count: number
          saves_count: number
          shares_count: number
          reach_count: number
          url: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          instagram_account_id: string
          post_id?: string | null
          caption?: string | null
          media_type?: "image" | "video" | "reel" | "carousel" | "story"
          posted_at?: string
          likes_count?: number
          comments_count?: number
          saves_count?: number
          shares_count?: number
          reach_count?: number
          url?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          instagram_account_id?: string
          post_id?: string | null
          caption?: string | null
          media_type?: "image" | "video" | "reel" | "carousel" | "story"
          posted_at?: string
          likes_count?: number
          comments_count?: number
          saves_count?: number
          shares_count?: number
          reach_count?: number
          url?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_posts_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          }
        ]
      }
      tiktok_accounts: {
        Row: {
          id: string
          creator_id: string
          username: string
          status: "active" | "warm_up" | "shadowbanned" | "banned" | "inactive"
          followers_count: number
          following_count: number
          posts_count: number
          total_likes: number
          bio_link: string | null
          notes: string | null
          infloww_campaign_code: number | null
          last_synced_at: string | null
          api_provider: "scrapecreators" | "apify" | "tikapi" | null
          api_key: string | null
          api_connected_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          creator_id: string
          username: string
          status?: "active" | "warm_up" | "shadowbanned" | "banned" | "inactive"
          followers_count?: number
          following_count?: number
          posts_count?: number
          total_likes?: number
          bio_link?: string | null
          notes?: string | null
          infloww_campaign_code?: number | null
          last_synced_at?: string | null
          api_provider?: "scrapecreators" | "apify" | "tikapi" | null
          api_key?: string | null
          api_connected_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          creator_id?: string
          username?: string
          status?: "active" | "warm_up" | "shadowbanned" | "banned" | "inactive"
          followers_count?: number
          following_count?: number
          posts_count?: number
          total_likes?: number
          bio_link?: string | null
          notes?: string | null
          infloww_campaign_code?: number | null
          last_synced_at?: string | null
          api_provider?: "scrapecreators" | "apify" | "tikapi" | null
          api_key?: string | null
          api_connected_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tiktok_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          }
        ]
      }
      tiktok_posts: {
        Row: {
          id: string
          tiktok_account_id: string
          post_id: string | null
          caption: string | null
          media_type: "video" | "photo" | "live"
          posted_at: string
          views_count: number
          likes_count: number
          comments_count: number
          shares_count: number
          saves_count: number
          url: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tiktok_account_id: string
          post_id?: string | null
          caption?: string | null
          media_type?: "video" | "photo" | "live"
          posted_at?: string
          views_count?: number
          likes_count?: number
          comments_count?: number
          shares_count?: number
          saves_count?: number
          url?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tiktok_account_id?: string
          post_id?: string | null
          caption?: string | null
          media_type?: "video" | "photo" | "live"
          posted_at?: string
          views_count?: number
          likes_count?: number
          comments_count?: number
          shares_count?: number
          saves_count?: number
          url?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tiktok_posts_tiktok_account_id_fkey"
            columns: ["tiktok_account_id"]
            isOneToOne: false
            referencedRelation: "tiktok_accounts"
            referencedColumns: ["id"]
          }
        ]
      }
      facebook_accounts: {
        Row: {
          id: string
          creator_id: string
          name: string
          page_url: string | null
          status: "active" | "warm_up" | "shadowbanned" | "banned" | "inactive"
          followers_count: number
          likes_count: number
          posts_count: number
          about_link: string | null
          notes: string | null
          infloww_campaign_code: number | null
          last_synced_at: string | null
          meta_access_token: string | null
          meta_page_id: string | null
          meta_connected_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          creator_id: string
          name: string
          page_url?: string | null
          status?: "active" | "warm_up" | "shadowbanned" | "banned" | "inactive"
          followers_count?: number
          likes_count?: number
          posts_count?: number
          about_link?: string | null
          notes?: string | null
          infloww_campaign_code?: number | null
          last_synced_at?: string | null
          meta_access_token?: string | null
          meta_page_id?: string | null
          meta_connected_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          creator_id?: string
          name?: string
          page_url?: string | null
          status?: "active" | "warm_up" | "shadowbanned" | "banned" | "inactive"
          followers_count?: number
          likes_count?: number
          posts_count?: number
          about_link?: string | null
          notes?: string | null
          infloww_campaign_code?: number | null
          last_synced_at?: string | null
          meta_access_token?: string | null
          meta_page_id?: string | null
          meta_connected_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facebook_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          }
        ]
      }
      facebook_posts: {
        Row: {
          id: string
          facebook_account_id: string
          post_id: string | null
          message: string | null
          media_type: "photo" | "video" | "reel" | "link" | "status"
          posted_at: string
          reactions_count: number
          comments_count: number
          shares_count: number
          reach_count: number
          video_views: number
          url: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          facebook_account_id: string
          post_id?: string | null
          message?: string | null
          media_type?: "photo" | "video" | "reel" | "link" | "status"
          posted_at?: string
          reactions_count?: number
          comments_count?: number
          shares_count?: number
          reach_count?: number
          video_views?: number
          url?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          facebook_account_id?: string
          post_id?: string | null
          message?: string | null
          media_type?: "photo" | "video" | "reel" | "link" | "status"
          posted_at?: string
          reactions_count?: number
          comments_count?: number
          shares_count?: number
          reach_count?: number
          video_views?: number
          url?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facebook_posts_facebook_account_id_fkey"
            columns: ["facebook_account_id"]
            isOneToOne: false
            referencedRelation: "facebook_accounts"
            referencedColumns: ["id"]
          }
        ]
      }
      revenue_entries: {
        Row: {
          id: string
          creator_id: string
          reddit_account_id: string | null
          instagram_account_id: string | null
          facebook_account_id: string | null
          tiktok_account_id: string | null
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
          instagram_account_id?: string | null
          facebook_account_id?: string | null
          tiktok_account_id?: string | null
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
          instagram_account_id?: string | null
          facebook_account_id?: string | null
          tiktok_account_id?: string | null
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
            foreignKeyName: "revenue_entries_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_entries_facebook_account_id_fkey"
            columns: ["facebook_account_id"]
            isOneToOne: false
            referencedRelation: "facebook_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_entries_tiktok_account_id_fkey"
            columns: ["tiktok_account_id"]
            isOneToOne: false
            referencedRelation: "tiktok_accounts"
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
      instagram_account_status:
        | "active"
        | "warm_up"
        | "shadowbanned"
        | "banned"
        | "inactive"
      facebook_account_status:
        | "active"
        | "warm_up"
        | "shadowbanned"
        | "banned"
        | "inactive"
      tiktok_account_status:
        | "active"
        | "warm_up"
        | "shadowbanned"
        | "banned"
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
