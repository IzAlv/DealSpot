# DealSpot - Commodity Trading Dashboard

## Core Architecture
- **Frontend**: React + Shadcn UI (port 3000)
- **Backend**: FastAPI (port 8001, prefix /api)
- **Database**: MongoDB (DB: pir_grain_pulses — legacy name; rename to `dealspot` pending a migration window)
- **Auth**: JWT-based authentication

## What's Been Implemented

### Regression Testing & Bug Fix (2026-04-01)
- Full regression test (iteration 19): 94% backend / 100% frontend pass rate after 50+ file changes
- Fixed: Brokerage Invoices pending total showing 0 USD instead of 8,238.48 USD (stats filter was excluding cancelled/washout trades with generateBrokerCommission=true)

### Unified Brokerage Payment Logic (2026-04-01)
- Fixed mismatch between CommissionsPage, TradesPage, and VesselExecutionPage
- All 3 pages now use `trade.invoicePaid` field as unified source of truth for pending brokerage
- VesselExecutionPage: `isAwaitingBrokerage()` helper checks completed/brokerage status + !invoicePaid + has broker
- TradesPage: Year filter includes older completed trades with unpaid brokerage
- DB cleanup: MW1002, PIR-26-AZ8304, RC190126 status updated from 'brokerage' to 'completed' (all paid)

### Commission Invoice PDF (2026-04-01)
- Redesigned PDF layout via ReportLab (removed "INVOICE TO" and "TRADE DETAILS" headers, added framed "To:" box, moved Invoice No/Date inside the detail grid, centered logo, adjusted line widths)
- USER VERIFICATION PENDING

### Brokerage Invoices Logic (2026-03-31)
- Blocked users from marking invoices as PAID without setting a payment date
- Cancelled/Washout contracts trigger a dialog asking if broker commissions should be generated
- Merged all pending invoices into a single table

### Vessel Nominations & Emails (2026-03-31)
- Centered dialogs, configured CIF/CFR to hide the seller
- Overhauled email_sender.py to use compressed transparent inline CID logo
- Added Istanbul timezone formatting for the "Sent by [User] on [Date] at [Time]" tracker
- Excluded seller from receiving CIF/CFR nomination emails

### Documentary Instructions (2026-03-31, updated 2026-04-02)
- Transliterated Turkish text to uppercase English for Notify Party and Shipper
- Replaced browser print popup with direct "Generate PDF" download button
- Added centered transparent logo to preview
- Fixed DI email: Added inline CID logo attachment (same pattern as Commission Invoice email)

### Brokerage Payment Workflow (2026-03-31)
- Split completed contracts: "Awaiting Brokerage Payment" vs "Completed"
- Orange-themed table section between Completed and Washout

### Contract Completion Validation (2026-03-30)
- Payment Date and SWIFT Copy required before marking contract completed

### Global Search (2026-03-31)
- Full search across contracts, counterparties, vessels
- Turkish character transliteration
- 700px dropdown with grouped results and status badges

### Core Features
- JWT Auth, Trade CRUD, Counterparties, Reference data, PDF Gen, Email via Resend
- Commissions to Accounting Sync, Accounting Enhancements
- Port Line-Ups (Daily & Monthly), Documentary Instructions, Calendar
- Market Data (Indications, Live Prices, Turkish Exchanges, TMO Tenders, Coaster Freights, Telegram Feed)
- Business Cards OCR, Reports, URL Migration Guard

## Key API Endpoints
- `POST /api/auth/login` - JWT login
- `GET/PUT /api/trades/{id}` - Trade CRUD
- `PATCH /api/trades/{id}/status` - Status change
- `POST /api/trades/{id}/send-document-email` - Email with CID attachments
- `GET /api/trades/{id}/commission-invoice/pdf` - Commission Invoice PDF (ReportLab)
- `POST /api/doc-instructions/generate-pdf` - Documentary Instructions PDF
- `GET /api/invoices` - Invoice list (accounting)

## Credentials
- Admin: izzet.alev / izzet123
- Accountant: piraccount / piraccount123

## Prioritized Backlog
### P0
- Full Email Client Integration (Gmail in sidebar) - BLOCKED on user providing Google OAuth credentials
### P1
- Full Server-Side RBAC
### P2
- Refactor market_data.py (extract scrapers)
- TMO Tender copy-to-clipboard
- Automatic daily scraping (KTB/GTB)
- Break down large files (VesselExecutionPage 1200+ lines, TradesPage, DocInstructionsPage, email_sender.py)
### Clarifications Pending
- Should "CBOT - Soybeans" be removed from Live Prices table?
