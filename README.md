# FridgeLedger

AI-powered smart pantry management and grocery inflation tracking platform.

FridgeLedger is a Web SaaS application that helps households reduce food waste and detect hidden grocery inflation. Users upload or paste grocery receipt data, and the platform extracts grocery line items with an AI model, estimates shelf life, stores pantry records, tracks historical unit prices, and highlights price increases or shrinkflation over time.

The AI receipt parsing uses Google Gemini (gemini-3.5-flash-lite) via Google AI Studio for vision-based receipt extraction.

## Product Vision

Most households lose money in two quiet ways:

- Perishable groceries are forgotten until they expire.
- Grocery prices and package sizes change gradually, making inflation hard to notice from paper receipts.

FridgeLedger turns each receipt into structured pantry and price data so users can manage food before it spoils and understand how their grocery costs are changing.

## Core Capabilities

- **Authentication**: Email/password account access with Supabase Auth.
- **Receipt Upload**: Users upload grocery receipt images from the browser.
- **AI Receipt Extraction**: FastAPI sends receipt images to Google Gemini vision-capable models for OCR and structured item extraction.
- **Pantry Management**: Extracted items are stored as pantry records that users can view, edit, delete, mark consumed, or mark wasted.
- **Shelf-Life Estimation**: The AI assigns estimated shelf-life by item category, and the backend stores estimated expiry dates.
- **Price History**: Every purchase updates a historical unit-price record by normalized item name, unit, merchant, and purchase date.
- **Inflation Detection**: The backend deterministically compares current unit prices against prior purchases and flags price hikes or shrinkflation.
- **Analytics Dashboard**: Users can review monthly spending, top inflated products, waste ratio, and spending trends.

## Architecture

```text
Browser
  -> Next.js frontend
  -> FastAPI backend
  -> Google Gemini (AI Studio) for vision extraction
  -> Supabase Postgres, Auth, and Storage
```

The LLM handles perception and interpretation tasks such as OCR, item extraction, normalization, categorization, and shelf-life estimation. Price comparison and shrinkflation detection stay in deterministic backend code so the financial logic is auditable.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Backend | Python 3.11, FastAPI, Uvicorn, Pydantic |
| Database | Supabase Postgres |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| AI | Google Gemini (gemini-3.5-flash-lite via Google AI Studio) |
| Hosting | Vercel for frontend, Render for backend |

## Repository Structure

```text
.
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── schemas/
│   │   ├── services/
│   │   └── main.py
│   └── requirements.txt
├── docs/
│   ├── tasks.md
│   └── techstack.md
└── frontend/
    ├── app/
    ├── package.json
    └── tsconfig.json
```

## Backend Development

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API health check is available at:

```text
GET http://localhost:8000/health
```

The AI receipt parser is available at:

```text
POST http://localhost:8000/receipts/scan-text
```

## Frontend Development

```bash
cd frontend
bun install
bun run dev
```

The frontend runs at:

```text
http://localhost:3000
```

## Environment Variables

Frontend:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=
```

Backend:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=receipts
GEMINI_API_KEY=
GEMINI_MODEL_ID=gemini-3.5-flash-lite
GMAIL_SMTP_USER=
GMAIL_SMTP_APP_PASSWORD=
GMAIL_FROM_EMAIL=
```

## Expiry Email Reminders

Food expiry emails are sent by a backend script intended for a daily cron job. Run a dry run first:

```bash
cd backend
python scripts/send_expiry_reminder_emails.py
```

Send real emails and record sent notifications:

```bash
cd backend
python scripts/send_expiry_reminder_emails.py --apply
```

## MVP Success Criteria

The MVP is successful when a user can:

- Sign up and log in.
- Upload a receipt from the web app.
- Receive parsed pantry items.
- Store receipt and pantry data in Supabase.
- Detect at least one price increase or shrinkflation case from historical purchases.
- View pantry and analytics screens.

### Testing Message
