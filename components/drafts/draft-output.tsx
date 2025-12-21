'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Send, Ban, Edit2, Save, X, RefreshCw } from 'lucide-react';

interface DraftAudience {
  campaign_id: string;
  audience_id: string;
  audience_name: string;
  source_contact_id: string;
  telegram_username?: string;
  send_to: string;
  channel: string;
  broadcast_content: string;
  character_count: number;
  guardrails_tag: 'approved' | 'needs_review' | 'rejected' | 'passed';
  guardrails_violations: any[];
  matchmaker_reason?: any;
  campaign_objective?: string;
  campaign_image_url?: string;
  scheduled_at?: string | null;
}

interface DraftCampaign {
  campaign_id: string;
  campaign_name?: string;
  campaign_objective?: string;
  campaign_image_url?: string;
  campaign_tags?: string[];
  origin_notes?: string;
  total_matched_audience?: number;
  audiences: DraftAudience[];
  created_at: string;
  updated_at: string;
}

// Self-contained component - no props needed
export function DraftOutput() {
  const [draft, setDraft] = useState<DraftCampaign | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAudiences, setSelectedAudiences] = useState<Set<string>>(new Set());
  const [selectedAudienceDetail, setSelectedAudienceDetail] = useState<DraftAudience | null>(null);
  const [editingContent, setEditingContent] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState<string>('');
  const [editingSchedule, setEditingSchedule] = useState<string | null>(null);
  const [editedSchedule, setEditedSchedule] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showConfirmSend, setShowConfirmSend] = useState(false);
  const [showConfirmReject, setShowConfirmReject] = useState(false);
  const [lastAction, setLastAction] = useState<'approved' | 'rejected' | null>(null);

  // Fetch draft on mount
  useEffect(() => {
    fetchDraft();
  }, []);

  const fetchDraft = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Add timestamp to bust cache
      const timestamp = Date.now();
      console.log(`🔍 [DraftOutput] Fetching drafts at ${new Date(timestamp).toISOString()}...`);
      
      // Fetch most recent content_drafted campaign with cache-busting
      const response = await fetch(`/api/drafts?_t=${timestamp}`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      });
      console.log('📡 [DraftOutput] API response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [DraftOutput] API error:', response.status, errorText);
        throw new Error(`Failed to fetch draft: ${response.status}`);
      }

      const data = await response.json();
      console.log('📦 [DraftOutput] API response:', {
        hasDraft: !!data.draft,
        campaignId: data.draft?.campaign_id || data.campaign_id,
        audiencesCount: data.draft?.audiences?.length || 0,
        message: data.message,
      });
      
      if (!data.draft || !data.draft.audiences || data.draft.audiences.length === 0) {
        console.log('ℹ️ [DraftOutput] No draft available');
        setDraft(null);
        setSelectedAudienceDetail(null);
        setSelectedAudiences(new Set());
        setLoading(false);
        return;
      }

      console.log('✅ [DraftOutput] Setting draft with', data.draft.audiences.length, 'audiences');
      
      // Update draft state
      setDraft(data.draft);
      setLastAction(null); // Clear last action when we have a new draft

      // Auto-select first audience for detail view if none selected
      if (data.draft.audiences.length > 0) {
        const currentSelected = selectedAudienceDetail?.audience_id;
        const foundAudience = data.draft.audiences.find((a: DraftAudience) => a.audience_id === currentSelected);
        if (foundAudience) {
          setSelectedAudienceDetail(foundAudience);
        } else {
          setSelectedAudienceDetail(data.draft.audiences[0]);
        }
      }
      
      setLoading(false);
    } catch (err) {
      console.error('❌ [DraftOutput] Error fetching draft:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch draft');
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
    if (!draft || selectedAudiences.size === 0) return;
    
    setSending(true);
    setError(null);
    
    try {
      const selectedIds = Array.from(selectedAudiences);
      
      // First approve
      const approveResponse = await fetch('/api/drafts/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: draft.campaign_id,
          audience_ids: selectedIds,
        }),
      });

      if (!approveResponse.ok) {
        const errorData = await approveResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to approve drafts');
      }

      // Then send
      const sendResponse = await fetch('/api/drafts/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: draft.campaign_id,
          audience_ids: selectedIds,
        }),
      });

      if (!sendResponse.ok) {
        const errorData = await sendResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to send broadcasts');
      }

      console.log('✅ [DraftOutput] Campaign approved and sent successfully');
      
      // Clear current draft and show success
      setDraft(null);
      setSelectedAudiences(new Set());
      setSelectedAudienceDetail(null);
      setShowConfirmSend(false);
      setLastAction('approved');
      
      // After a moment, try to load next draft (if any)
      setTimeout(() => {
        fetchDraft();
      }, 2000);
      
    } catch (err) {
      console.error('❌ [DraftOutput] Error approving and sending:', err);
      setError(err instanceof Error ? err.message : 'Failed to approve and send');
    } finally {
      setSending(false);
    }
  };

  const handleReject = async () => {
    if (!draft) return;
    
    setRejecting(true);
    setError(null);
    
    try {
      const response = await fetch('/api/drafts/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: draft.campaign_id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to reject campaign');
      }

      console.log('✅ [DraftOutput] Campaign rejected successfully');
      
      // Clear current draft and show message
      setDraft(null);
      setSelectedAudiences(new Set());
      setSelectedAudienceDetail(null);
      setShowConfirmReject(false);
      setLastAction('rejected');
      
      // After a moment, try to load next draft (if any)
      setTimeout(() => {
        fetchDraft();
      }, 2000);
      
    } catch (err) {
      console.error('❌ [DraftOutput] Error rejecting:', err);
      setError(err instanceof Error ? err.message : 'Failed to reject campaign');
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
      console.log('💾 [DraftOutput] Saving edited content for audience:', audienceId);
      
      const response = await fetch('/api/drafts/update-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: draft.campaign_id,
          audience_id: audienceId,
          broadcast_content: editedContent,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save changes');
      }

      console.log('✅ [DraftOutput] Content saved successfully');
      
      // Update local state directly (bypass cache issues)
      const updatedAudiences = draft.audiences.map((aud) => {
        if (aud.audience_id === audienceId) {
          return {
            ...aud,
            broadcast_content: editedContent,
            character_count: editedContent.length,
          };
        }
        return aud;
      });
      
      setDraft({ ...draft, audiences: updatedAudiences });
      
      if (selectedAudienceDetail?.audience_id === audienceId) {
        setSelectedAudienceDetail({
          ...selectedAudienceDetail,
          broadcast_content: editedContent,
          character_count: editedContent.length,
        });
      }
      
      setEditingContent(null);
      setEditedContent('');
    } catch (err) {
      console.error('❌ [DraftOutput] Error saving edit:', err);
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    }
  };

  const handleCancelEdit = () => {
    setEditingContent(null);
    setEditedContent('');
  };

  const handleSaveSchedule = async (audienceId: string) => {
    if (!draft) return;

    try {
      console.log('📅 [DraftOutput] Saving schedule for audience:', audienceId, editedSchedule);
      
      const scheduledAt = editedSchedule ? new Date(editedSchedule).toISOString() : null;
      
      const response = await fetch('/api/drafts/update-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: draft.campaign_id,
          audience_id: audienceId,
          scheduled_at: scheduledAt,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save schedule');
      }

      console.log('✅ [DraftOutput] Schedule saved successfully');
      
      // Update local state
      const updatedAudiences = draft.audiences.map((aud) => {
        if (aud.audience_id === audienceId) {
          return { ...aud, scheduled_at: scheduledAt };
        }
        return aud;
      });
      
      setDraft({ ...draft, audiences: updatedAudiences });
      
      if (selectedAudienceDetail?.audience_id === audienceId) {
        setSelectedAudienceDetail({ ...selectedAudienceDetail, scheduled_at: scheduledAt });
      }
      
      setEditingSchedule(null);
      setEditedSchedule('');
    } catch (err) {
      console.error('❌ [DraftOutput] Error saving schedule:', err);
      setError(err instanceof Error ? err.message : 'Failed to save schedule');
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600">Loading drafts...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-4">
        <Alert className="border-red-500 bg-red-50 dark:bg-red-950">
          <AlertDescription className="text-red-700 dark:text-red-300">{error}</AlertDescription>
        </Alert>
        <div className="flex justify-center">
          <Button onClick={fetchDraft} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // No draft available - show message and refresh button
  if (!draft || draft.audiences.length === 0) {
    return (
      <div className="space-y-4">
        {lastAction === 'approved' && (
          <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
            <AlertDescription className="text-green-700 dark:text-green-300">
              Campaign has been approved and sent successfully!
            </AlertDescription>
          </Alert>
        )}
        {lastAction === 'rejected' && (
          <Alert className="border-orange-500 bg-orange-50 dark:bg-orange-950">
            <AlertDescription className="text-orange-700 dark:text-orange-300">
              Campaign has been rejected.
            </AlertDescription>
          </Alert>
        )}
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500 mb-4">No draft campaign available.</p>
            <p className="text-sm text-gray-400 mb-6">
              Generate a new campaign in the Input tab, or click refresh to check for drafts.
            </p>
            <Button onClick={fetchDraft} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Load Drafts
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Refresh Button */}
      <div className="flex justify-end">
        <Button onClick={fetchDraft} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Campaign Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">
            {draft.campaign_name || 'Untitled Campaign'}
          </CardTitle>
          
          {/* Objective */}
          <div className="mt-3">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Objective:</p>
            {draft.campaign_objective ? (
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {draft.campaign_objective}
              </p>
            ) : (
              <p className="text-xs text-gray-400 italic">No objective found</p>
            )}
          </div>
          
          {/* Origin Notes */}
          <div className="mt-3">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Origin Notes from Admin Citia:</p>
            {draft.origin_notes ? (
              <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                {draft.origin_notes}
              </p>
            ) : (
              <p className="text-xs text-gray-400 italic">No origin notes found</p>
            )}
          </div>
          
          {/* Total Matched Audience */}
          <div className="mt-3">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Total Matched Audience:</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {draft.total_matched_audience !== undefined ? draft.total_matched_audience : draft.audiences.length}
            </p>
          </div>
          
          {/* Tags */}
          <div className="mt-3">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Tags:</p>
            {draft.campaign_tags && draft.campaign_tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {draft.campaign_tags.map((tag, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs px-2 py-1">
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">No tags found</p>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSelectAll}>
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
            className="bg-red-200 hover:bg-red-300 text-red-800 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-300 border border-red-300 dark:border-red-700"
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
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
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
                          variant="outline"
                          className={`text-xs ${
                            audience.guardrails_tag === 'approved' || audience.guardrails_tag === 'passed'
                              ? 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700'
                              : audience.guardrails_tag === 'rejected'
                              ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700'
                              : 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700'
                          }`}
                        >
                          {audience.guardrails_tag === 'approved' ? 'passed' : audience.guardrails_tag}
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
                    <p className="text-sm font-medium text-gray-500">Audience Name</p>
                    <p className="text-base font-semibold">{selectedAudienceDetail.audience_name}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Send To</p>
                    <p className="text-base">{selectedAudienceDetail.send_to || selectedAudienceDetail.source_contact_id || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Channel</p>
                    <Badge>{selectedAudienceDetail.channel}</Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Scheduled Send Time</p>
                    {editingSchedule === selectedAudienceDetail.audience_id ? (
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="datetime-local"
                          value={editedSchedule}
                          onChange={(e) => setEditedSchedule(e.target.value)}
                          className="flex-1 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <Button variant="ghost" size="sm" onClick={() => handleSaveSchedule(selectedAudienceDetail.audience_id)}>
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setEditingSchedule(null); setEditedSchedule(''); }}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="text-base">
                          {selectedAudienceDetail.scheduled_at 
                            ? new Date(selectedAudienceDetail.scheduled_at).toLocaleString('id-ID', { 
                                dateStyle: 'medium', 
                                timeStyle: 'short' 
                              })
                            : 'Not scheduled'}
                        </p>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => {
                            setEditingSchedule(selectedAudienceDetail.audience_id);
                            setEditedSchedule(
                              selectedAudienceDetail.scheduled_at 
                                ? new Date(selectedAudienceDetail.scheduled_at).toISOString().slice(0, 16)
                                : ''
                            );
                          }}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
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
                      <Button variant="ghost" size="sm" onClick={() => handleEditContent(selectedAudienceDetail)}>
                        <Edit2 className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleSaveEdit(selectedAudienceDetail.audience_id)}>
                          <Save className="h-4 w-4 mr-1" />
                          Save
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                          <X className="h-4 w-4 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Message Bubble with Image Header (like WhatsApp/Telegram incoming message) */}
                  <div className="w-2/3">
                    <div className="bg-blue-50 dark:bg-blue-950 rounded-lg rounded-tl-none overflow-hidden border border-blue-200 dark:border-blue-800 shadow-sm">
                      {/* Image Header if available - full image, no cropping */}
                      {draft.campaign_image_url && (
                        <div className="w-full border-b border-blue-200 dark:border-blue-800">
                          <img
                            src={draft.campaign_image_url}
                            alt="Campaign image"
                            className="w-full h-auto object-contain"
                          />
                        </div>
                      )}
                    
                    {/* Text Content */}
                    <div className="p-4">
                      {editingContent === selectedAudienceDetail.audience_id ? (
                        <>
                          <textarea
                            value={editedContent}
                            onChange={(e) => setEditedContent(e.target.value)}
                            className="w-full min-h-[100px] p-2 border rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Edit message content..."
                          />
                          <p className="text-xs text-gray-500 mt-2">
                            {editedContent.length} characters
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm whitespace-pre-wrap">
                            {selectedAudienceDetail.broadcast_content}
                          </p>
                          <p className="text-xs text-gray-500 mt-2">
                            {selectedAudienceDetail.character_count} characters
                          </p>
                        </>
                      )}
                    </div>
                  </div>
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
