import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  ENABLE_UPLOADS?: string;
  TOTAL_CAPACITY_BYTES?: string;
  MAX_FILE_BYTES?: string;
  RETENTION_SECONDS?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_HOSTNAMES?: string;
  ADMIN_TOKEN?: string;
  RATE_LIMIT_SALT?: string;
}
export interface FileRow {
  id: string; name: string; size: number; mode: 'once' | 'day';
  state: 'reserved' | 'uploading' | 'ready' | 'claimed' | 'deleting' | 'deleted';
  share_hash: string; manage_hash: string; upload_hash: string;
  visibility: 'public' | 'unlisted'; public_id: string | null;
  thumbnail: string | null; thumbnail_size: number;
  created_at: number; expires_at: number; lease_until: number; delete_after: number;
}
