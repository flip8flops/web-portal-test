'use client';

import { useState } from 'react';
import { supabase } from '@/src/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/notes`,
        },
      });

      if (error) {
        console.error('Supabase auth error:', error);
        setMessage({ type: 'error', text: error.message || 'Failed to send magic link. Please check your email and try again.' });
      } else {
        setMessage({
          type: 'success',
          text: 'Check your email for the magic link!',
        });
        setEmail('');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      const errorMessage = err?.message || err?.toString() || 'Unknown error';
      
      // Provide more specific error messages
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError') || errorMessage.includes('fetch')) {
        setMessage({
          type: 'error',
          text: 'Failed to connect to authentication service. Please verify that NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are correctly set in your Coolify environment variables.',
        });
      } else if (errorMessage.includes('CORS')) {
        setMessage({
          type: 'error',
          text: 'CORS error: Please add your domain to Supabase allowed origins in Authentication > URL Configuration.',
        });
      } else {
        setMessage({
          type: 'error',
          text: `Error: ${errorMessage}. Please check the browser console for more details.`,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-md border-0 shadow-xl bg-gradient-to-br from-white to-blue-50/50 dark:from-gray-800 dark:to-blue-950/50">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <CardTitle className="text-2xl bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Login</CardTitle>
          <CardDescription>Enter your email to receive a magic link</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <Button 
              type="submit" 
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all" 
              disabled={loading}
            >
              {loading ? 'Sending...' : 'Send magic link'}
            </Button>
          </form>
          {message && (
            <Alert className={`mt-4 ${message.type === 'error' ? 'border-red-500' : 'border-green-500'}`}>
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

