# Design

## Architecture
```
React SPA (Vite)  --HTTPS/JSON-->  Express API (/api/v1)  --Prisma-->  SQLite
```
Backend layers: routes → controllers (validation with Zod) → services (business rules, transactions) → Prisma repositories.

## Data model

| Table | Key fields |
|---|---|
| Admin | id, email (unique), passwordHash, name, role (SUPER_ADMIN), createdAt |
| Agent | id, agentCode (unique, sequential from AG-1000), email (unique), mobile (unique), passwordHash, name, isActive, createdAt, updatedAt |
| SequenceCounter | key, nextValue; global atomic counters for participant serials and agent IDs |
| Campaign | id, name, durationMonths, drawCount, totalAmountPaise, perDrawAmountPaise, status, createdAt |
| Draw | id, campaignId, drawNumber, scheduledAt, prizeCount, status (SCHEDULED/IN_PROGRESS/COMPLETED/CANCELLED), executionMode? (AUTOMATIC/MANUAL, set at start), totalRounds? (fixed at start), roundsCompleted (default 0), startedAt?, heldAt? (when the draw took place: start time for automatic, entered time for manual), executedAt? (completion time), executedByAdminId (started by), poolSnapshot (JSON, eligible pool at start), unique(campaignId, drawNumber) |
| ManualDrawRecord | id, drawId (unique), conductedBy, drawMethod, venue?, witnesses?, notes?, evidenceReference?, createdAt; one row per manually recorded draw |
| Participant | id, participantNumber (unique across campaigns, 1000–9999, chosen at creation with a suggested default; changeable by super admins), address? (free text, ≤ 500 chars), campaignId, agentId?, name, email?, mobile?, externalUserId?, status, createdAt; unique per campaign on email, mobile, externalUserId (where not null) |
| DrawPayment | id, participantId, drawId, status (NOT_PAID/PAID/WAIVED), retainedCredit (bool), transactionId?, unique(participantId, drawId) |
| PaymentTransaction | id, participantId, amountPaise, method, reference?, paidOn (start of the India day the money was received; AC-PAY-8), status (RECORDED/VOIDED), recordedByAdminId, createdAt (when entered), voidedAt? |
| Prize | id, campaignId, drawId?, name, description, valuePaise?, rank, totalQuantity, assignedQuantity; null drawId is legacy/unassigned inventory |
| PrizeImage | prizeId (unique, cascades with the prize), mimeType (image/jpeg, image/png, image/webp), data (bytes, ≤ 2 MB), size, updatedAt; one optional image per prize, stored in the database so backups include it |

Image uploads (prize images and complimentary option images) share one image module: the file-signature check, the 2 MB limit and the raw-body reader live in one place.
| Winner | id, drawId, participantId, prizeId, drawPosition (round number), drawnAt, recordedByAdminId?, poolSnapshot (JSON, eligible pool for that round), claimStatus (PENDING/CLAIMED/DELIVERED), claimNote?, claimUpdatedAt, createdAt; unique(participantId) per campaign |

Rule enforcement notes:
- A participant wins at most once: unique constraint on Winner per participant.
- Participant and agent numbers are allocated transactionally from `SequenceCounter`; existing participants receive numbers in createdAt/id order during migration. Counters are global and never decremented or reused.
- Agent-owned participant queries always include the authenticated agent ID on the server. The UI's agent selector is not an authorization boundary.
- Draw execution runs in one DB transaction and first conditionally claims a due `SCHEDULED` draw with a write (`UPDATE ... WHERE status = 'SCHEDULED' AND scheduledAt <= now`). SQLite serializes writers, and the conditional update prevents concurrent runs from executing the same draw twice.

## Key algorithms
**Eligible pool (AC-DRW-2):** participants of the campaign with DrawPayment(drawId).status = PAID and no Winner row.

**Prize inventory (AC-PRZ-6):** prizes are associated with one draw. Draw execution only considers unassigned units where `Prize.drawId` matches that draw; legacy prizes with no draw assignment are not eligible.

**Start draw (US-6, US-11):**
1. Claim the draw with a conditional write: `UPDATE Draw SET status = 'IN_PROGRESS' … WHERE id = ? AND status = 'SCHEDULED' AND scheduledAt <= now`. Exactly one start succeeds; SQLite serializes writers.
2. Manual mode: validate heldAt (≥ scheduledAt, ≤ now) and save the ManualDrawRecord. Automatic mode: heldAt = now.
3. Build the eligible pool and available prize units; store the start pool snapshot; set totalRounds = min(prizeCount, pool size, available units), roundsCompleted = 0, executionMode, heldAt, startedAt, executedByAdminId (started by).
4. If totalRounds = 0, complete the draw immediately (step 6 of Draw round) and return a warning.

**Draw round (US-6, US-11), one transaction per round:**
1. Claim the round: `UPDATE Draw SET roundsCompleted = n WHERE id = ? AND status = 'IN_PROGRESS' AND roundsCompleted = n - 1`, where `n` is the round number the client sends. A repeated click or a concurrent request for the same round updates nothing and gets `ROUND_CONFLICT`.
2. The prize must belong to this draw and have units left (`PRIZE_UNAVAILABLE`); increment its `assignedQuantity` with a guarded update.
3. Build the current eligible pool (D5) and store it on the Winner row as that round's snapshot.
4. Automatic: pick one participant with `crypto.randomInt(pool.length)`. Manual: the given participant must be in the pool (`INELIGIBLE_WINNER`).
5. Insert the Winner (drawPosition = n, drawnAt = now, recordedByAdminId); set participant WINNER; waive later NOT_PAID payments and flag later PAID ones `retainedCredit = true`.
6. If n = totalRounds: mark the draw COMPLETED with executedAt = now; if it is the campaign's last draw, mark non-winners COMPLETED.

Pool and stock cannot change underneath a running draw: payments, voids, draw edits and prize changes all require the draw to be `SCHEDULED` (prize description/value excepted), so the pool only shrinks by the draw's own winners and totalRounds stays reachable.

**Advance payment (US-4):** validate N ≤ unpaid upcoming draws; one transaction of N × perDrawAmount; mark selected DrawPayments PAID and link transactionId.

## API (all under /api/v1, a session is required except for login and logout)

Routers mounted on the shared `/api/v1` prefix must guard each route individually (`router.get(path, requireSuperAdmin, handler)`), never with `router.use(requireSuperAdmin)`: a router-wide guard runs for every request that passes through that router, including routes registered later for agents. `backend/tests/routing.test.ts` checks the agent access matrix through the real router.

| Method | Path | Purpose |
|---|---|---|
| POST | /auth/login | Start a session (super admin or agent); sets the httpOnly session cookie |
| POST | /auth/logout | End the session: always clears the session cookie and returns 204, even when the session is missing or expired |
| GET | /auth/me | Current super-admin or agent session and role |
| GET/POST | /agents | Super-admin list/search and create agents |
| PATCH | /agents/:id | Super-admin edit profile or activate/deactivate agent |
| POST | /campaigns | Create campaign with draws |
| GET | /campaigns, /campaigns/:id | List/detail |
| GET | /campaigns/:id/draws | Draw schedule and status |
| GET | /campaigns/:id/dashboard | Super-admin overview summary: progress, metrics, next 3 scheduled draws with eligibility, recent activity |
| PATCH | /draws/:id | Edit date/time, prize count (SCHEDULED only) |
| GET | /draws/:id/result | Pool snapshot at start, winners by round (with drawnAt and recorded by), progress, executionMode, heldAt, manualRecord; valid for in-progress and completed draws |
| GET | /draws/:id/pool | Current eligible participants (serial, name, agent, contact), this draw's prizes with units left, rounds planned (or planned if started now) and rounds drawn; used by the start dialog and the draw room |
| POST | /draws/:id/start | Start a due draw: `{ mode: "AUTOMATIC" }` or `{ mode: "MANUAL", heldAt, conductedBy, drawMethod, venue?, witnesses?, notes?, evidenceReference? }`; returns the draw with totalRounds and a warning when it has 0 rounds |
| POST | /draws/:id/rounds | Draw one round of an in-progress draw: `{ round, prizeId, participantId? }` (participantId only, and required, in Manual mode); returns the new winner and draw progress |
| POST | /campaigns/:id/participants | Add participant with `participantNumber` (optional; the next suggested number is used when omitted) and optional `address`; super admin supplies agentId, agent is assigned automatically |
| GET | /participants/next-serial | Next suggested serial number `{ serial: number | null }` (null when 1000–9999 are all used); super admins and agents |
| GET | /campaigns/:id/participants | Super-admin list/search/filter by status and agent; agent sees own assignments only. `search` also matches `participantNumber` exactly when it is all digits; `page` (default 1), `pageSize` (default 25, max 100); `sort` = `newest` (default: createdAt desc, then serial desc) \| `serial` \| `name` (then serial asc) with `order` = `asc` (default) \| `desc`; returns `pagination { page, pageSize, total, pageCount }` |
| GET | /campaigns/:id/participants/export | Unpaginated rows for list export; accepts the same `search`, `status`, `agentId` filters as the list and the same agent scoping; ordered by serial; at most 10,000 rows, otherwise `EXPORT_TOO_LARGE` |
| GET | /participants/:id | Scoped detail with payments and history |
| PATCH | /participants/:id | Edit contact/profile fields and address; super admin may reassign to an active agent and change `participantNumber` |
| POST | /participants/:id/payments | Record payment (single or advance: `drawIds[]`) |
| POST | /payments/:transactionId/void | Void a payment |
| GET | /participants/:id/payments | Payment history |
| POST/GET | /campaigns/:id/prizes?drawId=:drawId | Create/list prizes for one draw; `drawId=unassigned` lists legacy inventory |
| PATCH/DELETE | /prizes/:id | Edit/move an unassigned prize or delete it before assignment; assigned prizes retain existing restrictions |
| PUT | /prizes/:id/image | Super admin: upload or replace the image; raw image bytes as the body with its `Content-Type`; contents checked by file signature (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF….WEBP`); returns the prize with `imageUpdatedAt` |
| DELETE | /prizes/:id/image | Super admin: remove the image |
| GET | /prizes/:id/image | Signed-in users: the image bytes with its type; `404` when none. The URL carries `?v=<imageUpdatedAt>` so a replaced image is fetched fresh |
| GET | /campaigns/:id/winners | Winners list with filters (`drawId`, `claimStatus`), unpaginated, ordered by draw number then drawPosition; each row includes participant serial and agent. Also the data source for the winners export |
| PATCH | /winners/:id/claim | Update claim/delivery status |

## UI screens
1. Login, with a notice after sign-out ("You have been signed out.") or session expiry ("Your session has ended. Please sign in again."). Every signed-in screen has a labelled **Sign out** button at the bottom of the sidebar (icon-only with an accessible name when the sidebar is collapsed)
2. Campaigns list, Create campaign (draw schedule table with date/time and prize count per draw), campaign schedule detail with a modal editor for scheduled draws
3. Campaign dashboard (Overview): campaign selector, progress banner, four metric cards, upcoming draws table, next-draw card, recent activity; all from `GET /campaigns/:id/dashboard`
4. Participants: list with serial number, name, address (next to the name, one line, full text on hover) and agent, no added-date column, Add User form with a prefilled editable serial number and an address box, super-admin agent filter, role-aware Add User assignment, editable detail, draw/payment history, and PDF export; list toolbar with **Export Excel** and **Export PDF** for the currently filtered list
5. Record payment dialog (single draw, or advance with N selector and auto amount)
6. Prizes: campaign and draw selectors, per-draw stock, an Unassigned legacy inventory view, image thumbnails, and add/edit form with image upload, preview, replace and remove
7. Draw screen: list of draws with status and, for in-progress draws, round progress. A due draw has **Start draw**: a dialog to choose Automatic or Manual (manual asks for held at, conducted by, method and optional details), showing eligible count, prizes available and the number of rounds, then confirm. An in-progress draw has **Continue**, opening the draw room: progress (Round n of N), winners so far, a prize selector (lowest rank suggested first), and **Draw winner** (automatic: runs a spinner over the eligible serial numbers for at least 10 seconds, then lands on and reveals the winner, AC-DRW-12) or a participant picker with **Record winner** (manual, with a confirm step). The draw completes after the last round and shows the result. Completed rows and result dialogs show Automatic/Manual and, for manual draws, the captured details.
8. Winners: table by draw, claim/delivery status editor; filter bar with **Export Excel** and **Export PDF** for the currently filtered list
9. Agents (super-admin only): searchable list, create/edit form, active/deactivated state

Scheduled draw editing opens the row's date/time and prize-count inputs prefilled. Save calls `PATCH /draws/:id`; cancel discards local edits. Completed and cancelled draw rows do not expose edit controls. Validation errors remain visible beside the row without discarding the entered values.

**Campaign dashboard (AC-DSH-1..7):** computed in `dashboard.service` with aggregate queries, never in the UI. Eligible for a draw = `DrawPayment` `PAID` for that draw and participant has no Winner (D5). Pending for the next draw = `NOT_PAID` for that draw and no Winner. Collection rate = `PAID` draw payments ÷ (`PAID` + `NOT_PAID` on `SCHEDULED` draws). Prize stock sums `totalQuantity`/`assignedQuantity` over prizes with a `drawId`; prizes with null `drawId` are reported as `unassignedPrizeCount`. Activity merges the latest participants (`createdAt`), payment transactions (`createdAt`, plus `voidedAt` for voids), winners (`createdAt`) and claim updates (`claimUpdatedAt`), sorted newest first, limited to 6. The response carries ISO timestamps; the UI formats them in Asia/Kolkata and as relative times.

**Session handling (US-12):** the browser cannot read the httpOnly cookie, so the server is the only place a session ends. Sign out calls `POST /auth/logout`; a `401` reply counts as success (already signed out), while a network failure keeps the user signed in and shows an error. On success the client clears the whole query cache, then sets the session to signed-out with the sign-out notice. Every API helper attaches the HTTP status to its errors; one query-cache and mutation-cache error handler treats any `401` from a signed-in request as an ended session: it clears the cache and shows the sign-in screen with the expiry notice. `GET /auth/me` answering `401` simply means "not signed in" and shows sign-in without a notice.

**Winners export (AC-WIN-6..10):** the winners list endpoint is already unpaginated and filtered on the server, so no separate export endpoint is needed. On export the client fetches the list again with the current filters (so the file reflects the latest claim updates) and builds the files in the browser with the same libraries and layout as the participant export: Excel sheet `Winners` (frozen header, numeric prize value) plus `Export details` (campaign, filters, count, per-status totals, total prize value, generation time); PDF in A4 landscape. File name: `winners-<campaign-slug>-<YYYY-MM-DD>.xlsx|pdf`. Shared helpers (IST dates, INR text, file names, header styling) live in one export utility used by both exports.

**Serial numbers (D7, AC-PAR-23..26):** the `participant-number` SequenceCounter holds the next number to suggest. The suggestion is the lowest number ≥ the counter that no participant holds; if none is free up to 9999 it searches from 1000 upward, and returns null when every number is taken. Creating a participant with the suggested number moves the counter just past it; a manually typed number does not move the counter (the suggestion skips it when it gets there). Uniqueness is enforced by the database's unique index on `participantNumber`; the API pre-checks to give a clear `DUPLICATE_SERIAL` error (with the next suggestion in `details`) and also maps a unique-index race to the same error, so two simultaneous saves of one number cannot both succeed.

**Participant list export (AC-PAR-17..22):** the client calls the export endpoint with the list's current filters, so the server applies the same `where` clause as the list (including forced agent scoping) without pagination. Files are generated in the browser: Excel with `write-excel-file` (sheet `Participants` with a frozen header row and numeric amount column, plus an `Export details` sheet with campaign, filters, record count and generation time); PDF with `jspdf` + `jspdf-autotable` in A4 landscape, with the same details in the header and page numbers in the footer. File name: `participants-<campaign-slug>-<YYYY-MM-DD>.xlsx|pdf` (date in Asia/Kolkata). Amount paid = number of `PAID` draw payments × campaign per-draw amount.

## Error codes
`VALIDATION_ERROR`, `DUPLICATE_PARTICIPANT`, `DUPLICATE_SERIAL`, `DUPLICATE_AGENT`, `DRAW_NOT_DUE`, `DRAW_ALREADY_COMPLETED`, `PAYMENT_NOT_ALLOWED`, `PRIZE_ASSIGNED`, `INELIGIBLE_WINNER`, `PRIZE_UNAVAILABLE`, `ROUND_CONFLICT`, `DRAW_ALREADY_STARTED`, `DRAW_NOT_IN_PROGRESS`, `DRAW_IN_PROGRESS`, `NO_ELIGIBLE_PARTICIPANTS`, `EXPORT_TOO_LARGE`, `INVALID_IMAGE`, `IMAGE_TOO_LARGE`, `NOT_FOUND`, `FORBIDDEN`, `UNAUTHORIZED`.

## Deployment

Free hosting on Render and Neon (decided 2026-10-06). Local development and tests stay on SQLite; production runs on PostgreSQL.

```
Render web service (Node 22):  Express API (/api/v1)  +  built admin app (same origin)  --Prisma-->  Neon PostgreSQL
Render static site:            public website (site/)  --HTTPS-->  /api/v1/public/*
```

- **One origin for the admin app.** In production Express serves `frontend/dist` and falls back to its `index.html` for any non-API path, so the admin app calls `/api/v1` on its own origin and the `SameSite=Strict`, `Secure` session cookie keeps working. The public site lives on its own origin and uses only the cookie-free public API (`07-public-website.md`).
- **Two schemas, one source.** `backend/prisma/schema.prisma` (SQLite) is the source of truth. `backend/prisma/postgres/schema.prisma` is generated from it (provider `postgresql`, plus `directUrl` for migrations) and has its own migrations in `backend/prisma/postgres/migrations`. After any schema change, run `npm run postgres:migration --workspace backend -- <name>` to regenerate the Postgres schema and write its migration; a test fails if the generated schema is out of date.
- **Text search** (`contains`) is case-insensitive on both databases: SQLite's `LIKE` already is, and on PostgreSQL the query adds `mode: 'insensitive'`.
- **Concurrency.** The conditional updates that claim draws, rounds and approval requests are atomic on PostgreSQL too: a second writer waits for the row lock and then matches no row.
- **Build and release on Render.** The build installs dependencies, generates the Postgres client, applies Postgres migrations (`migrate deploy` over `DIRECT_URL`), creates or updates the super admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD`, and builds the backend and admin app. `render.yaml` describes both services and their settings. Secrets (`DATABASE_URL`, `DIRECT_URL`, `ADMIN_PASSWORD`) are entered in Render, never committed; `JWT_SECRET` is generated by Render.
- **Free-tier limits.** The web service sleeps after 15 minutes without traffic, so the first request afterwards takes about a minute. Neon keeps the data; Render's disk is not used for data.

## Module specs
- Agents: [`04-agent-module.md`](04-agent-module.md) is authoritative for agent accounts, sign-in, permissions and agent scoping. The agent rows above summarise it.
- Complimentary prizes: [`05-complimentary-module.md`](05-complimentary-module.md) is authoritative for complimentary options, eligibility, choices and delivery, including its tables (`ComplimentaryOption`, `ComplimentaryChoice`), API and error codes.
- Public website: [`07-public-website.md`](07-public-website.md) is authoritative for the public showcase site (`site/` app), `SiteSettings`, the unauthenticated `/public/*` API and what it may expose.
- Agent approvals: [`06-agent-approvals-module.md`](06-agent-approvals-module.md) is authoritative for agents' change requests and their approval (`ApprovalRequest`, `PaymentTransaction.collectedByAgentId`), API and error codes.
