# Design Understanding - Broadcast Team Agent UI

**Date:** 2025-12-10  
**Purpose:** Memastikan pemahaman design wireframe sebelum implementasi

## 🎨 Design Wireframe Description

### Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│  SIDEBAR (Left)    │  MAIN CONTENT AREA (Right)              │
│                    │                                         │
│  ┌──────────────┐  │                                         │
│  │ BROADCAST    │  │                                         │
│  │ TEAM AGENT   │  │  [Status/Loading Area - Top Section]   │
│  │ (Tab/Button) │  │                                         │
│  └──────────────┘  │                                         │
│                    │  ┌─────────────────────────────────┐  │
│  [Empty space]     │  │ 🤔 research agent lagi mikirin    │  │
│                    │  │    permintaanmu yang aneh..      │  │
│                    │  └─────────────────────────────────┘  │
│                    │                                         │
│                    │  ┌─────────────────────────────────┐  │
│                    │  │ Campaign Brief                   │  │
│                    │  │ ┌─────────────────────────────┐ │  │
│                    │  │ │ Your notes                   │ │  │
│                    │  │ │                             │ │  │
│                    │  │ │ [Text input area]            │ │  │
│                    │  │ │                             │ │  │
│                    │  │ │ (hint: "also contain hint    │ │  │
│                    │  │ │  text")                      │ │  │
│                    │  │ │                             │ │  │
│                    │  │ └─────────────────────────────┘ │  │
│                    │  └─────────────────────────────────┘  │
│                    │                                         │
│                    │  ┌─────────────────────────────────┐  │
│                    │  │ Additional image to send        │  │
│                    │  │ ┌─────────────────────────────┐  │  │
│                    │  │ │ [Drag & drop area]         │  │  │
│                    │  │ │                             │  │  │
│                    │  │ │ (hint: "upload/drag image  │  │  │
│                    │  │ │  then become image          │  │  │
│                    │  │ │  thumbnail")                │  │  │
│                    │  │ │                             │  │  │
│                    │  │ │ [After upload: shows        │  │  │
│                    │  │ │  thumbnail preview]          │  │  │
│                    │  │ └─────────────────────────────┘  │  │
│                    │  └─────────────────────────────────┘  │
│                    │                                         │
│                    │                    [GENERATE] ← Button│
│                    │                         (Bottom-right) │
│                    └─────────────────────────────────────────┘
```

---

## 📋 Component Breakdown

### 1. **Sidebar (Left Panel)**
- **Tab/Button:** "BROADCAST TEAM AGENT" 
  - Style: White rectangular button/tab di bagian atas sidebar
  - Position: Top of sidebar
  - Text: Uppercase "BROADCAST TEAM AGENT"
  - Rest of sidebar: Empty space (untuk future navigation items)

### 2. **Main Content Area (Right Panel)**

#### **Section 1: Status/Loading Area (Top)**
- **Purpose:** Display real-time status dari agents yang sedang processing
- **Content:** 
  - Dynamic message: "🤔 research agent lagi mikirin permintaanmu yang aneh.."
  - Emoji indicator untuk visual appeal
  - Human-readable status message per agent
- **Behavior:**
  - Update real-time via Supabase Realtime
  - Show different messages untuk different agents:
    - Guardrails: "Validating campaign input..."
    - Research Agent: "🤔 Research Agent sedang menganalisis campaign..."
    - Matchmaker Agent: "🎯 Matchmaker Agent sedang mencari audience..."
  - Show completion status: ✅ Completed, ❌ Error, 🚫 Rejected

#### **Section 2: Campaign Brief (Middle)**
- **Label:** "Campaign Brief" (section header)
- **Sub-section:** "Your notes"
  - **Input Type:** Large text area
  - **Placeholder/Hint:** "also contain hint text"
  - **Purpose:** User input campaign planning notes
  - **Style:** White rectangular text input field
  - **Behavior:**
    - Multi-line text input
    - Hint text visible when empty
    - Character counter (optional, bisa ditambahkan later)

#### **Section 3: Additional Image (Bottom)**
- **Label:** "Additional image to send"
- **Upload Area:**
  - **Initial State:** Drag & drop zone
    - Hint: "upload/drag image then become image thumbnail"
    - Empty white box area
  - **After Upload:** Shows image thumbnail
    - Preview image yang sudah di-upload
    - Option to remove/replace image
- **Behavior:**
  - Drag & drop support
  - Click to upload
  - Image preview/thumbnail setelah upload
  - File validation (jpg, jpeg, png, webp)
  - Optional: Max file size validation

#### **Section 4: Generate Button (Bottom-right)**
- **Position:** Bottom-right corner of main content area
- **Style:** Dark gray rectangular button
- **Text:** "GENERATE" (uppercase)
- **Purpose:** Trigger n8n workflow webhook
- **Behavior:**
  - Disabled jika notes kosong
  - Loading state saat processing
  - On click: Send data ke n8n webhook

---

## 🎯 User Flow

### Initial State (Empty Form):
1. User navigates ke Broadcast page
2. Sidebar shows "BROADCAST TEAM AGENT" tab (active)
3. Status area: Empty atau "Ready to create campaign"
4. Campaign Brief: Empty text area dengan hint
5. Image area: Empty drag & drop zone
6. Generate button: Disabled (karena notes kosong)

### User Input:
1. User types campaign notes di text area
2. Generate button becomes enabled
3. User optionally drags/drops image
4. Image thumbnail appears setelah upload

### After Click Generate:
1. Generate button shows loading state
2. Status area updates: "Validating campaign input..." (Guardrails)
3. If Guardrails rejects: Status shows "🚫 Campaign input tidak sesuai topik"
4. If Guardrails accepts: Status updates per agent:
   - "🤔 Research Agent sedang menganalisis campaign..."
   - "✅ Research Agent selesai"
   - "🎯 Matchmaker Agent sedang mencari audience..."
   - "✅ Matchmaker Agent selesai"
5. Real-time updates via Supabase Realtime subscription

---

## 🎨 Visual Design Details

### Color Scheme:
- **Sidebar:** Dark gray background
- **Tab/Button:** White rectangular button (prominent)
- **Main Content:** Light gray background
- **Status Area:** Light gray section
- **Form Sections:** Light gray with white input fields
- **Generate Button:** Dark gray

### Typography:
- Status messages: Human-readable, friendly tone
- Form labels: Clear, descriptive
- Hint text: Helpful, instructional

### Spacing:
- Clear separation antara sections
- Adequate padding untuk readability
- Button positioned di bottom-right untuk easy access

---

## ✅ Key Features Confirmed

1. ✅ **Real-time Status Display** - Top section dengan dynamic messages
2. ✅ **Campaign Brief Input** - Text area dengan hint text
3. ✅ **Image Upload** - Drag & drop dengan thumbnail preview
4. ✅ **Generate Button** - Bottom-right, triggers workflow
5. ✅ **Sidebar Tab** - "BROADCAST TEAM AGENT" di top of sidebar
6. ✅ **Minimal Design** - Clean, focused, no clutter

---

## 🔄 Status Messages (Examples)

### Guardrails:
- Thinking: "Validating campaign input..."
- Accepted: "✅ Campaign input validated"
- Rejected: "🚫 Campaign input tidak sesuai topik"

### Research Agent:
- Thinking: "🤔 Research Agent sedang menganalisis campaign..."
- Processing: "Research Agent sedang memproses data..."
- Completed: "✅ Research Agent selesai menganalisis campaign"

### Matchmaker Agent:
- Thinking: "🎯 Matchmaker Agent sedang mencari audience..."
- Processing: "Matchmaker Agent sedang mencocokkan audience..."
- Completed: "✅ Matchmaker Agent selesai mencocokkan audience"

### Error States:
- Error: "❌ Error: [error message]"

---

## 📝 Implementation Notes

### Status Display:
- Real-time updates via Supabase Realtime
- Show latest status per agent
- Visual indicators (emoji/icons)
- Human-readable messages (friendly tone)

### Form Input:
- Text area: Multi-line, scrollable
- Hint text: Visible when empty
- Validation: Minimum length check (optional)

### Image Upload:
- Drag & drop zone: Large, clear area
- Preview: Thumbnail setelah upload
- Remove option: Allow user to remove/replace image
- File validation: Type and size checks

### Generate Button:
- Position: Bottom-right (easy access)
- State: Disabled → Enabled → Loading
- Action: POST to `/api/broadcast/create`

---

## ❓ Questions for Confirmation

1. **Status Display:**
   - Apakah show semua agents sekaligus atau hanya yang sedang active?
   - Apakah perlu progress bar atau cukup status message?
   - Apakah perlu estimated time?

2. **Form Input:**
   - Apakah ada character limit untuk notes?
   - Apakah hint text perlu lebih descriptive?
   - Apakah perlu auto-save draft?

3. **Image Upload:**
   - Apakah support multiple images atau single image only?
   - Apakah ada max file size?
   - Apakah perlu image preview dengan zoom?

4. **Generate Button:**
   - Apakah perlu confirmation dialog sebelum generate?
   - Apakah perlu show campaign ID setelah created?
   - Apakah perlu redirect ke campaign detail page?

---

## 🎯 Summary

**Design ini adalah minimal UI untuk:**
- ✅ Input campaign brief (text + optional image)
- ✅ Real-time status tracking per agent
- ✅ Trigger workflow via Generate button
- ✅ Clean, focused interface tanpa clutter

**Key Principle:**
- Minimal design untuk MVP
- Real-time feedback untuk better UX
- Clear visual hierarchy
- User-friendly status messages

