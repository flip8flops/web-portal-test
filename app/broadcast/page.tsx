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

type CampaignState = 'idle' | 'processing' | 'drafted' | 'approved' | 'rejected';

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
  const [campaignState, setCampaignState] = useState<CampaignState>('idle');
  const [draftCampaignId, setDraftCampaignId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('input');

  // Check campaign state (drafted, approved, rejected, processing)
  const checkCampaignState = async (cid: string | null): Promise<CampaignState> => {
    if (!cid || cid === 'pending') return 'idle';

    try {
      // Use API endpoint to check draft status (avoids permission issues)
      const response = await fetch(`/api/drafts?campaign_id=${cid}`);
      if (response.ok) {
        const data = await response.json();
        if (data.draft) {
          // If API returns draft, it means campaign is in drafted state
          return 'drafted';
        }
      }

      // Fallback: Check for latest status messages from campaign_status_updates
      // This table should have public read access
      const { data: statusData, error } = await supabase
        .schema('citia_mora_datamart')
        .from('campaign_status_updates')
        .select('agent_name, status, message, updated_at')
        .eq('campaign_id', cid)
        .order('updated_at', { ascending: false })
        .limit(100);

      if (error || !statusData || statusData.length === 0) {
        return 'idle';
      }

      // Check if any agent is processing
      const hasProcessing = statusData.some(
        (s) => s.status === 'processing' || s.status === 'thinking'
      );
      if (hasProcessing) {
        return 'processing';
      }

      // Check for latest status messages (check most recent first)
      const messages = statusData.map(s => s.message).filter(Boolean);
      
      // Check for approved/sent (cpgSent) - most recent takes priority
      const sentIndex = messages.findIndex(m => m?.includes('cpgSent'));
      const rejectedIndex = messages.findIndex(m => m?.includes('cpgRejected'));
      const draftedIndex = messages.findIndex(m => m?.includes('cpgDrafted'));

      // Find the most recent status
      const indices = [sentIndex, rejectedIndex, draftedIndex].filter(i => i !== -1);
      if (indices.length === 0) {
        return 'idle';
      }

      const mostRecentIndex = Math.min(...indices);
      
      if (mostRecentIndex === sentIndex) {
        return 'approved';
      }
      if (mostRecentIndex === rejectedIndex) {
        return 'rejected';
      }
      if (mostRecentIndex === draftedIndex) {
        return 'drafted';
      }

      return 'idle';
    } catch (error) {
      console.error('Error checking campaign state:', error);
      return 'idle';
    }
  };

  // Find latest draft campaign via API (to avoid permission issues)
  const findLatestDraftCampaign = async (): Promise<string | null> => {
    try {
      // Use API endpoint instead of direct Supabase query (avoids 403 permission errors)
      const response = await fetch('/api/drafts');
      if (!response.ok) {
        console.warn('⚠️ Failed to fetch draft campaign from API:', response.status);
        return null;
      }

      const data = await response.json();
      // Check both draft.campaign_id and campaign_id (API returns both)
      const foundCampaignId = data.draft?.campaign_id || data.campaign_id;
      if (foundCampaignId) {
        console.log('✅ Found draft campaign via API:', foundCampaignId);
        return foundCampaignId;
      }

      console.log('ℹ️ No draft campaign found via API');
      return null;
    } catch (error) {
      console.error('Error finding draft campaign:', error);
      return null;
    }
  };

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
              
              let savedCampaignId = localStorage.getItem('current_campaign_id');
              const savedExecutionId = localStorage.getItem('current_execution_id');
              const savedTimestamp = localStorage.getItem('current_campaign_timestamp');
              
              console.log('🔍 Checking localStorage for campaign session:', {
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
                  console.log('Campaign session expired (>24 hours), clearing localStorage');
                  localStorage.removeItem('current_campaign_id');
                  localStorage.removeItem('current_execution_id');
                  localStorage.removeItem('current_campaign_timestamp');
                  setRestoringSession(false);
                  return;
                }
              }
              
              // IMPORTANT: Skip 'pending' campaign_id (not a valid UUID)
              if (savedCampaignId === 'pending') {
                console.warn('⚠️ Saved campaign_id is "pending", skipping');
                localStorage.removeItem('current_campaign_id');
                savedCampaignId = null;
              }

              // First, ALWAYS check for latest draft campaign (regardless of localStorage)
              const latestDraftId = await findLatestDraftCampaign();
              console.log('🔍 Initial check - Latest draft campaign ID:', latestDraftId);
              
              if (latestDraftId) {
                const draftState = await checkCampaignState(latestDraftId);
                console.log('📋 Found draft campaign:', latestDraftId, 'State:', draftState);
                
                if (mounted) {
                  setDraftCampaignId(latestDraftId);
                  setCampaignState(draftState);
                  
                  if (draftState === 'drafted') {
                    setCampaignId(latestDraftId);
                    setActiveTab('output');
                    // Save to localStorage
                    if (typeof window !== 'undefined' && window.localStorage) {
                      localStorage.setItem('current_campaign_id', latestDraftId);
                      localStorage.setItem('current_campaign_timestamp', Date.now().toString());
                    }
                    console.log('✅ Set draft campaign and switched to output tab');
                  } else if (draftState === 'approved' || draftState === 'rejected') {
                    // Clear draft, allow new campaign
                    setDraftCampaignId(null);
                    setCampaignId(null);
                    setActiveTab('input');
                    if (typeof window !== 'undefined' && window.localStorage) {
                      localStorage.removeItem('current_campaign_id');
                      localStorage.removeItem('current_execution_id');
                      localStorage.removeItem('current_campaign_timestamp');
                    }
                  } else if (draftState === 'processing') {
                    // Still processing
                    setCampaignId(latestDraftId);
                    setActiveTab('input');
                  }
                }
              }
              
              // Also check saved campaign if no draft found or if we want to restore processing state
              if (savedCampaignId || savedExecutionId) {
                // No draft found, check saved campaign
                console.log('✅ Found saved campaign session, verifying status...');
                
                const state = await checkCampaignState(savedCampaignId);
                if (mounted) {
                  setCampaignState(state);
                  
                  if (state === 'processing') {
                    setCampaignId(savedCampaignId);
                    setExecutionId(savedExecutionId);
                    setActiveTab('input');
                  } else if (state === 'drafted') {
                    setCampaignId(savedCampaignId);
                    setDraftCampaignId(savedCampaignId);
                    setActiveTab('output');
                  } else {
                    // Finished or idle, clear
                    setCampaignId(null);
                    setExecutionId(null);
                    setDraftCampaignId(null);
                    setActiveTab('input');
                    if (typeof window !== 'undefined' && window.localStorage) {
                      localStorage.removeItem('current_campaign_id');
                      localStorage.removeItem('current_execution_id');
                      localStorage.removeItem('current_campaign_timestamp');
                    }
                  }
                }
              } else {
                // No saved campaign and no draft found above, but check one more time
                // (This handles case where findLatestDraftCampaign was called but returned null)
                console.log('ℹ️ No saved campaign, checking for drafts one more time...');
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

  // Monitor campaign state changes and check for drafts
  useEffect(() => {
    const checkForDrafts = async () => {
      // Always check for latest draft campaign on mount and periodically
      const latestDraftId = await findLatestDraftCampaign();
      if (latestDraftId) {
        const draftState = await checkCampaignState(latestDraftId);
        console.log('🔍 Periodic check - Found draft:', latestDraftId, 'State:', draftState);
        
        if (draftState === 'drafted') {
          setDraftCampaignId(latestDraftId);
          setCampaignState('drafted');
          setCampaignId(latestDraftId);
          if (activeTab !== 'output') {
            setActiveTab('output');
          }
        } else if (draftState === 'approved' || draftState === 'rejected') {
          setDraftCampaignId(null);
          setCampaignState(draftState);
          if (activeTab === 'output') {
            setActiveTab('input');
          }
        }
      } else {
        // No draft found
        if (campaignState === 'drafted' && !draftCampaignId) {
          setCampaignState('idle');
        }
      }
    };

    checkForDrafts();
    const interval = setInterval(checkForDrafts, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, []); // Run on mount and periodically, not dependent on campaignId

  // Monitor specific campaign state changes
  useEffect(() => {
    if (!campaignId || campaignId === 'pending') {
      if (!draftCampaignId) {
        setCampaignState('idle');
      }
      return;
    }

    const checkState = async () => {
      const state = await checkCampaignState(campaignId);
      console.log('🔍 Checking campaign state for', campaignId, '→', state);
      setCampaignState(state);
      
      if (state === 'drafted') {
        setDraftCampaignId(campaignId);
        setActiveTab('output');
      } else if (state === 'approved' || state === 'rejected') {
        setDraftCampaignId(null);
        setActiveTab('input');
        // Clear localStorage
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.removeItem('current_campaign_id');
          localStorage.removeItem('current_execution_id');
          localStorage.removeItem('current_campaign_timestamp');
        }
      }
    };

    checkState();
    const interval = setInterval(checkState, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [campaignId]);

  const handleApproveAndSend = async (selectedAudienceIds: string[]) => {
    if (!draftCampaignId) return;

    try {
      setError(null);
      
      // First approve
      const approveResponse = await fetch('/api/drafts/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          campaign_id: draftCampaignId,
          audience_ids: selectedAudienceIds,
        }),
      });

      if (!approveResponse.ok) {
        const errorData = await approveResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to approve drafts');
      }

      // Then send
      const sendResponse = await fetch('/api/drafts/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          campaign_id: draftCampaignId,
          audience_ids: selectedAudienceIds,
        }),
      });

      if (!sendResponse.ok) {
        const errorData = await sendResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to send broadcasts');
      }

      const sendData = await sendResponse.json();
      console.log('Send result:', sendData);

      // Wait a bit for status update to propagate
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Refresh state
      const state = await checkCampaignState(draftCampaignId);
      setCampaignState(state);
      
      if (state === 'approved') {
        setDraftCampaignId(null);
        setCampaignId(null);
        setActiveTab('input');
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.removeItem('current_campaign_id');
          localStorage.removeItem('current_execution_id');
          localStorage.removeItem('current_campaign_timestamp');
        }
      }
    } catch (error) {
      console.error('Error approving and sending:', error);
      setError(error instanceof Error ? error.message : 'Failed to approve and send');
      throw error; // Re-throw so component can handle it
    }
  };

  const handleReject = async () => {
    if (!draftCampaignId) return;

    try {
      setError(null);
      
      const response = await fetch('/api/drafts/reject', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          campaign_id: draftCampaignId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to reject campaign');
      }

      // Wait a bit for status update to propagate
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Refresh state
      const state = await checkCampaignState(draftCampaignId);
      setCampaignState(state);
      
      if (state === 'rejected') {
        setDraftCampaignId(null);
        setCampaignId(null);
        setActiveTab('input');
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.removeItem('current_campaign_id');
          localStorage.removeItem('current_execution_id');
          localStorage.removeItem('current_campaign_timestamp');
        }
      }
    } catch (error) {
      console.error('Error rejecting:', error);
      setError(error instanceof Error ? error.message : 'Failed to reject campaign');
      throw error; // Re-throw so component can handle it
    }
  };

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

    // Check if there's a draft that needs to be resolved first
    if (campaignState === 'drafted' && draftCampaignId) {
      setError('Please resolve the current draft campaign first (approve or reject).');
      setActiveTab('output');
      return;
    }

    setSubmitting(true);
    setError(null);
    setIsProcessing(false); // Reset processing state for new submission
    setCampaignId(null);
    setExecutionId(null);
    setDraftCampaignId(null);
    setCampaignState('idle');

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
      setCampaignState('processing');
      setActiveTab('input');
      
      // Save to localStorage for persistence with timestamp
      // IMPORTANT: Don't save 'pending' as campaign_id (it's not a valid UUID)
      if (typeof window !== 'undefined' && window.localStorage) {
        if (data.campaign_id && data.campaign_id !== 'pending') {
          localStorage.setItem('current_campaign_id', data.campaign_id);
          localStorage.setItem('current_campaign_timestamp', Date.now().toString());
          console.log('💾 Saved campaign_id to localStorage:', data.campaign_id);
        } else if (data.campaign_id === 'pending') {
          console.log('⚠️ Skipping save: campaign_id is "pending" (not a valid UUID)');
        }
        if (data.execution_id) {
          localStorage.setItem('current_execution_id', data.execution_id);
          console.log('💾 Saved execution_id to localStorage:', data.execution_id);
        }
      } else {
        console.warn('⚠️ localStorage not available, cannot save campaign session');
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

  // Determine if input should be locked
  const isInputLocked: boolean = campaignState === 'drafted' || (campaignState === 'approved' && !!draftCampaignId) || (campaignState === 'rejected' && !!draftCampaignId);
  const isProcessingState: boolean = campaignState === 'processing' || isProcessing;

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
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="input">Input</TabsTrigger>
          <TabsTrigger value="output">Output</TabsTrigger>
        </TabsList>

        {/* Input Tab */}
        <TabsContent value="input" className="space-y-6">
          {/* Status Display Area - Always show if we have a campaignId (draft or processing) */}
          {(campaignId || draftCampaignId) && (
            <StatusDisplay 
              campaignId={campaignId || draftCampaignId} 
              executionId={executionId}
              onProcessingChange={setIsProcessing}
            />
          )}

          {/* Error Messages */}
          {error && (
            <Alert className="border-red-500 bg-red-50 dark:bg-red-950">
              <AlertDescription className="text-red-700 dark:text-red-300">{error}</AlertDescription>
            </Alert>
          )}

          {/* Campaign Form */}
          <form onSubmit={handleSubmit} className={`space-y-6 transition-opacity duration-300 ${isInputLocked || isProcessingState ? 'opacity-50 pointer-events-none' : ''}`}>
            <CampaignForm 
              value={notes} 
              onChange={setNotes} 
              disabled={submitting || isProcessingState || isInputLocked} 
            />

            <ImageUpload 
              onImageSelect={setImageFile} 
              disabled={submitting || isProcessingState || isInputLocked} 
            />

            {/* Generate Button */}
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={submitting || isProcessingState || isInputLocked || !notes.trim()}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all px-8 py-6 text-lg font-semibold uppercase disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : isProcessingState ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : isInputLocked ? (
                  'Resolve Draft First'
                ) : (
                  'GENERATE'
                )}
              </Button>
            </div>
          </form>

          {/* Lock Message */}
          {isInputLocked && (
            <Alert className="border-orange-500 bg-orange-50 dark:bg-orange-950">
              <AlertDescription className="text-orange-700 dark:text-orange-300">
                {campaignState === 'drafted' 
                  ? 'Please review and approve/reject the draft campaign in the Output tab first.'
                  : campaignState === 'approved'
                  ? 'Previous campaign has been sent. You can now create a new campaign.'
                  : 'Previous campaign has been rejected. You can now create a new campaign.'}
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>

        {/* Output Tab */}
        <TabsContent value="output" className="space-y-6">
          {campaignState === 'processing' ? (
            <div className="space-y-4">
              <StatusDisplay 
                campaignId={campaignId} 
                executionId={executionId}
                onProcessingChange={setIsProcessing}
              />
              <Alert>
                <AlertDescription>
                  Campaign is still processing. Draft will appear here once content is ready.
                </AlertDescription>
              </Alert>
            </div>
          ) : campaignState === 'drafted' && draftCampaignId ? (
            <DraftOutput
              campaignId={draftCampaignId}
              onApproveAndSend={handleApproveAndSend}
              onReject={handleReject}
            />
          ) : draftCampaignId ? (
            // If we have draftCampaignId but state is not 'drafted', still try to show it
            <DraftOutput
              campaignId={draftCampaignId}
              onApproveAndSend={handleApproveAndSend}
              onReject={handleReject}
            />
          ) : campaignState === 'approved' ? (
            <div className="space-y-4">
              <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                <AlertDescription className="text-green-700 dark:text-green-300">
                  Campaign has been approved and sent successfully. You can now create a new campaign in the Input tab.
                </AlertDescription>
              </Alert>
              {campaignId && (
                <StatusDisplay 
                  campaignId={campaignId} 
                  executionId={executionId}
                  onProcessingChange={setIsProcessing}
                />
              )}
            </div>
          ) : campaignState === 'rejected' ? (
            <div className="space-y-4">
              <Alert className="border-orange-500 bg-orange-50 dark:bg-orange-950">
                <AlertDescription className="text-orange-700 dark:text-orange-300">
                  Campaign has been rejected. You can now create a new campaign in the Input tab.
                </AlertDescription>
              </Alert>
              {campaignId && (
                <StatusDisplay 
                  campaignId={campaignId} 
                  executionId={executionId}
                  onProcessingChange={setIsProcessing}
                />
              )}
            </div>
          ) : (
            <Alert>
              <AlertDescription>
                No draft available. Generate a campaign first in the Input tab.
                {process.env.NODE_ENV === 'development' && (
                  <div className="mt-2 text-xs text-gray-500">
                    Debug: campaignState={campaignState}, draftCampaignId={draftCampaignId || 'null'}, campaignId={campaignId || 'null'}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

