export type PlanTier = "free" | "standard" | "professional" | "enterprise";

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  plan_tier: PlanTier;
  hubs_account_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarEvent {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  created_at: string;
  updated_at: string;
}

export type NewCalendarEvent = Pick<CalendarEvent, "title" | "description" | "starts_at" | "ends_at">;
