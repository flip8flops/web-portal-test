import { createClient } from '@supabase/supabase-js';
import type { Session, User } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

export interface ServerSession {
  session: Session;
  user: User;
}

/**
 * Parse cookies from cookie header string
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name) {
      cookies[name] = decodeURIComponent(rest.join('='));
    }
  });
  return cookies;
}

/**
 * Get the current authenticated session from server-side request.
 * Reads cookies from the Request headers to extract Supabase auth session.
 * Returns null if not authenticated.
 */
export async function getServerSession(request: Request): Promise<ServerSession | null> {
  try {
    // First, try to get session from Authorization header (primary method)
    // This is more reliable since Supabase stores sessions in localStorage, not cookies
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false },
      });
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        // Get full session info
        const { data: { session } } = await supabase.auth.setSession({
          access_token: token,
          refresh_token: '',
        });
        if (session) {
          return {
            session,
            user: session.user,
          };
        }
        // Fallback: create minimal session object
        return {
          session: {
            access_token: token,
            refresh_token: '',
            expires_at: 0,
            expires_in: 0,
            token_type: 'bearer',
            user,
          } as Session,
          user,
        };
      }
    }

    // Fallback: try to get session from cookies (if Supabase is configured to use cookies)
    const cookieHeader = request.headers.get('cookie') || '';
    
    if (!cookieHeader) {
      return null;
    }

    const cookies = parseCookies(cookieHeader);
    
    // Find Supabase auth cookie (pattern: sb-<project-ref>-auth-token)
    const authCookieName = Object.keys(cookies).find(key => 
      key.includes('auth-token') || (key.startsWith('sb-') && key.includes('-auth-token'))
    );

    if (!authCookieName) {
      return null;
    }

    // Parse the auth token cookie (it's a JSON string containing session data)
    let sessionData: { access_token?: string; refresh_token?: string; expires_at?: number; user?: User } | null = null;
    try {
      sessionData = JSON.parse(cookies[authCookieName]);
    } catch {
      // Cookie might not be JSON, try to extract token directly
      return null;
    }

    if (!sessionData?.access_token) {
      return null;
    }

    // Create a Supabase client for server-side operations
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    // Set the session using the access token
    const { data: { session }, error } = await supabase.auth.setSession({
      access_token: sessionData.access_token,
      refresh_token: sessionData.refresh_token || '',
    });

    if (error || !session) {
      return null;
    }

    return {
      session,
      user: session.user,
    };
  } catch (error) {
    console.error('Error getting server session:', error);
    return null;
  }
}

