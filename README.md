# Section 138 — Legal Notice Generator

**An AI-powered tool that takes legal collections from "hours of manual ops work" to "minutes of review and approve."**

## The Problem

When a lender hands over a portfolio of overdue borrowers, the legal collections team has to:

1. **Find the right cases** — sift through thousands of borrowers by DPD, outstanding amount, state, disposition, payment history. Today this means clicking through filter dropdowns, one column at a time, across a spreadsheet with 240+ columns.
2. **Draft legal notices** — write a Section 138 notice for each borrower. The tone should be soft for early delinquency, severe for 500+ DPD. The consequences mentioned should depend on E-Nach status, outstanding amount, and past interactions. Every notice is written from scratch.
3. **Get lawyer approval** — route each notice to a lawyer for review and signature. This happens over email threads, WhatsApp messages, and shared drives. There's no audit trail.
4. **Dispatch** — convert signed notices to PDF, compose an email, attach the PDF, and send it to the borrower. One at a time. For hundreds of borrowers.

Every step is manual. Every step is repetitive. And every step follows patterns that are predictable enough for AI to handle.

## The Insight

Legal collections work is high-stakes but low-variance. A borrower in Maharashtra with 90 DPD and 50K outstanding gets roughly the same notice as every other borrower matching that profile. The tone escalation rules, the consequence paragraphs, the legal language — these follow patterns. What changes is the borrower-specific data injected into those patterns.

The entire workflow — case selection, notice drafting, approval routing, and dispatch — can be compressed into a single tool where AI handles the predictable parts and humans handle the judgment calls.

## What This Tool Does

### Talk to your data, don't filter it

Type "all borrowers in Maharashtra with DPD above 90 and outstanding over 50,000" and get results. No filter dropdowns, no column hunting. The AI parses your intent, asks 2-3 clarifying questions ("Which DPD bucket?", "Include written-off accounts?"), and returns matching cases in a table. Ask follow-ups naturally — "break this down by state," "sort by highest amount," "exclude Telangana."

### AI-drafted notices with calibrated tone

Select cases and generate notices in bulk. Each notice is drafted by GPT-4o with tone automatically calibrated to delinquency severity:

- **Soft** (< 180 DPD) — polite reminder, emphasis on resolution
- **Moderate** (180–365 DPD) — firm tone, clear consequences
- **Strict** (365–545 DPD) — escalation language, legal action referenced
- **Severe** (545+ DPD) — maximum pressure, asset attachment, CIBIL reporting

The AI also adjusts consequences based on case specifics — failed E-Nach triggers Section 138 emphasis, high outstanding triggers asset attachment language, evasive dispositions trigger stronger warnings.

### Edit with AI, not from scratch

Open any notice in a rich text editor. Make manual edits, or type a prompt: "make this stricter," "shorten the consequences section," "add a paragraph about CIBIL impact." The AI modifies the notice while preserving your previous edits. Every change — manual or AI — is tracked in edit history.

### Lawyer approval workflow

Send notices to a lawyer with one click (or in bulk). Lawyers see a dedicated view with only notices awaiting their signature. They can sign (approve) or reject with comments. Rejected notices return to draft for revision. No email threads, no shared drives — the entire approval loop happens inside the tool.

### Dispatch as PDF via email

Signed notices are converted to professional PDFs (via Puppeteer) with letterhead, branding, and lawyer signature. Send them to borrowers as email attachments — individually or in bulk. The AI generates a concise, professional email subject and body for each borrower. Track dispatch status for every notice.

### Campaign management

Group notices into campaigns. Track how many are in draft, pending signature, signed, or dispatched. Add more cases to an existing campaign. Every campaign gives you a birds-eye view of where your legal collection effort stands.

## Product Decisions Worth Noting

**Chat-first case selection.** Filter UIs don't scale to 240 columns. Natural language does. The AI handles column alias resolution ("POS," "outstanding," and "principal" all map to "Amount Pending"), operator correction, and disambiguation. Users don't need to know the schema.

**Tone calibration is automatic, not manual.** Ops teams shouldn't have to decide the tone for each notice. DPD determines the baseline tone, and case-specific factors (E-Nach, amount, disposition) adjust the consequences. Humans review the output, not configure the input.

**Role separation is structural, not just permissions.** Legal Ops and Lawyers see different views of the same data. Lawyers can't edit notices — only approve or reject. This isn't a limitation; it mirrors the actual approval workflow and creates a clean audit trail.

**In-memory storage by design.** The prototype uses in-memory storage for notices and campaigns. No database setup, no migration scripts. Data resets on server restart. This is intentional — the tool is built to demonstrate the workflow, not to be a production database. Swap in MongoDB or PostgreSQL without changing a single API contract.

**PDF generation happens on-demand.** Notices are stored as HTML, not PDF. PDFs are generated only when previewed, downloaded, or emailed. This keeps editing fast and storage light.

## Tech Stack

- React 18 + Material-UI + Vite (frontend)
- Express.js + Node.js (backend)
- OpenAI GPT-4o / GPT-4o-mini (notice generation, query parsing, email drafting)
- Puppeteer (HTML → PDF conversion)
- Nodemailer (SMTP email dispatch — Gmail, AWS SES, SendGrid)
- React Quill (rich text editing)
- MUI X DataGrid (case results table)
- CSV-parser (loan data ingestion)

## Setup

### Backend

```bash
cd server
npm install
```

Create `server/.env`:

```
OPENAI_API_KEY=sk-your-key-here
```

Start the server:

```bash
npm run dev
```

Runs on `http://localhost:5001`.

### Frontend

```bash
cd client
npm install
npm run dev
```

Runs on `http://localhost:5173`.

### Email dispatch (optional)

Add SMTP config to `server/.env` if you want to send emails:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
SMTP_FROM=your-email@gmail.com
```

For Gmail, use an [app password](https://myaccount.google.com/apppasswords) (requires 2FA enabled).

## Usage

1. Open `http://localhost:5173`
2. You start as **Legal Ops** — type a query like "borrowers in Maharashtra with DPD > 90"
3. Answer clarifying questions, review results, refine with follow-ups
4. Select cases → **Generate Notices** → name your campaign
5. Open notices in the editor — review AI drafts, edit manually or with AI prompts
6. Click **Send to Lawyer** (single or bulk)
7. Switch to **Lawyer** role (top-right toggle) → review and sign notices
8. Switch back to **Legal Ops** → select signed notices → **Send Email**

## Project Structure

```
legal-case-picker/
├── client/                          # React frontend
│   └── src/
│       ├── App.jsx                  # Main app — chat interface, case picker, campaign flow
│       ├── api.js                   # API client for all backend endpoints
│       └── components/
│           ├── ChatMessage.jsx      # Chat bubbles — text, questions, results, breakdowns
│           ├── CampaignDashboard.jsx # Campaign list with status breakdown
│           ├── NoticeDashboard.jsx  # Notice table with filters, search, bulk actions
│           ├── NoticeEditor.jsx     # Rich text editor + AI edit + PDF preview + sign/reject
│           └── UserSwitcher.jsx     # Toggle between Legal Ops and Lawyer views
│
├── server/                          # Express backend
│   ├── index.js                     # API routes — cases, campaigns, notices, PDF, email
│   ├── dataLoader.js                # CSV ingestion — loads 2000+ borrower records on startup
│   ├── filterEngine.js              # Filter logic — operators, alias resolution, validation
│   ├── openaiService.js             # AI query parsing — natural language → structured filters
│   ├── noticeService.js             # AI notice generation — tone calibration, consequence logic
│   ├── noticeStore.js               # In-memory notice CRUD — draft → signed → dispatched
│   ├── campaignStore.js             # In-memory campaign management
│   ├── pdfService.js                # Puppeteer PDF generation
│   ├── emailService.js              # SMTP email dispatch via Nodemailer
│   ├── noticeTemplate.js            # HTML template for PDF rendering
│   └── data/
│       ├── dummy_loan_data_small.csv # Sample loan data (2000 borrowers, 240+ columns)
│       └── lawyer_signature.jpg      # Signature image embedded in PDFs
│
└── render.yaml                      # Render deployment config
```

## User Roles

| Role | Access |
|------|--------|
| **Legal Ops** | Pick cases, generate notices, edit (manual + AI), send to lawyer, dispatch emails |
| **Lawyer** | Review notices (read-only), sign/approve, reject with comments |

## Deployment

- **Frontend**: Netlify — root: `client`, build: `npm run build`, publish: `client/dist`
- **Backend**: Render — root: `server`, build: `npm install`, start: `node --max-old-space-size=450 index.js`
- Set `VITE_API_URL` in Netlify env vars to your Render backend URL + `/api`
