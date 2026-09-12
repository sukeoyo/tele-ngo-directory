export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  PAN_PROVIDER: "mock" | "cashfree" | "signzy" | "digio" | "karza";
  PAN_API_URL?: string;
  PAN_API_KEY?: string;
  ALLOWED_ORIGIN: string;
}
