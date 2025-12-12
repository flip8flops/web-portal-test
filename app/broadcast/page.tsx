'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/src/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { StatusDisplay } from '@/components/broadcast/status-display';
import { CampaignForm } from '@/components/broadcast/campaign-form';
import { ImageUpload } from '@/components/broadcast/image-upload';
import { Loader2 } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';

interface CreateResponse {
  campaign_id: string;
  execution_id?: string;
  message?: string;
}

interface ErrorResponse {
  error: string;
  details?: string;
}

export default function BroadcastPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const timeout = setTimeout(() => {
      if (mounted) {
        setLoading(false);
      }
    }, 500);

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (mounted) {
          setSession(session);
          setLoading(false);
          clearTimeout(timeout);
        }
      })
      .catch(() => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!notes.trim()) {
      setError('Campaign notes wajib diisi sebelum generate.');
      return;
    }

    if (!session) {
      setError('Please log in to create a campaign.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setCampaignId(null);
    setExecutionId(null);

    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();

      if (!currentSession?.access_token) {
        throw new Error('No active session. Please log in again.');
      }

      // Create FormData for multipart/form-data
      const formData = new FormData();
      formData.append('Campaign planning notes', notes.trim());
      if (imageFile) {
        formData.append('Campaign image', imageFile);
      }

      const response = await fetch('/api/broadcast/create', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${currentSession.access_token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData: ErrorResponse = await response.json().catch(() => ({
          error: `HTTP ${response.status}`,
        }));
        throw new Error(errorData.error || `Failed to create campaign: ${response.status}`);
      }

      const data: CreateResponse = await response.json();
      setCampaignId(data.campaign_id);
      setExecutionId(data.execution_id || null);
      setSuccess(data.message || 'Campaign initiated! Agents are now processing.');
      
      // Reset form (optional - bisa di-comment jika ingin keep data)
      // setNotes('');
      // setImageFile(null);
    } catch (err) {
      console.error('Create campaign error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create campaign. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Alert className="max-w-md">
          <AlertDescription>
            You must be logged in to create campaigns.{' '}
            <Link href="/login" className="underline font-medium">
              Login here
            </Link>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="mb-6 pb-2">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2 leading-tight">
          Broadcast Team Agent
        </h1>
        <p className="text-gray-600 text-lg">Create and manage broadcast campaigns</p>
      </div>

      {/* Status Display Area */}
      <StatusDisplay campaignId={campaignId} executionId={executionId} />

      {/* Error/Success Messages */}
      {error && (
        <Alert className="border-red-500 bg-red-50 dark:bg-red-950">
          <AlertDescription className="text-red-700 dark:text-red-300">{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
          <AlertDescription className="text-green-700 dark:text-green-300">{success}</AlertDescription>
        </Alert>
      )}

      {/* Campaign Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <CampaignForm value={notes} onChange={setNotes} disabled={submitting} />

        <ImageUpload onImageSelect={setImageFile} disabled={submitting} />

        {/* Generate Button */}
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={submitting || !notes.trim()}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all px-8 py-6 text-lg font-semibold uppercase"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              'GENERATE'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

