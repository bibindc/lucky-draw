# Tasks

Work in order. Each task lists the ACs it must satisfy. Write tests first.

- [ ] T1 Project setup: monorepo folders `backend/` and `frontend/`, TypeScript, lint/format, Vitest, Prisma + local SQLite file, env handling. (Constitution)
- [ ] T2 Prisma schema and migration for all tables in design; seed script with one admin.
- [ ] T3 Role auth: super-admin/agent login, JWT cookie, role middleware, protected routes in frontend. (AC-PAR-8, AC-AGT-1, AC-AGT-6)
- [ ] T4 Campaign + draw schedule API and validation. (AC-CAM-1..8)
- [ ] T5 Campaign UI: list, create form with per-draw schedule, draw status view, and scheduled-draw date/prize editing. (AC-CAM-1..7)
- [ ] T6 Draw-specific prize API + UI with per-draw stock and legacy unassigned-prize allocation. (AC-PRZ-1..7)
- [ ] T7 Participant API: global serial allocation from 1000, agent ownership, duplicate checks, scoped list/detail, DrawPayment rows. (AC-PAR-1..7, AC-PAR-10..11, AC-AGT-8)
- [ ] T8 Participant UI: serial display, super-admin agent filter, role-aware assignment, editable detail, PDF export, cancel/success. (AC-PAR-1..16, AC-AGT-7)
- [ ] T9 Payment recording API: single draw, void, history, participant status updates. (AC-PAY-1..7)
- [ ] T10 Advance payment API + UI (N selector, auto amount, allocation). (AC-ADV-1..5)
- [ ] T11 Draw execution service: eligibility, secure random selection, prize assignment, snapshot, transaction, concurrency lock. (AC-DRW-1..8)
- [ ] T12 Waiver and retained-credit logic inside draw execution; remaining-requirement display. (AC-WAV-1..4)
- [ ] T13 Draw screen UI: pre-run summary, confirm, result reveal. (AC-DRW-1..8)
- [ ] T14 Winners API + UI with claim/delivery updates and participant status transitions. (AC-WIN-1..5)
- [ ] T15 End-to-end test: full campaign with 10 draws, advance payer who wins, waiver check, exclusion check.
- [ ] T16 Hardening: error handling, pagination, audit fields, README run instructions.
- [ ] T17 Agent management: super-admin CRUD/status controls, generated agent IDs, login and ownership authorization. (AC-AGT-1..8)
- [x] T18 Participant list export: scoped unpaginated export API honouring list filters, Excel and PDF generation, toolbar actions with loading/empty/error states. (AC-PAR-17..22)
- [x] T19 Campaign overview dashboard: summary API with aggregate metrics, upcoming draws and activity; Overview page wired to live data with campaign selector, navigation and loading/empty/error states. (AC-DSH-1..7)
- [ ] T20 Agent test coverage: backend controller and integration tests for agent ID allocation, duplicates, edit, activation, and agent scoping; AC ids in test names. (AC-AGT-1..13; see `04-agent-module.md` §12)
- [ ] T21 Agent data hygiene: return only the recording admin's name (not email) to agents in participant detail; seed refuses an admin email already used by an agent. (04-agent-module G4, G5)
- [ ] T22 Password management: super-admin password reset and self-service password change, with session revocation via `passwordChangedAt`. (AC-AGT-14, AC-AGT-15)
- [ ] T23 Agent admin safeguards: deactivation confirmation with participant count; created-by and status-change audit fields. (AC-AGT-16, AC-AGT-17)
- [x] T24 Manual draw: schema (executionMode, heldAt, ManualDrawRecord, Winner.drawPosition) with backfill, shared completion routine, pool and manual-record APIs, Draws screen form/review/result, mode shown on results and winners. (AC-MDR-1..8)
- [x] T25 Winners export: serial and agent on winner rows, Excel and PDF of the filtered winners list with summary totals, toolbar actions with loading/empty/error states; shared export helpers. (AC-WIN-6..10)
- [x] T26 Sign out and session expiry: logout endpoint usable without a valid session, visible Sign out control for both roles, cache cleared on sign-out, sign-in notices, global 401 handling. (AC-AUTH-1..7)
- [x] T27 Draw rounds: one prize per round, admin picks the prize, mode fixed at start, rounds fixed at start, no early finish; schema (IN_PROGRESS, totalRounds, roundsCompleted, per-round winner snapshot/time/recorder) with backfill; start and round APIs replacing execute/manual; lock payments, edits and prizes while in progress; draw room UI; dashboard and status labels. (AC-DRW-1..11, AC-MDR-1..6, AC-CAM-6, AC-DSH-4)
- [x] T28 Participant address and manual serial numbers: address column and field; 1000–9999 serial with prefilled suggestion, uniqueness and race handling, super-admin-only serial change; detail, edit, PDF and export updates. (AC-PAR-2, 10, 12, 15, 19, 23..26)
- [x] T29 Participant list columns: address beside the name, remove the added-date column. (AC-PAR-25, AC-PAR-27)
- [x] T30 Complimentary prizes: options per campaign, eligibility, final choice, delivery, automatic cancellation on win or void, participant panel and super-admin screen, agent scoping. (AC-CMP-1..10)
- [x] T32 Agent approvals: approval requests for every agent change, submission and approval-time checks, approve/edit/reject/withdraw, one pending per item, agent My requests and request actions, super-admin Approvals screen; direct agent mutations become super-admin only. (AC-APR-1..10)
- [x] T33 Prize images: one JPG/PNG/WebP image per prize up to 2 MB, signature-checked, stored in the database; upload/replace/remove on the Prizes screen with preview and thumbnails; shown in the draw room reveal and draw result. (AC-PRZ-8..12)
- [x] T34 Complimentary option images: one image per option sharing the prize image rules; upload/replace/remove on the Complimentary screen with thumbnails; shown in the participant panel when choosing and for the recorded choice. (AC-CMP-11..13)
- [x] T35 Automatic draw spinner: at least 10 seconds cycling through the round's eligible serials, slow-down and landing on the server-picked winner; reveal, progress and winners list held until it lands; close blocked while spinning; stops at once on error. (AC-DRW-12)
- [x] T36 Public website: `SiteSettings` table and super-admin settings API and screen; unauthenticated `/public/site` summary and public image endpoints limited to the featured campaign with privacy allow-list; multi-origin CORS; new `site/` app (hero with countdown, figures, draws, prizes, complimentary gifts, recent winners, past results, how it works, contact) with tests. (AC-PUB-1..14)
- [x] T37 Free hosting on Render + Neon: generated PostgreSQL schema and migrations with a sync test and a migration script; case-insensitive search on PostgreSQL; Express serves the admin app in production; Render blueprint, build script and deployment guide; first git commit. (02-design.md §Deployment)
- [x] T38 Even draw schedule: the create-campaign form takes a first draw date and time and spreads the draws evenly across the duration in calendar months (one a month for equal months and draws, two a month for twice as many, and so on), rebuilding on changes to duration, draw count or first draw while keeping prize counts. (AC-CAM-9)
- [x] T39 Participant list paging, serial search and sorting: digits-only search matches the serial exactly; `sort`/`order` on the list API (newest, serial, name); sortable Number and Participant headings; pagination bar with range, page size 25/50/100 and Previous/Next, returning to page 1 on any filter or order change. (AC-PAR-28..30)
- [x] T40 Payment date: `paidOn` on payment transactions (SQLite and PostgreSQL migrations, existing payments backfilled from their entry time); optional India date on the record-payment API and agent payment requests, defaulting to today and refusing future days; date field in the payment dialog, editable when approving; payment history ordered by it and showing the entry date when later; participant PDF columns. (AC-PAY-7, AC-PAY-8)

Blocked by open questions: T12 (OQ-1), T11 (OQ-2), T4 (OQ-3), T7 (OQ-4), T22 (OQ-AGT-4).
