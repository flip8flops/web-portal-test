'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/src/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, Ban, AlertCircle, Upload } from 'lucide-react';

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

export function StatusDisplay({ campaignId, executionId, onProcessingChange }: StatusDisplayProps) {
  const [statuses, setStatuses] = useState<Record<string, StatusUpdate>>({});
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const currentIdsRef = useRef<{ campaignId: string | null; executionId: string | null | undefined }>({
    campaignId: null,
    executionId: null,
  });

  // Handle sync to Citia
  const handleSync = async () => {
    if (!campaignId || syncing) return;
    
    setSyncing(true);
    setSyncMessage(null);
    
    try {
      console.log('📤 [StatusDisplay] Triggering sync for campaign:', campaignId);
      
      const response = await fetch('/api/broadcast/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Sync failed');
      }
      
      console.log('✅ [StatusDisplay] Sync succeeded:', result);
      setSyncMessage({ type: 'success', text: 'Sync berhasil! Data telah dikirim ke Citia.' });
      
      // Clear success message after 5 seconds
      setTimeout(() => setSyncMessage(null), 5000);
      
    } catch (error) {
      console.error('❌ [StatusDisplay] Sync error:', error);
      setSyncMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Sync gagal. Silakan coba lagi.' 
      });
    } finally {
      setSyncing(false);
    }
  };

  // Notify parent when processing status changes
  useEffect(() => {
    if (!onProcessingChange) return;
    
    const isProcessing = Object.values(statuses).some(
      (status) => status.status === 'thinking' || status.status === 'processing'
    );
    
    onProcessingChange(isProcessing);
  }, [statuses, onProcessingChange]);

  useEffect(() => {
    console.log('[StatusDisplay] useEffect triggered', { campaignId, executionId });
    
    // Check if IDs have changed - if so, clear statuses immediately
    const idsChanged = 
      currentIdsRef.current.campaignId !== campaignId || 
      currentIdsRef.current.executionId !== executionId;
    
    if (idsChanged) {
      console.log('[StatusDisplay] IDs changed, clearing statuses');
      setStatuses({});
      currentIdsRef.current = { campaignId, executionId };
    }
    
    // Need either campaignId (not 'pending') or executionId
    const hasValidId = (campaignId && campaignId !== 'pending') || executionId;
    
    if (!hasValidId) {
      console.log('[StatusDisplay] No valid ID, clearing statuses');
      setStatuses({});
      currentIdsRef.current = { campaignId: null, executionId: null };
      return;
    }

    console.log('[StatusDisplay] Starting fetch with ID:', { campaignId, executionId });
    setLoading(true);

    currentIdsRef.current = { campaignId, executionId };
    const currentCampaignId = campaignId;
    const currentExecutionId = executionId;
    
    const fetchStatuses = async () => {
      if (currentIdsRef.current.campaignId !== currentCampaignId || 
          currentIdsRef.current.executionId !== currentExecutionId) {
        console.log('[StatusDisplay] IDs changed, skipping fetch');
        return;
      }
      
      try {
        let query = supabase
          .schema('citia_mora_datamart')
          .from('campaign_status_updates')
          .select('agent_name, status, message, progress, updated_at, campaign_id, execution_id, metadata');

        if (currentCampaignId && currentCampaignId !== 'pending') {
          query = query.eq('campaign_id', currentCampaignId);
        } else if (currentExecutionId) {
          query = query.eq('execution_id', currentExecutionId);
        } else {
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          query = query.gte('created_at', fiveMinutesAgo).limit(50);
        }

        const { data, error } = await query.order('updated_at', { ascending: false });

        if (error) {
          console.error('[StatusDisplay] Error fetching statuses:', error);
          setLoading(false);
          return;
        }

        console.log('[StatusDisplay] Fetched', data?.length || 0, 'records');

        const latestStatuses: Record<string, StatusUpdate> = {};
        const guardrailsUpdates: Array<{ update: any; timestamp: Date }> = [];
        
        if (data) {
          data.forEach((update: any) => {
            if (currentExecutionId && update.execution_id !== currentExecutionId) return;
            if (currentCampaignId && currentCampaignId !== 'pending' && update.campaign_id !== currentCampaignId) return;
            
            if (update.agent_name === 'guardrails') {
              guardrailsUpdates.push({ update, timestamp: new Date(update.updated_at) });
            } else {
              if (!latestStatuses[update.agent_name] || 
                  new Date(update.updated_at) > new Date(latestStatuses[update.agent_name].updated_at)) {
                latestStatuses[update.agent_name] = update as StatusUpdate;
              }
            }
          });
          
          // Process guardrails: separate initial vs QC
          if (guardrailsUpdates.length > 0) {
            guardrailsUpdates.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            
            const contentMakerStatus = latestStatuses['content_maker_agent'];
            const contentMakerTime = contentMakerStatus ? new Date(contentMakerStatus.updated_at) : null;
            
            guardrailsUpdates.forEach(({ update, timestamp }) => {
              const metadata = update.metadata || {};
              const workflowPoint = metadata.workflow_point || '';
              
              const isInitial = workflowPoint === 'start' || 
                                workflowPoint.includes('guardrails_accepted') ||
                                workflowPoint.includes('guardrails_rejected');
              
              if (isInitial) {
                if (!latestStatuses['guardrails'] || 
                    timestamp > new Date(latestStatuses['guardrails'].updated_at)) {
                  latestStatuses['guardrails'] = update as StatusUpdate;
                }
                return;
              }
              
              const isQC = workflowPoint.includes('guardrails_checking') || 
                          workflowPoint.includes('guardrails_completed') ||
                          workflowPoint.includes('guardrails_error') ||
                          (contentMakerTime && timestamp > contentMakerTime);
              
              if (isQC) {
                if (!latestStatuses['guardrails_qc'] || 
                    timestamp > new Date(latestStatuses['guardrails_qc'].updated_at)) {
                  latestStatuses['guardrails_qc'] = update as StatusUpdate;
                }
              } else {
                if (!latestStatuses['guardrails'] || 
                    timestamp > new Date(latestStatuses['guardrails'].updated_at)) {
                  latestStatuses['guardrails'] = update as StatusUpdate;
                }
              }
            });
          }
        }
        
        if (currentIdsRef.current.campaignId === currentCampaignId && 
            currentIdsRef.current.executionId === currentExecutionId) {
          setStatuses(latestStatuses);
        }
        setLoading(false);
      } catch (err) {
        console.error('Error in fetchStatuses:', err);
        setLoading(false);
      }
    };

    fetchStatuses();

    // Polling
    let pollCount = 0;
    const pollInterval = setInterval(() => {
      if (currentIdsRef.current.campaignId !== currentCampaignId || 
          currentIdsRef.current.executionId !== currentExecutionId) {
        clearInterval(pollInterval);
        return;
      }
      pollCount++;
      fetchStatuses();
      if (pollCount >= 15) {
        clearInterval(pollInterval);
        const slowPollInterval = setInterval(() => {
          if (currentIdsRef.current.campaignId !== currentCampaignId || 
              currentIdsRef.current.executionId !== currentExecutionId) {
            clearInterval(slowPollInterval);
            return;
          }
          fetchStatuses();
        }, 5000);
        setTimeout(() => clearInterval(slowPollInterval), 5 * 60 * 1000);
      }
    }, 2000);

    // Real-time subscription
    let channel: ReturnType<typeof supabase.channel> | null = null;
    
    try {
      const channelName = `campaign_status:${currentCampaignId || currentExecutionId || 'unknown'}`;
      let filter: string;
      
      if (currentCampaignId && currentCampaignId !== 'pending') {
        filter = `campaign_id=eq.${currentCampaignId}`;
      } else if (currentExecutionId) {
        filter = `execution_id=eq.${currentExecutionId}`;
      } else {
        return;
      }

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
            if (currentIdsRef.current.campaignId !== currentCampaignId || 
                currentIdsRef.current.executionId !== currentExecutionId) {
              return;
            }
            
            if (payload.new) {
              const update = payload.new as StatusUpdate;
              const updateExecutionId = (payload.new as any).execution_id;
              const updateCampaignId = (payload.new as any).campaign_id;
              
              if (currentExecutionId && updateExecutionId !== currentExecutionId) return;
              if (currentCampaignId && currentCampaignId !== 'pending' && updateCampaignId !== currentCampaignId) return;
              
              let agentKey = update.agent_name;
              if (update.agent_name === 'guardrails') {
                const metadata = update.metadata || {};
                const workflowPoint = metadata.workflow_point || '';
                
                const isInitial = workflowPoint === 'start' || 
                                  workflowPoint.includes('guardrails_accepted') ||
                                  workflowPoint.includes('guardrails_rejected');
                
                if (isInitial) {
                  agentKey = 'guardrails';
                } else if (workflowPoint.includes('guardrails_checking') || 
                           workflowPoint.includes('guardrails_completed') ||
                           workflowPoint.includes('guardrails_error')) {
                  agentKey = 'guardrails_qc';
                } else {
                  const currentStatuses = statuses;
                  const contentMakerStatus = currentStatuses['content_maker_agent'];
                  if (contentMakerStatus && contentMakerStatus.status === 'completed') {
                    const contentMakerTime = new Date(contentMakerStatus.updated_at);
                    const updateTime = new Date(update.updated_at);
                    agentKey = updateTime > contentMakerTime ? 'guardrails_qc' : 'guardrails';
                  } else {
                    agentKey = 'guardrails';
                  }
                }
              }
              
              setStatuses((prev) => ({
                ...prev,
                [agentKey]: update,
              }));
            }
          }
        )
        .subscribe();
    } catch (err) {
      console.error('Error setting up real-time subscription:', err);
    }

    return () => {
      clearInterval(pollInterval);
      if (channel) {
        supabase.removeChannel(channel);
      }
      setStatuses({});
    };
  }, [campaignId, executionId]);

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
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.2); }
        }
        .dot-1 { animation: dot-blink 1.4s infinite; animation-delay: 0s; }
        .dot-2 { animation: dot-blink 1.4s infinite; animation-delay: 0.2s; }
        .dot-3 { animation: dot-blink 1.4s infinite; animation-delay: 0.4s; }
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
            
            const agentsWithStatus = agents.filter(a => statuses[a]);
            const currentAgentIndexInList = agentsWithStatus.indexOf(agent);
            const isLastAgentWithStatus = currentAgentIndexInList === agentsWithStatus.length - 1;
            
            const shouldShowMessage = isProcessing || isError || (isLastAgentWithStatus && (isCompleted || isRejected));
            const hasMessage = status.message && status.message.trim().length > 0;

            return (
              <div key={agent} className="flex items-start gap-3">
                <div className={`mt-0.5 ${color}`}>{icon}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{label}</span>
                    <Badge variant="outline" className={`text-xs ${color} border-current`}>
                      {status.status}
                    </Badge>
                  </div>
                  {shouldShowMessage && hasMessage && (
                    <>
                      <p className={`text-sm flex items-center gap-1 mt-1 ${
                        isError 
                          ? 'text-red-600 dark:text-red-400 font-semibold' 
                          : isRejected
                          ? 'text-orange-600 dark:text-orange-400'
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
          
          {/* SYNC Button - Only show when Guardrails Out is completed */}
          {statuses['guardrails_qc']?.status === 'completed' && (
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Sync ke Citia Database
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Kirim hasil draft ke database Citia untuk review & blast
                  </p>
                </div>
                <Button
                  onClick={handleSync}
                  disabled={syncing}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {syncing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      SYNC
                    </>
                  )}
                </Button>
              </div>
              
              {/* Sync Message */}
              {syncMessage && (
                <div className={`mt-3 p-3 rounded-md text-sm ${
                  syncMessage.type === 'success' 
                    ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' 
                    : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
                }`}>
                  {syncMessage.text}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
