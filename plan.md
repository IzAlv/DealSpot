# Development Plan — PIR Grain & Pulses Trading Dashboard

## 1) Objectives
- Deliver a complete V1 of the **PIR Grain & Pulses Trading Dashboard** based on the “Pir App Eklenecekler” document.
- Ensure the core operational workflows exist end-to-end:
  - Trades lifecycle (16 statuses) + filtering
  - Calendar events + dashboard visibility
  - Omega (Accounting) invoices + bank statements
  - Counterparties (business card view + departments model)
  - Trade detail/contract view + commodity-specific shipment document checklists
  - Notifications (admin visibility) for key changes
- Maintain a stable, usable app after each incremental change.

**Already done (per conversation):**
- Sidebar branding text **“PIR GRAIN & PULSES”** forced to one row.
- Sidebar is **collapsible/expandable**.
- **Dark/Light mode** implemented and working.
- Removed “Made with Emergent” badge.

## 2) Implementation Steps

### Phase 1 — Core Workflow POC (Trades status flow + Calendar events)
**Goal:** prove trade status progression + event visibility (Calendar ↔ Dashboard).

**Completed user stories**
1. As a trader, I can set a Trade’s status to any of the defined lifecycle stages.
2. As a trader, I can see status clearly in the Trades list and filter by it.
3. As a user, I can add Calendar events (payment/meeting/conference).
4. As a user, I can see upcoming events on the Dashboard.

**Implemented**
- Backend:
  - Canonical list of **16 trade statuses**:
    - Confirmation, Draft Contract, Nomination sent, DI sent, Drafts confirmation,
      Appropriation, Dox, Pmt, Disch, Shortage, Demurrage, Dispatch, Brokerage,
      Completed, Cancelled, Washout.
  - Existing `events` collection + CRUD API used for Calendar.
- Frontend:
  - Trades: status column + status pill + quick status updates (dropdown).
  - Trades: added **Status filter** dropdown (All Statuses + the 16 statuses).
  - Calendar: CRUD UI for events.
  - Dashboard: upcoming events widget fed from events API.


### Phase 2 — V1 App Development (Excel-like Trades + RBAC)
**Goal:** improve usability and enforce access control for Omega.

**Completed user stories**
1. As a trader, I can view Trades in a dense table similar to Excel.
2. As a user, I can search and filter trades quickly.
3. As an admin, I can restrict Omega access to authorized roles.

**Implemented**
- Frontend:
  - Trades list is compact and supports search + multiple filters.
  - RBAC (UI-level): **Omega link only visible** for roles: `admin`, `accountant`.

**Note:** API-level enforcement can be tightened in a follow-up (currently primarily UI gating).


### Phase 3 — Accounting (Omega) Page + Notifications
**Goal:** accounting workflow + admin visibility of key changes.

**Completed user stories**
1. As an accountant, I can create invoices and set due dates.
2. As an accountant, I can upload monthly bank statements.
3. As an admin, I can see notifications and unread counts.

**Implemented**
- Backend:
  - `invoices` CRUD (existing).
  - Added `bank_statements` collection + CRUD endpoints:
    - `GET/POST/DELETE /api/bank-statements`
  - Added `notifications` collection + endpoints:
    - `GET /api/notifications`
    - `PATCH /api/notifications/read-all`
    - `PATCH /api/notifications/{id}/read`
  - Emitted notification on **trade create**.
- Frontend:
  - Omega page renamed visually to **“Omega — Accounting”**.
  - Omega has **tabs**:
    - Invoices (search + add)
    - Bank Statements (add + list)
  - Header bell now includes a **notifications dropdown** with unread badge.


### Phase 4 — Counterparties enhancements
**Goal:** richer counterparty management and quick “business card” detail view.

**Completed user stories**
1. As a user, I can open a counterparty and see a business-card style view.
2. Partner schema supports `departments` for future multi-contact departmental expansion.

**Implemented**
- Backend:
  - Extended partner model with `departments: []` (schema support).
- Frontend:
  - Counterparties table Actions includes a **View (Eye)** button.
  - View opens a **business card** dialog showing key details.


### Phase 5 — Trade Detail / Contract Page + Shipment Document Checklist
**Goal:** a trade-centric contract view with shipment details and required docs checklist.

**Completed user stories**
1. As a trader, I can open a trade and view key sections (Confirmation, Shipment, Parties).
2. As a trader, I can maintain a shipment document checklist per trade.
3. Checklist adapts to commodity:
   - Wheat base list (13 docs)
   - Corn adds +3 docs
   - WBP adds +1 doc

**Implemented**
- Frontend:
  - Added route: **`/trades/:tradeId`**
  - Trades list rows navigate to Trade Detail.
  - Trade detail tabs:
    - Confirmation
    - Shipment Details
    - Parties & Agents
    - Documents checklist (progress bar + save)
- Backend:
  - Trade update endpoint accepts general fields (including `docChecks`) via `PUT /api/trades/{trade_id}`.


## 3) Next Actions (Immediate)
All phases requested in the provided document are implemented. Next recommended actions:
1. **Harden RBAC server-side** (enforce role checks in backend endpoints for Omega, admin-only actions).
2. Add **departments/contacts editing UI** in Counterparties (create/edit departments + multiple contacts per department).
3. Extend **notification emitters** to cover more actions:
   - Partner create/update
   - Invoice/statement upload
   - Document checklist changes
4. Add optional **file upload persistence** for bank statements and document templates (Sample Documents page).


## 4) Success Criteria
**Met (current state):**
- Trades support all **16 statuses**; status changes persist and are visible.
- Calendar events CRUD works; Dashboard shows upcoming items.
- Omega page supports invoices + bank statements.
- Omega navigation restricted to `admin/accountant` at UI level.
- Counterparties have business-card detail view; backend supports departments field.
- Notifications appear in header dropdown and unread count updates.
- Trade detail page supports multi-tab sections and commodity-specific doc checklist.
- Sidebar branding fix complete; sidebar collapsible; dark mode works; Emergent badge removed.

**Remaining enhancements (optional, follow-up):**
- Full server-side RBAC enforcement.
- Full departmental contacts CRUD UI for counterparties.
- Sample document templates upload/download page.
- Richer ship/contract detail inputs (editing and persistence for rates/agents/surveyor selections).