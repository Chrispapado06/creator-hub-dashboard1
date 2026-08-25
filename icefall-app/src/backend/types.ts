/**
 * The database, in TypeScript.
 *
 * Hand-written to match `icefall-supabase/migrations`. Regenerate with
 * `supabase gen types typescript` once the project is linked, and keep the
 * ALIAS form below when you do.
 *
 * `Database` MUST be a `type`, never an `interface`. An interface here type-checks
 * fine and then silently breaks every `.rpc()` call at the point of use, because
 * the client's generics expect a structural alias. This has cost a day before.
 */

export type IcefallRole = "athlete" | "guide" | "operator" | "admin";
export type Availability = "available" | "limited" | "unavailable";
export type ThreadStatus = "open" | "closed";

export type Profile = {
  id: string;
  role: IcefallRole;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type GuideProfile = {
  id: string;
  headline: string | null;
  based_in: string | null;
  specialities: string[];
  mountains: string[];
  languages: string[];
  years_guiding: number | null;
  daily_rate_eur: number | null;
  availability: Availability;
  bio: string | null;
  /** Always false. The database enforces it — see the migration. */
  credentials_verified: boolean;
  listed: boolean;
  created_at: string;
  updated_at: string;
};

export type OperatorProfile = {
  id: string;
  company_name: string;
  certification: string | null;
  regions: string[];
  min_elevation_m: number | null;
  response_hours: number | null;
  blurb: string | null;
  listed: boolean;
  created_at: string;
  updated_at: string;
};

export type Thread = {
  id: string;
  peak_name: string | null;
  peak_elevation_m: number | null;
  from_date: string | null;
  to_date: string | null;
  group_size: number | null;
  status: ThreadStatus;
  created_by: string;
  created_at: string;
  last_message_at: string;
};

export type ThreadParticipant = {
  thread_id: string;
  profile_id: string;
  last_read_at: string | null;
  joined_at: string;
};

export type Message = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile, Pick<Profile, "id" | "display_name">>;
      guide_profiles: Table<GuideProfile, Pick<GuideProfile, "id"> & Partial<GuideProfile>>;
      operator_profiles: Table<
        OperatorProfile,
        Pick<OperatorProfile, "id" | "company_name"> & Partial<OperatorProfile>
      >;
      threads: Table<Thread, Pick<Thread, "created_by"> & Partial<Thread>>;
      thread_participants: Table<
        ThreadParticipant,
        Pick<ThreadParticipant, "thread_id" | "profile_id">
      >;
      messages: Table<Message, Pick<Message, "thread_id" | "sender_id" | "body">>;
    };
    Views: Record<never, never>;
    Functions: {
      is_admin: { Args: Record<never, never>; Returns: boolean };
      my_role: { Args: Record<never, never>; Returns: IcefallRole };
      is_thread_participant: { Args: { t: string }; Returns: boolean };
    };
    Enums: {
      icefall_role: IcefallRole;
    };
    CompositeTypes: Record<never, never>;
  };
};
