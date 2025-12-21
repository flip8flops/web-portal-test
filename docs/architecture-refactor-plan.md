# Refactored Architecture: Independent Input/Output Tabs

## Overview

This document describes the simplified architecture for the Broadcast page where Input and Output tabs operate **independently** without shared state or locking mechanisms.

## Architecture Diagram

```
+-------------------------------------------------------------+
|                        Broadcast Page                       |
+----------------------------+--------------------------------+
|         Tab INPUT          |          Tab OUTPUT            |
|                            |                                |
|  +----------------------+  |  +-------------------------+   |
|  |   StatusDisplay      |  |  |   DraftOutput           |   |
|  |   (shows agent       |  |  |   (self-contained)      |   |
|  |    progress)         |  |  +-------------------------+   |
|  +----------------------+  |                                |
|                            |  - Fetches most recent         |
|  +----------------------+  |    content_drafted campaign    |
|  |   Campaign Form      |  |  - Manual "Load Drafts" button |
|  |   (notes, image)     |  |  - Approve/Reject actions      |
|  +----------------------+  |  - NO dependency on Input      |
|                            |                                |
|  +----------------------+  |                                |
|  |   Generate Button    |  |                                |
|  +----------------------+  |                                |
|                            |                                |
|  - Form disabled during    |                                |
|    processing ONLY         |                                |
|  - Status clears on        |                                |
|    page refresh            |                                |
|  - NO dependency on        |                                |
|    Output tab              |                                |
+----------------------------+--------------------------------+
```

## Key Principles

### 1. Complete Independence
- **Input Tab**: Only cares about creating campaigns and showing agent progress
- **Output Tab**: Only cares about displaying and managing drafted campaigns
- **No shared state** between tabs (no `campaignState`, `draftCampaignId`, or locking)

### 2. Simple State Management

#### Input Tab State (in `page.tsx`)
- `session`: User session
- `notes`, `imageFile`: Form values
- `submitting`: Whether form is being submitted
- `campaignId`, `executionId`: Current campaign being processed
- `isProcessing`: Whether agents are still working

#### Output Tab State (in `DraftOutput` component)
- `draft`: Current draft campaign data
- `loading`, `error`: Loading/error states
- `selectedAudiences`: Selection state for approve/send
- `lastAction`: 'approved' | 'rejected' | null (for showing feedback)

### 3. No Locking Logic
- **Input form disabled** only when: `submitting === true` OR `isProcessing === true`
- **No "resolve draft first" blocking** - user can create new campaigns anytime
- **No inter-tab dependencies**

## Tab Behaviors

### Input Tab
1. **Form submission** → Creates campaign, shows StatusDisplay with agent progress
2. **Processing complete** → Form re-enabled, localStorage cleared
3. **Page refresh during processing** → Restores campaignId from localStorage, shows status
4. **Page refresh after completion** → Fresh state, no restoration

### Output Tab
1. **Mount** → Fetches most recent `content_drafted` campaign via API
2. **"Load Drafts" button** → Manual refresh to check for new drafts
3. **Approve & Send** → Clears current draft, shows success, auto-fetches next draft after 2s
4. **Reject** → Clears current draft, shows rejection message, auto-fetches next draft after 2s

## Removed Logic (from previous implementation)

### From `page.tsx`
- ❌ `campaignState` - removed
- ❌ `draftCampaignId` - removed
- ❌ `isInputLocked` - removed
- ❌ `checkCampaignState()` - removed
- ❌ `findLatestDraftCampaign()` - moved to DraftOutput
- ❌ `onDrafted` callback - removed
- ❌ Multiple periodic useEffects - removed
- ❌ `handleApproveAndSend`, `handleReject` - moved to DraftOutput

### From `StatusDisplay`
- ❌ `onDrafted` callback prop - removed
- ❌ Draft detection logic - removed

## API Endpoints

### `/api/drafts` (GET)
- Returns the most recent campaign with `status = 'content_drafted'`
- Returns `null` if no draft available or if campaign is rejected/approved

### `/api/drafts/approve` (POST)
- Marks selected audiences as approved
- Updates campaign status

### `/api/drafts/send` (POST)
- Sends broadcasts to selected audiences
- Updates campaign status to 'sent'

### `/api/drafts/reject` (POST)
- Updates campaign status to 'rejected'

### `/api/drafts/update-content` (POST)
- Updates `broadcast_content` for a specific audience

## Benefits of New Architecture

1. **Simpler Mental Model**: Each tab is self-contained
2. **No Race Conditions**: No complex state synchronization
3. **No Jittery UI**: Manual refresh for Output (no auto-polling)
4. **Easier Debugging**: Clear separation of concerns
5. **Fewer Bugs**: Less interdependent logic
6. **Better UX**: User can freely switch tabs without restrictions
