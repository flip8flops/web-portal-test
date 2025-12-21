'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/src/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { StatusDisplay } from '@/components/broadcast/status-display';
import { CampaignForm } from '@/components/broadcast/campaign-form';
import { ImageUpload } from '@/components/broadcast/image-upload';
import { DraftOutput } from '@/components/drafts/draft-output';
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
  // ===== SESSION STATE =====
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // ===== INPUT TAB STATE (Independent) =====
  const [notes, setNotes] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [restoringSession, setRestoringSession] = useState(true);

  // ===== TAB STATE =====
  const [activeTab, setActiveTab] = useState('input');

  // ===== SESSION INITIALIZATION =====
  useEffect(() => {
    let mounted = true;

    const timeout = setTimeout(() => {
      if (mounted) {
        setLoading(false);
      }
    }, 500);

    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (mounted) {
          setSession(session);
          setLoading(false);
          clearTimeout(timeout);
          
          // Restore campaign session from localStorage (for processing state only)
          if (session) {
            try {
              if (typeof window === 'undefined' || !window.localStorage) {
                console.warn('localStorage not available, skipping restore');
                setRestoringSession(false);
                return;
              }
              
              const savedCampaignId = localStorage.getItem('current_campaign_id');
              const savedExecutionId = localStorage.getItem('current_execution_id');
              const savedTimestamp = localStorage.getItem('current_campaign_timestamp');
              
              console.log('🔍 [INPUT] Checking localStorage for processing campaign:', {
                savedCampaignId,
                savedExecutionId,
                savedTimestamp,
              });
              
              // Check expiry (24 hours)
              if (savedTimestamp) {
                const timestamp = parseInt(savedTimestamp, 10);
                const now = Date.now();
                const hoursSinceSave = (now - timestamp) / (1000 * 60 * 60);
                
                if (hoursSinceSave > 24) {
                  console.log('⏰ [INPUT] Campaign session expired (>24 hours), clearing localStorage');
                  localStorage.removeItem('current_campaign_id');
                  localStorage.removeItem('current_execution_id');
                  localStorage.removeItem('current_campaign_timestamp');
                  setRestoringSession(false);
                  return;
                }
              }
              
              // Skip 'pending' campaign_id (not a valid UUID)
              if (savedCampaignId && savedCampaignId !== 'pending') {
                console.log('✅ [INPUT] Restoring campaign session:', savedCampaignId);
                setCampaignId(savedCampaignId);
                if (savedExecutionId) {
                  setExecutionId(savedExecutionId);
                }
                // Let StatusDisplay determine if still processing
              } else {
                console.log('ℹ️ [INPUT] No valid saved campaign, starting fresh');
              }
            } catch (err) {
              console.error('Error restoring campaign session:', err);
            } finally {
              setRestoringSession(false);
            }
          } else {
            setRestoringSession(false);
          }
        }
      })
      .catch(() => {
        if (mounted) {
          setLoading(false);
          clearTimeout(timeout);
          setRestoringSession(false);
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

  // ===== Handle processing state change from StatusDisplay =====
  const handleProcessingChange = (processing: boolean) => {
    setIsProcessing(processing);
    
    // If processing stopped (all agents done), clear localStorage
    // This allows user to create new campaign
    if (!processing && campaignId) {
      console.log('✅ [INPUT] Processing complete, clearing localStorage for next campaign');
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem('current_campaign_id');
        localStorage.removeItem('current_execution_id');
        localStorage.removeItem('current_campaign_timestamp');
      }
    }
  };

  // ===== FORM SUBMISSION =====
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
    setIsProcessing(false);
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
      setIsProcessing(true);
      
      // Save to localStorage for persistence (only during processing)
      if (typeof window !== 'undefined' && window.localStorage) {
        if (data.campaign_id && data.campaign_id !== 'pending') {
          localStorage.setItem('current_campaign_id', data.campaign_id);
          localStorage.setItem('current_campaign_timestamp', Date.now().toString());
          console.log('💾 [INPUT] Saved campaign_id to localStorage:', data.campaign_id);
        }
        if (data.execution_id) {
          localStorage.setItem('current_execution_id', data.execution_id);
          console.log('💾 [INPUT] Saved execution_id to localStorage:', data.execution_id);
        }
      }
    } catch (err) {
      console.error('Create campaign error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create campaign. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Show loading while checking session or restoring campaign state
  if (loading || restoringSession) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        {restoringSession && (
          <p className="ml-3 text-gray-600 dark:text-gray-400">Restoring session...</p>
        )}
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

  // Input is only disabled during processing (submitting or agents working)
  const isInputDisabled = submitting || isProcessing;

  return (
    <div className="space-y-8">
      <div className="mb-6 pb-2">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2 leading-tight pt-1 pb-1">
          Broadcast Team Agent
        </h1>
        <p className="text-gray-600 text-lg">Create and manage broadcast campaigns</p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
          <TabsTrigger 
            value="input"
            className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm dark:data-[state=active]:bg-gray-900 dark:data-[state=active]:text-blue-400 font-medium"
          >
            Input
          </TabsTrigger>
          <TabsTrigger 
            value="output"
            className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm dark:data-[state=active]:bg-gray-900 dark:data-[state=active]:text-blue-400 font-medium"
          >
            Output
          </TabsTrigger>
        </TabsList>

        {/* ===== INPUT TAB ===== */}
        <TabsContent value="input" className="space-y-6">
          {/* Status Display - Show if we have a campaignId (processing or completed) */}
          {campaignId && (
            <StatusDisplay 
              campaignId={campaignId} 
              executionId={executionId}
              onProcessingChange={handleProcessingChange}
            />
          )}

          {/* Error Messages */}
          {error && (
            <Alert className="border-red-500 bg-red-50 dark:bg-red-950">
              <AlertDescription className="text-red-700 dark:text-red-300">{error}</AlertDescription>
            </Alert>
          )}

          {/* Campaign Form */}
          <form onSubmit={handleSubmit} className={`space-y-6 transition-opacity duration-300 ${isInputDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <CampaignForm 
              value={notes} 
              onChange={setNotes} 
              disabled={isInputDisabled} 
            />

            <ImageUpload 
              onImageSelect={setImageFile} 
              disabled={isInputDisabled} 
            />

            {/* Generate Button */}
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={isInputDisabled || !notes.trim()}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all px-8 py-6 text-lg font-semibold uppercase disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : isProcessing ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'GENERATE'
                )}
              </Button>
            </div>
          </form>
        </TabsContent>

        {/* ===== OUTPUT TAB (Independent) ===== */}
        <TabsContent value="output" className="space-y-6">
          <DraftOutput />
        </TabsContent>
      </Tabs>
    </div>
  );
}
