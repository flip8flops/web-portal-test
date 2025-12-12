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

export function StatusDisplay({ campaignId, executionId }: StatusDisplayProps) {
  const [statuses, setStatuses] = useState<Record<string, StatusUpdate>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Need either campaignId (not 'pending') or executionId
    const hasValidId = (campaignId && campaignId !== 'pending') || executionId;
    
    if (!hasValidId) {
      setStatuses({});
      return;
    }

    setLoading(true);

    // Initial fetch
    const fetchStatuses = async () => {
      try {
        let query = supabase
          .schema('citia_mora_datamart')
          .from('campaign_status_updates')
          .select('agent_name, status, message, progress, updated_at');

        // Query by campaign_id if available and not 'pending'
        if (campaignId && campaignId !== 'pending') {
          query = query.eq('campaign_id', campaignId);
        } 
        // Fallback to execution_id
        else if (executionId) {
          query = query.eq('execution_id', executionId);
        } else {
          setLoading(false);
          return;
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching statuses:', error);
          return;
        }

        // Get latest status per agent
        const latestStatuses: Record<string, StatusUpdate> = {};
        if (data) {
          data.forEach((update) => {
            if (!latestStatuses[update.agent_name] || 
                new Date(update.updated_at) > new Date(latestStatuses[update.agent_name].updated_at)) {
              latestStatuses[update.agent_name] = update as StatusUpdate;
            }
          });
        }
        setStatuses(latestStatuses);
      } catch (err) {
        console.error('Error in fetchStatuses:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStatuses();

    // Subscribe to real-time updates
    const channelName = `campaign_status:${campaignId || executionId}`;
    const filter = campaignId && campaignId !== 'pending'
      ? `campaign_id=eq.${campaignId}`
      : `execution_id=eq.${executionId}`;

    const channel = supabase
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
          console.log('Real-time update:', payload);
          if (payload.new) {
            const update = payload.new as StatusUpdate;
            setStatuses((prev) => ({
              ...prev,
              [update.agent_name]: update,
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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

  // CSS for dot dot dot animation
  const dotAnimation = `
    @keyframes blink {
      0%, 100% { opacity: 0.2; }
      50% { opacity: 1; }
    }
    .animate-blink {
      animation: blink 1.4s infinite;
    }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: dotAnimation }} />
      <Card className="border-0 shadow-lg bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
        <CardContent className="p-6">
          <div className="space-y-4">
          {agents.map((agent) => {
            const status = statuses[agent];
            if (!status) return null;

            const label = agentLabels[agent] || agent;
            const icon = statusIcons[status.status] || <AlertCircle className="h-4 w-4" />;
            const color = statusColors[status.status] || 'text-gray-600';

            return (
              <div key={agent} className="flex items-start gap-3">
                <div className={`mt-0.5 ${color}`}>{icon}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{label}</span>
                    <Badge
                      variant="outline"
                      className={`text-xs ${color} border-current`}
                    >
                      {status.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                    <span>{status.message || 'Processing...'}</span>
                    {(status.status === 'thinking' || status.status === 'processing') && (
                      <span className="inline-flex gap-0.5 ml-1">
                        <span className="animate-blink" style={{ animationDelay: '0s' }}>.</span>
                        <span className="animate-blink" style={{ animationDelay: '0.2s' }}>.</span>
                        <span className="animate-blink" style={{ animationDelay: '0.4s' }}>.</span>
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

