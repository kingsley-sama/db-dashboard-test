import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Create Supabase clients for different contexts
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_URL');
}

if (!supabaseAnonKey) {
  throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

// Regular client for client-side operations (uses anon key)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client for server-side operations (has bypass RLS permissions)
export const supabaseAdmin = (() => {
  if (typeof window === 'undefined' && !supabaseServiceKey) {
    // Only throw error on server-side if key is missing
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required for server-side admin operations. ' +
      'Add it to your .env file.'
    );
  }
  // On client-side or if key exists on server, create the client
  return createClient(
    supabaseUrl, 
    supabaseServiceKey || supabaseAnonKey, // Fallback to anon key on client
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
})();

// Re-export as storageServiceAdmin for backward compatibility
export const storageServiceAdmin = supabaseAdmin;

export interface UploadResult {
  bucket: string;
  path: string;
  id: string;
  publicUrl: string;
}

export interface MultiUploadResult {
  successfulUploads: UploadResult[];
  failedUploads: { file: string; error: string }[];
}
