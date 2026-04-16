import type { PublicProfileSummary } from "./profiles";
import type { Platform } from "./worlds";

export interface CollectionWorldOption {
  id: string;
  name: string;
  platform: Platform;
  thumbnail_url: string | null;
}

export interface CollectionSummary {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  owner_profile: PublicProfileSummary | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  is_owner: boolean;
  worlds: CollectionWorldOption[];
}

export interface NewCollectionPayload {
  name: string;
  description: string | null;
  is_public: boolean;
}
