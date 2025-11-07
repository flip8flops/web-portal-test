import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

// Validate configuration in browser (client-side only)
if (typeof window !== 'undefined') {
  const isValidUrl = supabaseUrl && 
                     supabaseUrl.startsWith('https://') && 
                     supabaseUrl.includes('.supabase.co') &&
                     !supabaseUrl.includes('placeholder');
  
  const isValidKey = supabaseAnonKey && 
                     supabaseAnonKey.length > 20 && 
                     !supabaseAnonKey.includes('placeholder');
  
  if (!isValidUrl || !isValidKey) {
    console.error('⚠️ Supabase configuration error: Invalid environment variables');
    console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl);
    console.error('  Valid:', isValidUrl);
    console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? `${supabaseAnonKey.substring(0, 10)}...` : 'Missing');
    console.error('  Valid:', isValidKey);
    console.error('Please check your Coolify environment variables are set correctly.');
  }
}

// Create client - during build, placeholder values are used
// At runtime in production, env vars from Coolify will replace these
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

