'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/src/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Send, Ban, Edit2, Save, X } from 'lucide-react';

interface DraftAudience {
  campaign_id: string;
  audience_id: string;
  audience_name: string;
  source_contact_id: string;
  channel: string;
  broadcast_content: string;
  character_count: number;
  guardrails_tag: 'approved' | 'needs_review' | 'rejected';
  guardrails_violations: any[];
  matchmaker_reason?: any;
  campaign_objective?: string;
  campaign_image_url?: string;
}

interface DraftCampaign {
  campaign_id: string;
  campaign_name?: string;
  campaign_objective?: string;
  campaign_image_url?: string;
  audiences: DraftAudience[];
  created_at: string;
  updated_at: string;
}

interface DraftOutputProps {
  campaignId: string | null;
  onApproveAndSend: (selectedIds: string[]) => Promise<void>;
  onReject: () => Promise<void>;
}

export function DraftOutput({ campaignId, onApproveAndSend, onReject }: DraftOutputProps) {
  const [draft, setDraft] = useState<DraftCampaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAudiences, setSelectedAudiences] = useState<Set<string>>(new Set());
  const [selectedAudienceDetail, setSelectedAudienceDetail] = useState<DraftAudience | null>(null);
  const [editingContent, setEditingContent] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showConfirmSend, setShowConfirmSend] = useState(false);
  const [showConfirmReject, setShowConfirmReject] = useState(false);

  useEffect(() => {
    if (!campaignId) {
      setDraft(null);
      setLoading(false);
      setSelectedAudienceDetail(null);
      setSelectedAudiences(new Set());
      return;
    }

    fetchDraft();
  }, [campaignId]);

  const fetchDraft = async () => {
    if (!campaignId) return;

    setLoading(true);
    try {
      // Use API endpoint
      const response = await fetch(`/api/drafts?campaign_id=${campaignId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch draft');
      }

      const data = await response.json();
      if (!data.draft) {
        setDraft(null);
        setLoading(false);
        return;
      }

      setDraft(data.draft);

      // Auto-select first audience for detail view if none selected
      if (data.draft.audiences.length > 0) {
        const currentSelected = selectedAudienceDetail?.audience_id;
        const foundAudience = data.draft.audiences.find((a: DraftAudience) => a.audience_id === currentSelected);
        if (foundAudience) {
          setSelectedAudienceDetail(foundAudience);
        } else if (!selectedAudienceDetail) {
          setSelectedAudienceDetail(data.draft.audiences[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching draft:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = () => {
    if (!draft) return;
    if (selectedAudiences.size === draft.audiences.length) {
      setSelectedAudiences(new Set());
    } else {
      setSelectedAudiences(new Set(draft.audiences.map(a => a.audience_id)));
    }
  };

  const handleSelectAudience = (audienceId: string) => {
    const newSelected = new Set(selectedAudiences);
    if (newSelected.has(audienceId)) {
      newSelected.delete(audienceId);
    } else {
      newSelected.add(audienceId);
    }
    setSelectedAudiences(newSelected);
  };

  const handleApproveAndSend = async () => {
    if (selectedAudiences.size === 0) return;
    
    setSending(true);
    try {
      const selectedIds = Array.from(selectedAudiences);
      await onApproveAndSend(selectedIds);
      setShowConfirmSend(false);
      // Refresh draft data
      await fetchDraft();
    } catch (error) {
      console.error('Error approving and sending:', error);
      // Error will be shown by parent component
    } finally {
      setSending(false);
    }
  };

  const handleReject = async () => {
    setRejecting(true);
    try {
      await onReject();
      setShowConfirmReject(false);
      // Refresh draft data
      await fetchDraft();
    } catch (error) {
      console.error('Error rejecting:', error);
      // Error will be shown by parent component
    } finally {
      setRejecting(false);
    }
  };

  const handleEditContent = (audience: DraftAudience) => {
    setEditingContent(audience.audience_id);
    setEditedContent(audience.broadcast_content);
  };

  const handleSaveEdit = async (audienceId: string) => {
    if (!draft) return;

    try {
      // Update broadcast_content in database
      const { error } = await supabase
        .schema('citia_mora_datamart')
        .from('campaign_audience')
        .update({
          broadcast_content: editedContent,
          character_count: editedContent.length,
          updated_at: new Date().toISOString(),
        })
        .eq('campaign_id', draft.campaign_id)
        .eq('audience_id', audienceId);

      if (error) {
        console.error('Error updating content:', error);
        return;
      }

      // Refresh draft data
      await fetchDraft();

      setEditingContent(null);
      setEditedContent('');
    } catch (error) {
      console.error('Error saving edit:', error);
    }
  };

  const handleCancelEdit = () => {
    setEditingContent(null);
    setEditedContent('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!draft || draft.audiences.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-gray-500">
          No draft available. Generate a campaign first.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Campaign Info */}
      <Card>
        <CardHeader>
          <CardTitle>{draft.campaign_name}</CardTitle>
          {draft.campaign_objective && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              {draft.campaign_objective}
            </p>
          )}
        </CardHeader>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectAll}
          >
            {selectedAudiences.size === draft.audiences.length ? 'Deselect All' : 'Select All'}
          </Button>
          <span className="text-sm text-gray-600">
            {selectedAudiences.size} of {draft.audiences.length} selected
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="destructive"
            onClick={() => setShowConfirmReject(true)}
            disabled={rejecting}
          >
            {rejecting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Rejecting...
              </>
            ) : (
              <>
                <Ban className="h-4 w-4 mr-2" />
                Reject
              </>
            )}
          </Button>
          <Button
            onClick={() => setShowConfirmSend(true)}
            disabled={selectedAudiences.size === 0 || sending}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Approve & Send ({selectedAudiences.size})
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Main Content: List and Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Audience List */}
        <Card>
          <CardHeader>
            <CardTitle>Audience List</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {draft.audiences.map((audience) => (
                <div
                  key={audience.audience_id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedAudienceDetail?.audience_id === audience.audience_id
                      ? 'bg-blue-50 dark:bg-blue-950 border-blue-500'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                  onClick={() => setSelectedAudienceDetail(audience)}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedAudiences.has(audience.audience_id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleSelectAudience(audience.audience_id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium truncate">{audience.audience_name}</p>
                        <Badge
                          variant={
                            audience.guardrails_tag === 'approved'
                              ? 'default'
                              : audience.guardrails_tag === 'rejected'
                              ? 'destructive'
                              : 'secondary'
                          }
                          className="text-xs"
                        >
                          {audience.guardrails_tag}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500 truncate">
                        {audience.source_contact_id} • {audience.channel}
                      </p>
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                        {audience.broadcast_content}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Right: Audience Detail */}
        <Card>
          <CardHeader>
            <CardTitle>Draft Detail</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedAudienceDetail ? (
              <div className="space-y-4">
                {/* Audience Info */}
                <div className="space-y-2">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Send To</p>
                    <p className="text-base">{selectedAudienceDetail.audience_name}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Phone Number</p>
                    <p className="text-base">{selectedAudienceDetail.source_contact_id}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Channel</p>
                    <Badge>{selectedAudienceDetail.channel}</Badge>
                  </div>
                  {selectedAudienceDetail.matchmaker_reason && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">Match Reason</p>
                      <p className="text-sm text-gray-600">
                        {typeof selectedAudienceDetail.matchmaker_reason === 'string'
                          ? selectedAudienceDetail.matchmaker_reason
                          : JSON.stringify(selectedAudienceDetail.matchmaker_reason)}
                      </p>
                    </div>
                  )}
                </div>

                {/* Draft Message Bubble */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-500">Draft Message</p>
                    {editingContent !== selectedAudienceDetail.audience_id ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditContent(selectedAudienceDetail)}
                      >
                        <Edit2 className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSaveEdit(selectedAudienceDetail.audience_id)}
                        >
                          <Save className="h-4 w-4 mr-1" />
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCancelEdit}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Image if available */}
                  {draft.campaign_image_url && (
                    <div className="relative w-full h-48 rounded-lg overflow-hidden mb-2 border border-gray-200 dark:border-gray-700">
                      <img
                        src={draft.campaign_image_url}
                        alt="Campaign image"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  {/* Message Bubble */}
                  <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                    {editingContent === selectedAudienceDetail.audience_id ? (
                      <textarea
                        value={editedContent}
                        onChange={(e) => setEditedContent(e.target.value)}
                        className="w-full min-h-[100px] p-2 border rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Edit message content..."
                      />
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">
                        {selectedAudienceDetail.broadcast_content}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      {selectedAudienceDetail.character_count} characters
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-center text-gray-500 py-8">
                Select an audience to view details
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Dialogs */}
      {showConfirmSend && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="max-w-md w-full mx-4">
            <CardHeader>
              <CardTitle>Confirm Send</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4">
                Are you sure you want to approve and send {selectedAudiences.size} message(s)?
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowConfirmSend(false)}>
                  Cancel
                </Button>
                <Button onClick={handleApproveAndSend} disabled={sending}>
                  {sending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Confirm & Send'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showConfirmReject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="max-w-md w-full mx-4">
            <CardHeader>
              <CardTitle>Confirm Reject</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4">
                Are you sure you want to reject this campaign? This action cannot be undone.
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowConfirmReject(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleReject} disabled={rejecting}>
                  {rejecting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Rejecting...
                    </>
                  ) : (
                    'Confirm Reject'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
