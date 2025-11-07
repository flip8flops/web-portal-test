'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/src/lib/supabase/client';

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    const handleLogout = async () => {
      await supabase.auth.signOut();
      router.push('/');
    };

    handleLogout();
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p>Logging out...</p>
    </div>
  );
}

