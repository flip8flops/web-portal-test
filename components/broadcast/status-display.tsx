'use client';

import { useEffect, useState } from 'react';
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
}

interface StatusDisplayProps {
  campaignId: string | null;
  executionId?: string | null;
  onProcessingChange?: (isProcessing: boolean) => void;
}

const agentLabels: Record<string, string> = {
  guardrails: 'Guardrails',
  research_agent: 'Research Agent',
  matchmaker_agent: 'Matchmaker Agent',
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

export function StatusDisplay({ campaignId, executionId, onProcessingChange }: StatusDisplayProps) {
  const [statuses, setStatuses] = useState<Record<string, StatusUpdate>>({});
  const [loading, setLoading] = useState(false);

  // Notify parent when processing status changes
  useEffect(() => {
    if (!onProcessingChange) return;
    
    const isProcessing = Object.values(statuses).some(
      (status) => status.status === 'thinking' || status.status === 'processing'
    );
    
    onProcessingChange(isProcessing);
  }, [statuses, onProcessingChange]);

  useEffect(() => {
    console.log('StatusDisplay: useEffect triggered', { campaignId, executionId });
    
    // Need either campaignId (not 'pending') or executionId
    const hasValidId = (campaignId && campaignId !== 'pending') || executionId;
    
    if (!hasValidId) {
      console.log('StatusDisplay: No valid ID, clearing statuses');
      setStatuses({});
      return;
    }

    console.log('StatusDisplay: Starting fetch with ID:', { campaignId, executionId });
    setLoading(true);

    // Initial fetch
    const fetchStatuses = async () => {
      try {
        // Query directly to citia_mora_datamart schema
        // Schema must be exposed in Supabase Data API settings
        let query = supabase
          .schema('citia_mora_datamart')
          .from('campaign_status_updates')
          .select('agent_name, status, message, progress, updated_at, campaign_id, execution_id');

        // Query by campaign_id if available and not 'pending'
        if (campaignId && campaignId !== 'pending') {
          query = query.eq('campaign_id', campaignId);
        } 
        // Fallback to execution_id
        else if (executionId) {
          query = query.eq('execution_id', executionId);
        } 
        // If no ID yet, query recent updates (last 5 minutes) and filter client-side
        else {
          // Query recent updates (last 5 minutes) as fallback
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          query = query.gte('created_at', fiveMinutesAgo).limit(50);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

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
        const latestStatuses: Record<string, StatusUpdate> = {};
        if (data) {
          data.forEach((update: any) => {
            // If we have executionId, filter by it
            if (executionId && update.execution_id !== executionId) {
              return;
            }
            // If we have campaignId, filter by it
            if (campaignId && campaignId !== 'pending' && update.campaign_id !== campaignId) {
              return;
            }
            
            if (!latestStatuses[update.agent_name] || 
                new Date(update.updated_at) > new Date(latestStatuses[update.agent_name].updated_at)) {
              latestStatuses[update.agent_name] = update as StatusUpdate;
            }
          });
        }
        setStatuses(latestStatuses);
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
      pollCount++;
      fetchStatuses();
      // After 15 polls (30 seconds), reduce frequency to every 5 seconds
      if (pollCount >= 15) {
        clearInterval(pollInterval);
        const slowPollInterval = setInterval(() => {
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
      const channelName = `campaign_status:${campaignId || executionId || 'unknown'}`;
      let filter: string;
      
      if (campaignId && campaignId !== 'pending') {
        filter = `campaign_id=eq.${campaignId}`;
      } else if (executionId) {
        filter = `execution_id=eq.${executionId}`;
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
            console.log('StatusDisplay: Real-time update received:', payload);
            if (payload.new) {
              const update = payload.new as StatusUpdate;
              console.log('StatusDisplay: Updating status for agent:', update.agent_name, {
                status: update.status,
                message: update.message?.substring(0, 50) + '...',
              });
              setStatuses((prev) => ({
                ...prev,
                [update.agent_name]: update,
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
        supabase.removeChannel(channel);
      }
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
  const agents = ['guardrails', 'research_agent', 'matchmaker_agent'];
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
            // Show message for processing, error, or final status (completed/rejected)
            const shouldShowMessage = isProcessing || isError || isCompleted || isRejected;
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
                  {/* Show message detail for processing, error, or final status (completed/rejected) */}
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

