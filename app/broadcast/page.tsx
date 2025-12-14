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
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [restoringSession, setRestoringSession] = useState(true);

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
          
          // Restore campaign session from localStorage
          if (session) {
            try {
              // Check if localStorage is available
              if (typeof window === 'undefined' || !window.localStorage) {
                console.warn('localStorage not available, skipping restore');
                setRestoringSession(false);
                return;
              }
              
              const savedCampaignId = localStorage.getItem('current_campaign_id');
              const savedExecutionId = localStorage.getItem('current_execution_id');
              const savedTimestamp = localStorage.getItem('current_campaign_timestamp');
              
              console.log('🔍 Checking localStorage for campaign session:', {
                savedCampaignId,
                savedExecutionId,
                savedTimestamp,
                hasLocalStorage: typeof window !== 'undefined' && !!window.localStorage
              });
              
              // Check expiry (24 hours)
              if (savedTimestamp) {
                const timestamp = parseInt(savedTimestamp, 10);
                const now = Date.now();
                const hoursSinceSave = (now - timestamp) / (1000 * 60 * 60);
                
                if (hoursSinceSave > 24) {
                  console.log('Campaign session expired (>24 hours), clearing localStorage');
                  localStorage.removeItem('current_campaign_id');
                  localStorage.removeItem('current_execution_id');
                  localStorage.removeItem('current_campaign_timestamp');
                  setRestoringSession(false);
                  return;
                }
              }
              
              if (savedCampaignId || savedExecutionId) {
                console.log('✅ Found saved campaign session, verifying status...');
                // Query ALL status updates untuk campaign/execution (bukan hanya 1 terakhir)
                let query = supabase
                  .schema('citia_mora_datamart')
                  .from('campaign_status_updates')
                  .select('agent_name, status, updated_at');
                
                if (savedCampaignId) {
                  query = query.eq('campaign_id', savedCampaignId);
                } else if (savedExecutionId) {
                  query = query.eq('execution_id', savedExecutionId);
                }
                
                const { data: allStatuses, error } = await query
                  .order('created_at', { ascending: false });
                
                if (error) {
                  console.error('Error checking campaign status:', error);
                  // Clear on error to be safe
                  localStorage.removeItem('current_campaign_id');
                  localStorage.removeItem('current_execution_id');
                  localStorage.removeItem('current_campaign_timestamp');
                  setRestoringSession(false);
                  return;
                }
                
                if (allStatuses && allStatuses.length > 0) {
                  // Check if ANY agent is still processing
                  const hasProcessingAgent = allStatuses.some(
                    (status) => status.status === 'processing' || status.status === 'thinking'
                  );
                  
                  // Get latest status per agent
                  const allAgents = ['guardrails', 'research_agent', 'matchmaker_agent', 'content_maker_agent'];
                  const agentStatuses: Record<string, string> = {};
                  
                  allStatuses.forEach((status) => {
                    if (!agentStatuses[status.agent_name] || 
                        new Date(status.updated_at) > new Date(agentStatuses[status.agent_name])) {
                      agentStatuses[status.agent_name] = status.status;
                    }
                  });
                  
                  // Check if ALL agents are finished
                  const allFinished = allAgents.every((agent) => {
                    const status = agentStatuses[agent];
                    return !status || // Agent belum mulai
                           status === 'completed' || 
                           status === 'rejected' || 
                           status === 'error';
                  });
                  
                  if (hasProcessingAgent) {
                    // Masih ada yang processing → restore
                    const processingAgents = allStatuses.filter(s => s.status === 'processing' || s.status === 'thinking').map(s => s.agent_name);
                    console.log('✅ Campaign still processing, restoring session:', { 
                      savedCampaignId, 
                      savedExecutionId,
                      processingAgents,
                      allStatusesCount: allStatuses.length
                    });
                    // Set state directly (mounted check already done)
                    if (mounted) {
                      setCampaignId(savedCampaignId);
                      setExecutionId(savedExecutionId);
                      console.log('✅ State updated with campaignId:', savedCampaignId, 'executionId:', savedExecutionId);
                    } else {
                      console.warn('⚠️ Component unmounted, cannot restore state');
                    }
                  } else if (allFinished) {
                    // Semua sudah selesai → clear localStorage
                    console.log('✅ All agents finished, clearing localStorage');
                    if (typeof window !== 'undefined' && window.localStorage) {
                      localStorage.removeItem('current_campaign_id');
                      localStorage.removeItem('current_execution_id');
                      localStorage.removeItem('current_campaign_timestamp');
                    }
                  } else {
                    // Edge case: belum ada status atau status tidak lengkap
                    // Restore untuk safety (mungkin status belum muncul)
                    console.log('⚠️ Campaign status unclear, restoring session for safety', {
                      agentStatuses,
                      allFinished
                    });
                    if (mounted) {
                      setCampaignId(savedCampaignId);
                      setExecutionId(savedExecutionId);
                      console.log('✅ State updated (safety restore)');
                    } else {
                      console.warn('⚠️ Component unmounted, cannot restore state');
                    }
                  }
                } else {
                  // Tidak ada status → mungkin campaign baru dibuat
                  // Restore untuk safety
                  console.log('⚠️ No status found, restoring session (campaign might be new)', {
                    savedCampaignId,
                    savedExecutionId
                  });
                  if (mounted) {
                    setCampaignId(savedCampaignId);
                    setExecutionId(savedExecutionId);
                    console.log('✅ State updated (no status found)');
                  } else {
                    console.warn('⚠️ Component unmounted, cannot restore state');
                  }
                }
              } else {
                // Tidak ada saved IDs di localStorage
                console.log('ℹ️ No saved campaign session in localStorage');
              }
            } catch (err) {
              console.error('Error restoring campaign session:', err);
              // On error, don't restore but also don't clear (might be network issue)
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
    setIsProcessing(false); // Reset processing state for new submission
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
      
      // Save to localStorage for persistence with timestamp
      if (typeof window !== 'undefined' && window.localStorage) {
        if (data.campaign_id) {
          localStorage.setItem('current_campaign_id', data.campaign_id);
          localStorage.setItem('current_campaign_timestamp', Date.now().toString());
          console.log('💾 Saved campaign_id to localStorage:', data.campaign_id);
        }
        if (data.execution_id) {
          localStorage.setItem('current_execution_id', data.execution_id);
          console.log('💾 Saved execution_id to localStorage:', data.execution_id);
        }
      } else {
        console.warn('⚠️ localStorage not available, cannot save campaign session');
      }
      
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

  // Show loading while checking session or restoring campaign state
  if (loading || restoringSession) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        {restoringSession && (
          <p className="ml-3 text-gray-600 dark:text-gray-400">Restoring campaign session...</p>
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

  return (
    <div className="space-y-8">
      <div className="mb-6 pb-2">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2 leading-tight pt-1 pb-1">
          Broadcast Team Agent
        </h1>
        <p className="text-gray-600 text-lg">Create and manage broadcast campaigns</p>
      </div>

      {/* Status Display Area */}
      <StatusDisplay 
        campaignId={campaignId} 
        executionId={executionId}
        onProcessingChange={setIsProcessing}
      />

      {/* Error Messages */}
      {error && (
        <Alert className="border-red-500 bg-red-50 dark:bg-red-950">
          <AlertDescription className="text-red-700 dark:text-red-300">{error}</AlertDescription>
        </Alert>
      )}

      {/* Campaign Form */}
      <form onSubmit={handleSubmit} className={`space-y-6 transition-opacity duration-300 ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
        <CampaignForm value={notes} onChange={setNotes} disabled={submitting || isProcessing} />

        <ImageUpload onImageSelect={setImageFile} disabled={submitting || isProcessing} />

        {/* Generate Button */}
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={submitting || isProcessing || !notes.trim()}
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
    </div>
  );
}

