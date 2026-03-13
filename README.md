# Section 138 — Legal Notice Generator

An AI-powered tool for generating, reviewing, signing, and dispatching legal notices to loan defaulters. Built for collections teams and lawyers.

## What it does

1. **Pick cases** — Use natural language to filter borrowers (e.g., "All borrowers in Maharashtra with DPD > 90 and outstanding above 50,000")
2. **Generate notices** — AI drafts legal notices with tone based on DPD severity (soft → moderate → strict → severe)
3. **Review & edit** — Edit notices manually or use AI prompts to refine them
4. **Lawyer approval** — Lawyer reviews, signs, or rejects notices with comments
5. **Dispatch** — Send signed notices as PDF via email to borrowers

## Tech stack

- **Frontend**: React 18 + Material-UI + Vite
- **Backend**: Express.js + Node.js
- **AI**: OpenAI GPT-4o for notice generation and case filtering
- **PDF**: Puppeteer for PDF generation
- **Email**: Nodemailer (Gmail SMTP)

## Project structure

```
section138/
├── client/               # React frontend
│   ├── src/
│   │   ├── App.jsx       # Main app with chat-based case picker
│   │   ├── api.js        # API client
│   │   └── components/
│   │       ├── CampaignDashboard.jsx   # Campaign list view
│   │       ├── NoticeDashboard.jsx     # Notice list with bulk actions
│   │       ├── NoticeEditor.jsx        # Rich text editor + AI edit
│   │       ├── ChatMessage.jsx         # Chat UI for case selection
│   │       └── UserSwitcher.jsx        # Toggle between Legal Ops / Lawyer
│   └── public/
│       └── _redirects    # Netlify SPA routing
├── server/               # Express backend
│   ├── index.js          # API routes
│   ├── dataLoader.js     # CSV data loading
│   ├── filterEngine.js   # Filter logic for case selection
│   ├── openaiService.js  # AI query parsing and filter generation
│   ├── noticeService.js  # Notice content generation with GPT
│   ├── noticeStore.js    # In-memory notice storage
│   ├── campaignStore.js  # Campaign CRUD
│   ├── pdfService.js     # Puppeteer PDF generation
│   ├── emailService.js   # SMTP email sending
│   ├── noticeTemplate.js # HTML template for PDF notices
│   └── data/
│       ├── dummy_loan_data_small.csv  # Sample loan data (2000 rows)
│       └── lawyer_signature.jpg       # Signature image for notices
└── render.yaml           # Render deployment config
```

## User roles

| Role | Can do |
|------|--------|
| **Legal Ops** | Pick cases, generate notices, edit, send to lawyer, dispatch emails |
| **Lawyer** | Review notices, sign/approve, reject with comments |

## Local setup

### Backend

```bash
cd server
npm install
npm start
```

Runs on `http://localhost:5001`

### Frontend

```bash
cd client
npm install
npm run dev
```

Runs on `http://localhost:5173`

### Environment variables

Create a `.env` file in the root:

```
OPENAI_API_KEY=your-openai-key
PORT=5001
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
SMTP_FROM=your-email@gmail.com
```

## Deployment

- **Frontend**: Netlify (root directory: `client`, build command: `npm run build`, publish: `client/dist`)
- **Backend**: Render (root directory: `server`, build: `npm install`, start: `node index.js`)

Set `VITE_API_URL` in Netlify to your Render backend URL + `/api`.
