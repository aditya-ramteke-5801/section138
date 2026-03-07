# Email System Architecture

## Complete System Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  NoticeDashboard.jsx                                     │  │
│  │  • Display signed notices                               │  │
│  │  • Email button                                         │  │
│  │  • handleBulkEmail() → calls bulkSendEmail()           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↓                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  api.js                                                  │  │
│  │  • sendEmail(id, email)                                │  │
│  │  • bulkSendEmail(notice_ids)                          │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────┬──────────────────────────────────────────┘
                     │ HTTP POST
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js/Express)                    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  index.js - API Endpoints                             │    │
│  │                                                        │    │
│  │  POST /api/notices/:id/send-email                    │    │
│  │    ↓                                                   │    │
│  │    • Fetch notice from store                         │    │
│  │    • Call PDF generation                            │    │
│  │    • Call email generation (subject + body)         │    │
│  │    • Call sendNoticeEmail()                         │    │
│  │    • Update notice status to "dispatched"           │    │
│  │                                                        │    │
│  │  POST /api/notices/bulk-send-email                   │    │
│  │    ↓                                                   │    │
│  │    • Loop through each notice_id                     │    │
│  │    • Repeat single email flow for each               │    │
│  │    • Return batch results                            │    │
│  └────────────────────────────────────────────────────────┘    │
│                         ↓           ↓           ↓               │
│  ┌──────────────────┐ ┌────────────┴────────┐ ┌───────────┐   │
│  │  pdfService.js   │ │ noticeService.js    │ │emailService│  │
│  │                  │ │                     │ │           │   │
│  │ generatePdf() ────→ • generateEmail      │ │ CREATE    │   │
│  │                  │   Subject()          │ │ Transporter  │  │
│  │ Uses Puppeteer   │ • generateEmail      │ │           │   │
│  │ to convert       │   Body()             │ │ sendNotice │   │
│  │ HTML → PDF       │                      │ │ Email()   │   │
│  │                  │ Uses OpenAI to      │ │ {         │   │
│  │                  │ generate dynamic    │ │   • Creates    │  │
│  │                  │ email subjects      │ │     mail       │  │
│  │                  │ and bodies          │ │     object    │  │
│  │                  │                     │ │   • Sets from  │  │
│  │                  │                     │ │   • Sets to    │  │
│  │                  │                     │ │   • Attaches   │  │
│  │                  │                     │ │     PDF        │  │
│  │                  │                     │ │   • Sends via  │  │
│  │                  │                     │ │     SMTP       │  │
│  │                  │                     │ │ }             │  │
│  └──────────────────┘ └─────────────────────┘ └───────────┘   │
│                                                                  │
│  Environment Variables (.env):                                 │
│  ├─ SMTP_HOST        (e.g., smtp.gmail.com)                   │
│  ├─ SMTP_PORT        (e.g., 587)                               │
│  ├─ SMTP_USER        (your email account)                      │
│  ├─ SMTP_PASS        (app password)                            │
│  ├─ SMTP_FROM        (sender email)                            │
│  └─ OPENAI_API_KEY   (for content generation)                  │
│                                                                  │
│  Data Flow:                                                     │
│  Notice Data → PDF Generation → Email Content Generation       │
│            ↓                                                    │
│  Email Object → SMTP Transporter → Mail Server                │
└─────────────────────────────────────────────────────────────────┘
                             ↓
                    (Nodemailer handles SMTP)
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│              SMTP Server (Gmail, AWS SES, etc.)                │
│                                                                  │
│  Receives email with:                                           │
│  • From: legal@yourdomain.com (SMTP_FROM)                       │
│  • To: borrower@example.com (from notice.borrower_email)       │
│  • Subject: AI-generated subject line                          │
│  • Body: AI-generated email content (plain text)               │
│  • Attachment: Legal_Notice_Borrower_Loan.pdf                 │
└─────────────────────────────────────────────────────────────────┘
                             ↓
                    (Email transmitted)
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│              Borrower's Email Inbox                            │
│                                                                  │
│  📧 From: legal@yourdomain.com                                  │
│  📧 Subject: Legal Notice — Loan Account XX — Immediate...     │
│  📧 Body: Professional email summary                           │
│  📎 Attachment: PDF of signed legal notice                     │
└─────────────────────────────────────────────────────────────────┘
```

## Data Structure

### Notice Object (Before Email)
```javascript
{
  id: "notice-123",
  borrower_name: "John Doe",
  borrower_email: "john@example.com",
  loan_number: "LN-98765432",
  total_outstanding: 50000,
  dpd_days: 90,
  notice_content: "<p>Legal notice HTML...</p>",
  status: "signed",
  signed_at: "2026-01-15T10:30:00Z"
}
```

### Notice Object (After Email)
```javascript
{
  id: "notice-123",
  borrower_name: "John Doe",
  borrower_email: "john@example.com",
  loan_number: "LN-98765432",
  total_outstanding: 50000,
  dpd_days: 90,
  notice_content: "<p>Legal notice HTML...</p>",
  status: "dispatched",          // ← Updated
  signed_at: "2026-01-15T10:30:00Z",
  dispatched_at: "2026-01-15T11:00:00Z",      // ← Added
  dispatch_email: "john@example.com"           // ← Added
}
```

## Email Generation Process (Detailed)

```
Input: Notice with case data
   ↓
Step 1: Generate PDF
   • Convert notice_content HTML to PDF
   • Use Puppeteer to render page
   • Return pdfBuffer (binary data)
   ↓
Step 2: Generate Subject
   • OpenAI Call:
     Input: "Generate subject for loan LN-98765432"
     Output: "Legal Notice — Loan Account LN-98765432 — Immediate Action Required"
   ↓
Step 3: Generate Body
   • OpenAI Call:
     Input: {
       borrower_name: "John Doe",
       total_outstanding: "₹50,000",
       dpd: 90,
       notice_snippet: "..."
     }
     Output: "Dear John,\n\nWe write on behalf of... \n\nPlease pay within 7 days..."
   ↓
Step 4: Create Email Object
   {
     from: "legal@yourdomain.com",
     to: "john@example.com",
     subject: "Legal Notice — Loan Account LN-98765432 — Immediate Action Required",
     text: "Dear John,\n\nWe write on behalf of...",
     attachments: [
       {
         filename: "Legal_Notice_John_Doe_LN-98765432.pdf",
         content: pdfBuffer,
         contentType: "application/pdf"
       }
     ]
   }
   ↓
Step 5: Send via SMTP
   • Nodemailer connects to SMTP server
   • Authenticates with SMTP_USER / SMTP_PASS
   • Transmits email with attachment
   • SMTP server accepts and queues for delivery
   ↓
Step 6: Update Database
   • Update notice.status = "dispatched"
   • Set notice.dispatched_at = now
   • Set notice.dispatch_email = "john@example.com"
   ↓
Output: Email delivered to borrower inbox!
```

## Single Email Flow

```
User clicks "Send Email" on dashboard
        ↓
Frontend: sendEmail(noticeId)
        ↓
POST /api/notices/:id/send-email
        ↓
Backend:
  1. Get notice by ID
  2. If notice not found → return 404
  3. Generate PDF from notice.notice_content
  4. Call generateEmailSubject(notice.loan_number)
  5. Call generateEmailBody(
       notice.notice_content,
       notice.borrower_name,
       notice.total_outstanding,
       notice.loan_number
     )
  6. Extract borrower email:
     email = notice.borrower_email || req.body.email
  7. Call sendNoticeEmail({
       to: email,
       subject: emailSubject,
       body: emailBody,
       pdfBuffer: pdfBuffer,
       borrowerName: notice.borrower_name,
       loanNumber: notice.loan_number
     })
  8. Update notice:
     - status = "dispatched"
     - dispatched_at = now
     - dispatch_email = email
  9. Return success response
        ↓
Response: { success: true, notice: {...}, email_sent_to: "..." }
        ↓
Frontend: Show success toast, refresh dashboard
```

## Bulk Email Flow

```
User selects 5 signed notices, clicks "Email"
        ↓
Frontend: bulkSendEmail([id1, id2, id3, id4, id5])
        ↓
POST /api/notices/bulk-send-email
        ↓
Backend:
  results = []
  for each notice_id in list:
    Try:
      1. Get notice by ID
      2. Check if notice.borrower_email exists
      3. Generate PDF (async)
      4. Generate subject (OpenAI call)
      5. Generate body (OpenAI call)
      6. Send email via SMTP
      7. Update notice to "dispatched"
      8. Add to results: { id, success: true }
    Catch error:
      8. Add to results: { id, error: "message" }
        ↓
Response: {
  results: [
    { id: "id1", success: true },
    { id: "id2", success: true },
    { id: "id3", error: "No email address" },
    { id: "id4", success: true },
    { id: "id5", success: true }
  ],
  sent: 4,
  failed: 1
}
        ↓
Frontend: Show results summary, refresh dashboard
```

## Error Handling

```
Try to send email:
  ├─ Notice not found? → 404 error
  ├─ No borrower email? → 400 error
  ├─ PDF generation fails? → 500 error (check Puppeteer)
  ├─ OpenAI calls fail? → 500 error (check OPENAI_API_KEY)
  ├─ SMTP connection fails? → 500 error (check SMTP credentials)
  └─ All good? → 200 success!

Error response:
{
  error: "Descriptive error message",
  timestamp: "2026-01-15T11:00:00Z"
}
```

## Database Updates

When an email is sent, the notice record is updated:

```javascript
// Before sending
{
  status: "signed",
  signed_at: "2026-01-15T10:30:00Z"
}

// After successful send
{
  status: "dispatched",
  signed_at: "2026-01-15T10:30:00Z",
  dispatched_at: "2026-01-15T11:00:00Z",      // ← New
  dispatch_email: "john@example.com"           // ← New
}

// Audit trail preserved:
// This allows you to see:
// - Who generated the notice
// - Who signed it
// - When it was signed
// - When it was dispatched
// - To which email address
```

## SMTP Providers Integration

```
Gmail (smtp.gmail.com:587)
   ↓
AWS SES (email-smtp.region.amazonaws.com:587)
   ↑
SendGrid (smtp.sendgrid.net:587)
   ↓
Nodemailer SMTP Transporter
   ↓
Your Email System
```

Each provider requires different credentials, but the interface is identical - just update `.env`!

## Performance Notes

- **Single email:** ~2-3 seconds (includes PDF generation + 2 OpenAI calls)
- **Bulk email:** Processes sequentially; 100 emails ≈ 4-5 minutes
- **Optimization tip:** Can parallelize bulk sends with Promise.all() if needed

---

**Key Takeaway:** The system is fully integrated and ready to use. Just add SMTP credentials to `.env` and start sending!
