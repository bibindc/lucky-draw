# Agent Approvals Module

The single source of truth for how agents' changes reach the system: every change an agent makes is a **request** that a super admin approves (optionally after editing it) or rejects. Nothing an agent submits takes effect until it is approved. Other specs refer here.

Status key: **Built**, **Proposed**, **Open**.

---

## 1. Purpose and scope

Agents work in the field: they register people, collect money and hand over prizes. The organiser wants a super admin to check every one of these changes before it counts.

In scope, for an agent's own participants (assigned to them, AC-AGT-8):
- Add a participant.
- Edit a participant's details (name, email, mobile, external user ID, address).
- Record a payment (number of upcoming draws, method, reference).
- Update a winner's prize claim/delivery status and note.
- Record a complimentary prize choice, and mark it delivered.

Out of scope: super admins' own changes (always immediate), and anything agents cannot do at all (campaigns, draws, prizes, agents).

## 2. Decisions

- **A1. Requests, not changes.** An agent action creates an approval request. The underlying record (participant, payment, claim, complimentary choice) is not changed until a super admin approves it. Super admins' own actions stay immediate.
- **A2. Same rules twice.** A request is checked against the normal business rules when it is submitted (so agents get immediate feedback) and again when it is approved (because things may have changed meanwhile). If approval fails a rule, nothing is applied and the request stays pending; the super admin can edit or reject it.
- **A3. Approve, edit or reject.** A super admin may approve a request as submitted, edit its details and approve (the original submission is kept for audit), or reject it with a reason (required) that the agent sees.
- **A4. One pending request per item.** An agent cannot submit a second pending request of the same kind for the same item (participant, or winner record). A new-participant request may not reuse a serial number, email, mobile or user ID that an existing participant or another pending new-participant request in the campaign already has.
- **A5. Withdraw.** The submitting agent can withdraw their own request while it is pending.
- **A6. Attribution.** Approved changes record both who submitted (the agent) and who approved (the super admin). A payment's "recorded by" is the approving super admin and its "collected by" is the agent; a new participant is assigned to the submitting agent.

## 3. Request types

| Type | Item (A4) | Details submitted | Applied on approval as |
|---|---|---|---|
| `PARTICIPANT_CREATE` | – (duplicate checks instead) | campaign, serial number, name, email, mobile, user ID, address | Add participant (AC-PAR-1..10, 23, 25) assigned to the agent |
| `PARTICIPANT_UPDATE` | participant | any of name, email, mobile, user ID, address | Edit participant (AC-PAR-12, 14) |
| `PAYMENT` | participant | number of upcoming draws, method, reference | Record payment (AC-PAY-2, 3; AC-ADV-1..3) |
| `WINNER_CLAIM` | winner record | claim status, note | Update claim/delivery (AC-WIN-3) |
| `COMPLIMENTARY_CHOICE` | participant | complimentary option | Record choice (AC-CMP-3) |
| `COMPLIMENTARY_DELIVERY` | participant | delivered at, note | Mark delivered (AC-CMP-4) |

## 4. Data model

`ApprovalRequest`

| Field | Rules |
|---|---|
| `id` | UUID. |
| `type` | One of §3. |
| `status` | `PENDING`, `APPROVED`, `REJECTED`, `WITHDRAWN`. |
| `campaignId` | Campaign of the participant (or of the new participant). |
| `participantId?` | Target participant; null for `PARTICIPANT_CREATE` until approved, then the created participant. |
| `winnerId?` | Target winner record for `WINNER_CLAIM`. |
| `agentId` | Submitting agent. |
| `payload` | JSON details as submitted, or as edited by the super admin. |
| `originalPayload?` | The agent's original details when a super admin edited them. |
| `pendingKey?` | `type:item` while pending, null otherwise; unique, so two pending requests for the same item cannot exist even when submitted at the same moment (A4). Null for `PARTICIPANT_CREATE`. |
| `submittedAt`, `decidedAt?`, `decidedByAdminId?`, `rejectionReason?` | Who decided, when, and why (rejection). |

`PaymentTransaction` gains `collectedByAgentId?` (A6).

Approving claims the request with a conditional update (`PENDING` → `APPROVING`), applies it, then marks it `APPROVED`; if applying fails it returns to `PENDING`. Two super admins approving the same request at once cannot apply it twice.

## 5. Requirements

### US-14 Agents submit changes for approval
As a super admin, I want every change an agent makes to be approved by me before it takes effect, so that field work is checked before it affects participants, payments and prizes.

| ID | Acceptance criterion | Status |
|---|---|---|
| AC-APR-1 | Agents can submit each request type in §3 for their own participants only (others are `404`). Submissions are checked against the normal rules and rejected immediately with field errors when invalid (A2). Nothing is changed until approval. | Built |
| AC-APR-2 | Agents can no longer change participants, payments, claims or complimentary prizes directly: the direct endpoints answer `403` to agents and point to requests. Super admins' direct actions are unchanged and immediate. | Built |
| AC-APR-3 | A second pending request of the same type for the same item is rejected with `REQUEST_ALREADY_PENDING` (A4), including simultaneous submissions. New-participant requests are rejected if their serial number or contact details clash with an existing participant or another pending new-participant request in the campaign; the suggested serial number skips numbers held by pending requests. | Built |
| AC-APR-4 | Agents see their requests (type, participant, details, submitted time, status, decision time, rejection reason) under **My requests**, and can withdraw a pending one. Participant detail shows pending requests for that participant. After submitting, the agent sees "Sent for approval". | Built |
| AC-APR-5 | Super admins see an **Approvals** screen listing requests, newest first, filterable by status (default Pending), type and agent, with a count of pending requests in the menu. Opening a request shows the agent, participant, submitted details and, for edits, the current values beside the requested ones. | Built |
| AC-APR-6 | A super admin can approve a request as submitted. Approval re-checks the rules and applies the change exactly like the super admin's own action, recording submitter and approver (A6). If a rule now fails, the error is shown, nothing changes, and the request stays pending. | Built |
| AC-APR-7 | A super admin can edit a pending request's details (same fields and validation as the agent's form) and approve it; the agent's original submission is kept and shown as "edited". | Built |
| AC-APR-8 | A super admin can reject a pending request with a reason (1–500 characters, required); nothing changes and the agent sees the reason. | Built |
| AC-APR-9 | A request can be decided once: approving, rejecting or withdrawing a request that is no longer pending answers `REQUEST_NOT_PENDING`, and two simultaneous approvals apply it only once. | Built |
| AC-APR-10 | A winner's participant detail shows the prize won and its claim status to the agent, with an action to request a claim/delivery update. | Built |

## 6. API

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/approval-requests` | Agent | Submit `{ type, campaignId?, participantId?, winnerId?, payload }` → `201 { request }` |
| GET | `/approval-requests` | Agent (own), super admin (all) | List; filters `status`, `type`, `agentId`, `participantId` |
| GET | `/approval-requests/pending-count` | Super admin | `{ count }` for the menu badge |
| GET | `/approval-requests/:id` | Owner agent, super admin | Request with participant's current values |
| POST | `/approval-requests/:id/approve` | Super admin | Optional `{ payload }` to edit before approving |
| POST | `/approval-requests/:id/reject` | Super admin | `{ reason }` |
| POST | `/approval-requests/:id/withdraw` | Owner agent | Withdraw a pending request |

Direct endpoints that become super-admin only (AC-APR-2): `POST /campaigns/:id/participants`, `PATCH /participants/:id`, `POST /participants/:id/complimentary`, `POST /participants/:id/complimentary/deliver` (payments and winner claims already are).

Errors: `VALIDATION_ERROR`, `NOT_FOUND`, `FORBIDDEN`, `REQUEST_ALREADY_PENDING`, `REQUEST_NOT_PENDING`, plus the rule errors of the applied action (e.g. `DUPLICATE_SERIAL`, `PAYMENT_NOT_ALLOWED`, `NOT_ELIGIBLE_COMPLIMENTARY`).

## 7. Screens

- **Agent – Participants:** Add participant, Edit details, Record payment, the complimentary panel and the winner's claim panel all submit requests and say "Sent for approval". A participant's detail shows a "Pending approval" list of its open requests.
- **Agent – My requests:** table of the agent's requests with status filter, details, rejection reasons and a Withdraw action.
- **Super admin – Approvals:** menu item with a pending count; table with status/type/agent filters; a review dialog with the details (and current values for edits), an Edit form, Approve, and Reject with reason.

## 8. Changes to other specs

- `04-agent-module.md`: agent permissions now go through requests (adding and editing participants, payments, claims, complimentary).
- `05-complimentary-module.md` C5: agents' complimentary choices and deliveries are requests that need approval.

## 9. Open questions

- **OQ-A1** Should agents or super admins be notified outside the app (SMS, email) when requests are submitted or decided? Default: no, in-app lists only.
- **OQ-A2** Should a pending payment request hold the draw open (e.g. block starting the draw)? Default: no; if the draw starts first, the approval fails and the super admin rejects or edits it.
