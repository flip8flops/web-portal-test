'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/src/lib/supabase/client';
import { Button } from '@/components/ui/button';
import type { Session } from '@supabase/supabase-js';

export function Navbar() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    
    // Always set loading to false after a short delay to prevent hanging
    const timeout = setTimeout(() => {
      if (mounted) {
        setLoading(false);
      }
    }, 500);

    // Try to get session, but don't wait for it
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (mounted) {
          setSession(session);
          setLoading(false);
          clearTimeout(timeout);
        }
      })
      .catch(() => {
        // Ignore errors - just show login button
        if (mounted) {
          setLoading(false);
          clearTimeout(timeout);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setSession(session);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Metagapura Portal';

  return (
    <header className="w-full border-b bg-white dark:bg-gray-900 shadow-sm">
      <div className="flex h-16 items-center justify-between px-4">
        <div className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          {appName}
        </div>
        <div>
          {loading ? (
            <div className="h-9 w-20 animate-pulse rounded bg-gray-200" />
          ) : session ? (
            <Link href="/logout">
              <Button 
                variant="outline" 
                className="hover:bg-gradient-to-r hover:from-blue-500 hover:to-purple-500 hover:text-white hover:border-transparent transition-all"
              >
                Logout
              </Button>
            </Link>
          ) : (
            <Link href="/login">
              <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-md hover:shadow-lg transition-all">
                Login
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

