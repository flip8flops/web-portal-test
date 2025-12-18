'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/src/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Ban, AlertCircle } from 'lucide-react';

interface StatusUpdate {
  agent_name: string;
  status: string;
  message: string | null;
  progress: number;
  updated_at: string;
  metadata?: {
    workflow_point?: string;
    [key: string]: any;
  };
}

interface StatusDisplayProps {
  campaignId: string | null;
  executionId?: string | null;
  onProcessingChange?: (isProcessing: boolean) => void;
  onDrafted?: (campaignId: string) => void;
}

const agentLabels: Record<string, string> = {
  guardrails: 'Guardrails In',
  guardrails_qc: 'Guardrails Out',
  research_agent: 'Research Agent',
  matchmaker_agent: 'Matchmaker Agent',
  content_maker_agent: 'Content Maker Agent',
};

const statusIcons: Record<string, React.ReactNode> = {
  thinking: <Loader2 className="h-4 w-4 animate-spin" />,
  processing: <Loader2 className="h-4 w-4 animate-spin" />,
  completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  error: <XCircle className="h-4 w-4 text-red-500" />,
  rejected: <Ban className="h-4 w-4 text-orange-500" />,
};

const statusColors: Record<string, string> = {
  thinking: 'text-blue-600',
  processing: 'text-blue-600',
  completed: 'text-green-600',
  error: 'text-red-600',
  rejected: 'text-orange-600',
};

export function StatusDisplay({ campaignId, executionId, onProcessingChange, onDrafted }: StatusDisplayProps) {
  const [statuses, setStatuses] = useState<Record<string, StatusUpdate>>({});
  const [loading, setLoading] = useState(false);
  // Use ref to track current IDs and prevent race conditions
  const currentIdsRef = useRef<{ campaignId: string | null; executionId: string | null | undefined }>({
    campaignId: null,
    executionId: null,
  });

  // Notify parent when processing status changes and when campaign becomes drafted
  useEffect(() => {
    if (!onProcessingChange) return;
    
    const isProcessing = Object.values(statuses).some(
      (status) => status.status === 'thinking' || status.status === 'processing'
    );
    
    onProcessingChange(isProcessing);
    
    // Check if campaign is drafted (all agents completed, including guardrails_qc)
    if (!isProcessing && Object.keys(statuses).length > 0 && campaignId && campaignId !== 'pending') {
      const allAgents = ['guardrails', 'research_agent', 'matchmaker_agent', 'content_maker_agent', 'guardrails_qc'];
      const allFinished = allAgents.every((agent) => {
        const status = statuses[agent];
        return !status || // Agent belum mulai (tidak perlu check)
               status.status === 'completed' || 
               status.status === 'rejected' || 
               status.status === 'error';
      });
      
      // Check if content_maker_agent and guardrails_qc are both completed (indicates draft is ready)
      const contentMakerCompleted = statuses['content_maker_agent']?.status === 'completed';
      const guardrailsQCCompleted = statuses['guardrails_qc']?.status === 'completed';
      
      if (allFinished && contentMakerCompleted && guardrailsQCCompleted && onDrafted) {
        console.log('✅ All agents finished and draft is ready, notifying parent:', campaignId);
        // IMPORTANT: Notify parent that campaign is drafted
        // DO NOT clear localStorage here - parent will handle it
        onDrafted(campaignId);
      }
    }
  }, [statuses, onProcessingChange, onDrafted, campaignId]);

  useEffect(() => {
    console.log('StatusDisplay: useEffect triggered', { campaignId, executionId });
    
    // Check if IDs have changed - if so, clear statuses immediately
    const idsChanged = 
      currentIdsRef.current.campaignId !== campaignId || 
      currentIdsRef.current.executionId !== executionId;
    
    if (idsChanged) {
      console.log('StatusDisplay: IDs changed, clearing statuses immediately');
      setStatuses({});
      // Update ref immediately to prevent any stale updates
      currentIdsRef.current = { campaignId, executionId };
    }
    
    // Need either campaignId (not 'pending') or executionId
    const hasValidId = (campaignId && campaignId !== 'pending') || executionId;
    
    if (!hasValidId) {
      console.log('StatusDisplay: No valid ID, clearing statuses');
      setStatuses({});
      currentIdsRef.current = { campaignId: null, executionId: null };
      return;
    }

    console.log('StatusDisplay: Starting fetch with ID:', { campaignId, executionId });
    setLoading(true);

    // Store current IDs in ref and local variables
    currentIdsRef.current = { campaignId, executionId };
    const currentCampaignId = campaignId;
    const currentExecutionId = executionId;
    
    // Initial fetch
    const fetchStatuses = async () => {
      // Check if IDs have changed (new submission) - don't fetch with stale IDs
      // Use ref to get latest values
      if (currentIdsRef.current.campaignId !== currentCampaignId || 
          currentIdsRef.current.executionId !== currentExecutionId) {
        console.log('StatusDisplay: IDs changed, skipping fetch');
        return;
      }
      
      try {
        // Query directly to citia_mora_datamart schema
        // Schema must be exposed in Supabase Data API settings
        let query = supabase
          .schema('citia_mora_datamart')
          .from('campaign_status_updates')
          .select('agent_name, status, message, progress, updated_at, campaign_id, execution_id, metadata');

        // Query by campaign_id if available and not 'pending'
        if (currentCampaignId && currentCampaignId !== 'pending') {
          query = query.eq('campaign_id', currentCampaignId);
        } 
        // Fallback to execution_id
        else if (currentExecutionId) {
          query = query.eq('execution_id', currentExecutionId);
        } 
        // If no ID yet, query recent updates (last 5 minutes) and filter client-side
        else {
          // Query recent updates (last 5 minutes) as fallback
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          query = query.gte('created_at', fiveMinutesAgo).limit(50);
        }

        // IMPORTANT: Order by updated_at DESC to get latest statuses first
        // This ensures we capture all guardrails updates (initial and QC)
        const { data, error } = await query.order('updated_at', { ascending: false });

        if (error) {
          console.error('StatusDisplay: Error fetching statuses:', error);
          console.error('StatusDisplay: Error details:', JSON.stringify(error, null, 2));
          setLoading(false);
          return;
        }

        console.log('StatusDisplay: Fetched statuses:', data?.length || 0, 'records');
        if (data && data.length > 0) {
          console.log('StatusDisplay: Sample record:', {
            agent_name: data[0].agent_name,
            status: data[0].status,
            message: data[0].message?.substring(0, 50),
            execution_id: data[0].execution_id,
            campaign_id: data[0].campaign_id,
          });
        } else {
          console.warn('StatusDisplay: No records found. Check:');
          console.warn('  - Is execution_id correct?', executionId);
          console.warn('  - Is campaign_id correct?', campaignId);
          console.warn('  - Are status updates being inserted in n8n workflow?');
        }

        // Get latest status per agent
        // Special handling: guardrails appears twice (initial and QC), need to differentiate
        const latestStatuses: Record<string, StatusUpdate> = {};
        const guardrailsUpdates: Array<{ update: any; timestamp: Date }> = [];
        
        if (data) {
          data.forEach((update: any) => {
            // Double-check executionId filter (prevent stale data)
            if (currentExecutionId && update.execution_id !== currentExecutionId) {
              return;
            }
            // Double-check campaignId filter (prevent stale data)
            if (currentCampaignId && currentCampaignId !== 'pending' && update.campaign_id !== currentCampaignId) {
              return;
            }
            
            // Special handling for guardrails: collect ALL guardrails updates (both initial and QC)
            // IMPORTANT: We need to collect ALL guardrails updates to properly separate initial vs QC
            if (update.agent_name === 'guardrails') {
              guardrailsUpdates.push({
                update,
                timestamp: new Date(update.updated_at)
              });
            } else {
              // For other agents, use standard logic
              if (!latestStatuses[update.agent_name] || 
                  new Date(update.updated_at) > new Date(latestStatuses[update.agent_name].updated_at)) {
                latestStatuses[update.agent_name] = update as StatusUpdate;
              }
            }
          });
          
          // Process guardrails updates: separate into initial and QC
          if (guardrailsUpdates.length > 0) {
            // Sort by timestamp
            guardrailsUpdates.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            
            // Get content_maker_agent status to determine if we're past that phase
            const contentMakerStatus = latestStatuses['content_maker_agent'];
            const contentMakerTime = contentMakerStatus ? new Date(contentMakerStatus.updated_at) : null;
            
            // Separate guardrails into initial (before content_maker) and QC (after content_maker)
            guardrailsUpdates.forEach(({ update, timestamp }) => {
              const metadata = update.metadata || {};
              const workflowPoint = metadata.workflow_point || '';
              
              // Check if this is QC phase guardrails:
              // 1. workflow_point indicates QC phase (guardrails_checking, guardrails_completed, guardrails_error), OR
              // 2. It comes after content_maker_agent completed
              // Initial guardrails have workflow_point: start, guardrails_accepted, guardrails_rejected
              const isQC = workflowPoint.includes('guardrails_checking') || 
                          workflowPoint.includes('guardrails_completed') ||
                          workflowPoint.includes('guardrails_error') ||
                          (contentMakerTime && timestamp > contentMakerTime);
              
              // Ensure initial guardrails are NOT marked as QC
              // Initial guardrails have: start, guardrails_accepted, guardrails_rejected
              const isInitial = workflowPoint === 'start' || 
                                workflowPoint.includes('guardrails_accepted') ||
                                workflowPoint.includes('guardrails_rejected');
              
              // If it's clearly initial, force it to NOT be QC
              if (isInitial) {
                // This is definitely initial guardrails
                if (!latestStatuses['guardrails'] || 
                    timestamp > new Date(latestStatuses['guardrails'].updated_at)) {
                  latestStatuses['guardrails'] = update as StatusUpdate;
                }
                return; // Skip QC check for initial guardrails
              }
              
              if (isQC) {
                // This is QC guardrails - store as guardrails_qc
                if (!latestStatuses['guardrails_qc'] || 
                    timestamp > new Date(latestStatuses['guardrails_qc'].updated_at)) {
                  latestStatuses['guardrails_qc'] = update as StatusUpdate;
                }
              } else {
                // This is initial guardrails
                if (!latestStatuses['guardrails'] || 
                    timestamp > new Date(latestStatuses['guardrails'].updated_at)) {
                  latestStatuses['guardrails'] = update as StatusUpdate;
                }
              }
            });
          }
        }
        
        // Only update statuses if IDs haven't changed (prevent flickering)
        // Use ref to check latest values
        if (currentIdsRef.current.campaignId === currentCampaignId && 
            currentIdsRef.current.executionId === currentExecutionId) {
          setStatuses(latestStatuses);
        } else {
          console.log('StatusDisplay: IDs changed during fetch, ignoring results');
        }
        setLoading(false);
      } catch (err) {
        console.error('Error in fetchStatuses:', err);
        setLoading(false);
      }
    };

    // Fetch immediately
    fetchStatuses();

    // Set up polling as fallback (every 2 seconds for first 30 seconds, then every 5 seconds)
    let pollCount = 0;
    const pollInterval = setInterval(() => {
      // Check if IDs have changed (new submission) - use ref for latest values
      if (currentIdsRef.current.campaignId !== currentCampaignId || 
          currentIdsRef.current.executionId !== currentExecutionId) {
        console.log('StatusDisplay: IDs changed, stopping polling');
        clearInterval(pollInterval);
        return;
      }
      pollCount++;
      fetchStatuses();
      // After 15 polls (30 seconds), reduce frequency to every 5 seconds
      if (pollCount >= 15) {
        clearInterval(pollInterval);
        const slowPollInterval = setInterval(() => {
          // Check if IDs have changed (new submission) - use ref for latest values
          if (currentIdsRef.current.campaignId !== currentCampaignId || 
              currentIdsRef.current.executionId !== currentExecutionId) {
            console.log('StatusDisplay: IDs changed, stopping slow polling');
            clearInterval(slowPollInterval);
            return;
          }
          fetchStatuses();
        }, 5000);
        // Clear slow polling after 5 minutes total
        setTimeout(() => {
          clearInterval(slowPollInterval);
        }, 5 * 60 * 1000);
      }
    }, 2000);

    // Subscribe to real-time updates
    let channel: ReturnType<typeof supabase.channel> | null = null;
    
    try {
      const channelName = `campaign_status:${currentCampaignId || currentExecutionId || 'unknown'}`;
      let filter: string;
      
      if (currentCampaignId && currentCampaignId !== 'pending') {
        filter = `campaign_id=eq.${currentCampaignId}`;
      } else if (currentExecutionId) {
        filter = `execution_id=eq.${currentExecutionId}`;
      } else {
        // No filter available, rely on polling only
        console.warn('StatusDisplay: No filter available (no campaign_id or execution_id), using polling only');
        return;
      }

      console.log('StatusDisplay: Setting up real-time subscription:', { channelName, filter });

      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'citia_mora_datamart',
            table: 'campaign_status_updates',
            filter: filter,
          },
          (payload) => {
            // Check if IDs have changed (new submission) - ignore updates from old execution
            // Use ref to get latest values
            if (currentIdsRef.current.campaignId !== currentCampaignId || 
                currentIdsRef.current.executionId !== currentExecutionId) {
              console.log('StatusDisplay: Ignoring update from old execution');
              return;
            }
            console.log('StatusDisplay: Real-time update received:', payload);
            if (payload.new) {
              const update = payload.new as StatusUpdate;
              // Double-check execution_id or campaign_id matches
              const updateExecutionId = (payload.new as any).execution_id;
              const updateCampaignId = (payload.new as any).campaign_id;
              if (currentExecutionId && updateExecutionId !== currentExecutionId) {
                console.log('StatusDisplay: Ignoring update - execution_id mismatch');
                return;
              }
              if (currentCampaignId && currentCampaignId !== 'pending' && updateCampaignId !== currentCampaignId) {
                console.log('StatusDisplay: Ignoring update - campaign_id mismatch');
                return;
              }
              // Final check with ref before updating
              if (currentIdsRef.current.campaignId !== currentCampaignId || 
                  currentIdsRef.current.executionId !== currentExecutionId) {
                console.log('StatusDisplay: IDs changed during real-time update, ignoring');
                return;
              }
              
              // Special handling for guardrails: check if it's QC phase
              let agentKey = update.agent_name;
              if (update.agent_name === 'guardrails') {
                const metadata = update.metadata || {};
                const workflowPoint = metadata.workflow_point || '';
                
                // Check if this is initial guardrails (start, guardrails_accepted, guardrails_rejected)
                const isInitial = workflowPoint === 'start' || 
                                  workflowPoint.includes('guardrails_accepted') ||
                                  workflowPoint.includes('guardrails_rejected');
                
                if (isInitial) {
                  // This is initial guardrails - keep as 'guardrails'
                  agentKey = 'guardrails';
                } else if (workflowPoint.includes('guardrails_checking') || 
                           workflowPoint.includes('guardrails_completed') ||
                           workflowPoint.includes('guardrails_error')) {
                  // This is QC phase guardrails
                  agentKey = 'guardrails_qc';
                } else {
                  // If workflow_point is unclear, check timestamp relative to content_maker
                  const currentStatuses = statuses;
                  const contentMakerStatus = currentStatuses['content_maker_agent'];
                  if (contentMakerStatus && contentMakerStatus.status === 'completed') {
                    const contentMakerTime = new Date(contentMakerStatus.updated_at);
                    const updateTime = new Date(update.updated_at);
                    if (updateTime > contentMakerTime) {
                      agentKey = 'guardrails_qc';
                    } else {
                      agentKey = 'guardrails';
                    }
                  } else {
                    // No content_maker yet, assume initial
                    agentKey = 'guardrails';
                  }
                }
              }
              
              console.log('StatusDisplay: Updating status for agent:', agentKey, {
                status: update.status,
                message: update.message?.substring(0, 50) + '...',
              });
              setStatuses((prev) => ({
                ...prev,
                [agentKey]: update,
              }));
            }
          }
        )
        .subscribe((status, err) => {
          console.log('StatusDisplay: Subscription status:', status);
          if (status === 'SUBSCRIBED') {
            console.log('✅ StatusDisplay: Real-time subscription active');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ StatusDisplay: Real-time subscription error:', err);
            console.error('StatusDisplay: This usually means Realtime is not enabled for the table');
            console.error('StatusDisplay: Check SUPABASE-REALTIME-SETUP.md for instructions');
          } else if (status === 'TIMED_OUT') {
            console.warn('⚠️ StatusDisplay: Real-time subscription timed out');
          } else if (status === 'CLOSED') {
            console.warn('⚠️ StatusDisplay: Real-time subscription closed');
          }
        });
    } catch (err) {
      console.error('Error setting up real-time subscription:', err);
    }

    return () => {
      clearInterval(pollInterval);
      if (channel) {
        console.log('StatusDisplay: Cleaning up subscription');
        supabase.removeChannel(channel);
      }
      // Clear statuses on cleanup to prevent flickering
      setStatuses({});
    };
  }, [campaignId, executionId]);

  // Show empty state if no valid ID
  const hasValidId = (campaignId && campaignId !== 'pending') || executionId;
  if (!hasValidId) {
    return (
      <Card className="border-0 shadow-lg bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
        <CardContent className="p-6">
          <div className="text-center text-gray-500 dark:text-gray-400">
            <p>Ready to create a campaign</p>
            <p className="text-sm mt-1">Status will appear here after you generate a campaign</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show loading state
  if (loading && Object.keys(statuses).length === 0) {
    return (
      <Card className="border-0 shadow-lg bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            <span className="ml-2 text-gray-600 dark:text-gray-400">Loading status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show statuses
  // Include guardrails_qc in the list (will be shown after content_maker_agent)
  const agents = ['guardrails', 'research_agent', 'matchmaker_agent', 'content_maker_agent', 'guardrails_qc'];
  const hasAnyStatus = agents.some((agent) => statuses[agent]);

  if (!hasAnyStatus) {
    return (
      <Card className="border-0 shadow-lg bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
        <CardContent className="p-6">
          <div className="text-center text-gray-500 dark:text-gray-400">
            <p>Waiting for status updates...</p>
            <p className="text-sm mt-1">Agents will start processing soon</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <style>{`
        @keyframes dot-blink {
          0%, 80%, 100% { 
            opacity: 0.3; 
            transform: scale(0.8);
          }
          40% { 
            opacity: 1; 
            transform: scale(1.2);
          }
        }
        .dot-1 { 
          animation: dot-blink 1.4s infinite; 
          animation-delay: 0s; 
        }
        .dot-2 { 
          animation: dot-blink 1.4s infinite; 
          animation-delay: 0.2s; 
        }
        .dot-3 { 
          animation: dot-blink 1.4s infinite; 
          animation-delay: 0.4s; 
        }
      `}</style>
      <Card className="border-0 shadow-lg bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
        <CardContent className="p-6">
          <div className="space-y-4">
          {agents.map((agent) => {
            const status = statuses[agent];
            if (!status) return null;

            const label = agentLabels[agent] || agent;
            const icon = statusIcons[status.status] || <AlertCircle className="h-4 w-4" />;
            const color = statusColors[status.status] || 'text-gray-600';

            const isCompleted = status.status === 'completed';
            const isProcessing = status.status === 'thinking' || status.status === 'processing';
            const isError = status.status === 'error';
            const isRejected = status.status === 'rejected';
            
            // Find the last agent with status (the one currently processing or most recent)
            // Check if this is the last agent that has a status in the ordered list
            const agentsWithStatus = agents.filter(a => statuses[a]);
            const currentAgentIndexInList = agentsWithStatus.indexOf(agent);
            const isLastAgentWithStatus = currentAgentIndexInList === agentsWithStatus.length - 1;
            
            // Only show message detail for:
            // 1. Agent yang sedang processing/thinking (always show)
            // 2. Agent terakhir yang ada status (jika completed/rejected/error, show detail hanya untuk yang terakhir)
            // 3. Error status (always show)
            // Agent yang completed/rejected di atas (bukan yang terakhir) TIDAK show detail
            // Logic: hanya show detail jika processing/error ATAU (completed/rejected DAN ini agent terakhir)
            const shouldShowMessage = isProcessing || isError || (isLastAgentWithStatus && (isCompleted || isRejected));
            const hasMessage = status.message && status.message.trim().length > 0;

            return (
              <div key={agent} className="flex items-start gap-3">
                <div className={`mt-0.5 ${color}`}>{icon}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{label}</span>
                    <Badge
                      variant="outline"
                      className={`text-xs ${color} border-current`}
                    >
                      {status.status}
                    </Badge>
                  </div>
                  {/* Show message detail only for:
                      1. Agent yang sedang processing/thinking (always show)
                      2. Agent terakhir yang ada status (jika completed/rejected/error, show detail)
                      3. Error status (always show) */}
                  {shouldShowMessage && hasMessage && (
                    <>
                      <p className={`text-sm flex items-center gap-1 mt-1 ${
                        isError 
                          ? 'text-red-600 dark:text-red-400 font-semibold' 
                          : isRejected
                          ? 'text-orange-600 dark:text-orange-400'
                          : isCompleted
                          ? 'text-gray-600 dark:text-gray-400'
                          : 'text-gray-600 dark:text-gray-400'
                      }`}>
                        <span>{status.message}</span>
                        {isProcessing && (
                          <span className="inline-flex gap-1 ml-1 items-center">
                            <span className="dot-1 inline-block w-2.5 h-2.5 rounded-full bg-current opacity-30"></span>
                            <span className="dot-2 inline-block w-2.5 h-2.5 rounded-full bg-current opacity-30"></span>
                            <span className="dot-3 inline-block w-2.5 h-2.5 rounded-full bg-current opacity-30"></span>
                          </span>
                        )}
                      </p>
                      {status.progress > 0 && status.progress < 100 && (
                        <div className="mt-2">
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                            <div
                              className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                              style={{ width: `${status.progress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {/* Show default message for error if no message provided */}
                  {isError && !hasMessage && (
                    <p className="text-sm text-red-600 dark:text-red-400 font-semibold mt-1">
                      An error occurred
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

