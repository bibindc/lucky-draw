# Complimentary Prize Module

The single source of truth for complimentary prizes: a gift every participant earns by paying all their dues without winning a draw. Other specs refer here instead of repeating these rules.

Status key: **Built**, **Proposed** (agreed, not yet implemented), **Open** (needs a decision).

---

## 1. Purpose and scope

Most participants in a lucky draw never win. A complimentary prize rewards those who paid every draw of their campaign: once their dues are fully paid and they have not won, they may choose one item from the campaign's list of complimentary prizes.

In scope:
- Each campaign's list of complimentary prize options.
- Who is eligible, and when eligibility starts and ends.
- Recording a participant's choice and tracking its delivery.
- What happens to a choice when the participant later wins, or a payment is voided.

Out of scope (see §10): stock limits, exports and dashboard figures for complimentary prizes.

## 2. Decisions

- **C1. Eligibility.** A participant is eligible when every draw payment of their campaign is `Paid` and they have not won any draw. Eligibility can start before the campaign ends (for example, after an advance payment covering all draws). A participant who joined after some draws were completed has those draws `Not Paid` and not payable (OQ-4), so is not eligible.
- **C2. Losing eligibility.** A participant who wins a draw later, or whose payment is voided so that a draw is no longer `Paid`, stops being eligible. An undelivered choice is then cancelled automatically (§5).
- **C3. Options.** Each campaign has its own list of complimentary prize options. There is no stock limit: any number of participants may choose the same option.
- **C4. One choice, final.** An eligible participant has at most one active choice. Once recorded it cannot be changed by users; only the automatic cancellation in C2 ends it.
- **C5. Who acts.** Participants do not log in (D4). Super admins record choices and deliveries for any participant immediately. Agents submit them, for their own participants only, as approval requests that take effect when a super admin approves them (`06-agent-approvals-module.md`). Only super admins manage the option list.

## 3. Glossary

| Term | Meaning |
|---|---|
| Complimentary option | One item on a campaign's complimentary list, e.g. "Dinner set". |
| Choice | The option an eligible participant picked, with its status. |
| Fully paid | Every draw payment of the participant's campaign is `Paid`. |

## 4. Data model

`ComplimentaryOption`

| Field | Rules |
|---|---|
| `id` | UUID. |
| `campaignId` | The campaign it belongs to. |
| `name` | Required, trimmed, 1–120 characters, unique within the campaign (case-insensitive). |
| `description` | Optional, up to 500 characters. |
| `valuePaise` | Optional, integer paise ≥ 0, for reference. |
| `isActive` | Defaults to true. Inactive options cannot be chosen but stay on existing choices. |
| `imageUpdatedAt` | When the option's image last changed; null when it has none. Used to build a fresh image URL. |
| `createdAt`, `updatedAt` | Set by the database. |

`ComplimentaryOptionImage`: optionId (unique, deleted with the option), mimeType, data (bytes, ≤ 2 MB), size, updatedAt. One optional image per option, stored in the database like prize images (AC-PRZ-8).

`ComplimentaryChoice`

| Field | Rules |
|---|---|
| `id` | UUID. |
| `participantId` | Unique: a participant has one choice row. |
| `optionId` | The chosen option. |
| `status` | `CHOSEN`, `DELIVERED` or `CANCELLED`. |
| `chosenAt`, `chosenByAdminId?`, `chosenByAgentId?` | When and by whom it was recorded. |
| `deliveredAt?`, `deliveryNote?`, `deliveredByAdminId?`, `deliveredByAgentId?` | Set when delivered. |
| `cancelledAt?`, `cancelReason?` | Set by the system on cancellation (C2). |

Options are never deleted, so choices always point at a real option. A participant whose choice was cancelled and who becomes eligible again can choose again: the same row is reused with the new option and status `CHOSEN`.

## 5. Status model

```
 (eligible, no choice) ── record choice ──► CHOSEN ── mark delivered ──► DELIVERED
                                               │
                         wins a draw / payment voided (system)
                                               ▼
                                           CANCELLED ── eligible again ──► CHOSEN
```

- A `CHOSEN` choice is cancelled in the same transaction as the draw round the participant wins (reason "Won draw N"), or as the payment void (reason "Payment voided").
- A `DELIVERED` choice is never cancelled. If the participant later wins, the list flags it "Delivered before winning" for follow-up (OQ-C1).
- Voiding a payment is refused while the participant's complimentary prize is `DELIVERED`, because the prize was given on the strength of that payment.

## 6. Requirements

### US-13 Complimentary prizes for fully paid non-winners
As a super admin, I want participants who paid every draw and did not win to receive a complimentary prize of their choice, so that loyal participants are rewarded.

| ID | Acceptance criterion | Status |
|---|---|---|
| AC-CMP-1 | A super admin can add complimentary options to a campaign (name, optional description and value), edit them, and deactivate or reactivate them. Duplicate names in a campaign are rejected. Options are never deleted. | Built |
| AC-CMP-2 | A participant is eligible exactly when every draw payment of their campaign is `Paid` and they have not won (C1). Eligibility is computed by the server, never stored. | Built |
| AC-CMP-3 | For an eligible participant with no active choice, an authorized user (C5) can record one active option as their choice, after a confirmation that the choice is final. The server rejects ineligible participants (`NOT_ELIGIBLE_COMPLIMENTARY`), inactive or other campaigns' options (`OPTION_UNAVAILABLE`), and a second choice (`COMPLIMENTARY_ALREADY_CHOSEN`), including two simultaneous attempts. | Built |
| AC-CMP-4 | A `CHOSEN` choice can be marked delivered with a delivery date (default today, not in the future, not before the choice) and an optional note of up to 500 characters. A choice that is not `CHOSEN` cannot be delivered. | Built |
| AC-CMP-5 | Choices cannot be changed or removed by users (C4). | Built |
| AC-CMP-6 | When a participant wins a draw round, their `CHOSEN` choice becomes `CANCELLED` with reason "Won draw N" in the same transaction. A `DELIVERED` choice is kept and flagged "Delivered before winning". | Built |
| AC-CMP-7 | When a payment is voided, the participant's `CHOSEN` choice becomes `CANCELLED` with reason "Payment voided" in the same transaction. Voiding is refused (`PAYMENT_NOT_ALLOWED`) while their choice is `DELIVERED`. | Built |
| AC-CMP-8 | Participant detail shows a Complimentary prize section: eligibility (or why not: "Pay all N draws to qualify (M paid)" / "Winners don't receive a complimentary prize"), the choice, who recorded it and when, delivery details, or the cancellation reason. Actions follow C5. | Built |
| AC-CMP-9 | A super-admin Complimentary screen per campaign lists the options with how many times each was chosen and delivered, and lists eligible participants and everyone with a choice: serial, name, agent, mobile, choice and status (Not chosen, Chosen, Delivered, Cancelled, Delivered before winning), searchable and filterable by status, with the same record and deliver actions. | Built |
| AC-CMP-10 | Agents can see and act only on their own participants' eligibility and choices, even through the API (`404` for others), and can read the campaign's active options. | Built |
| AC-CMP-11 | A super admin can upload one image per complimentary option (JPG, PNG or WebP, up to 2 MB, checked by the file's contents as for prize images, AC-PRZ-8), replace it, or remove it, at any time, including after the option has been chosen. | Built |
| AC-CMP-12 | The Complimentary screen shows each option's image as a thumbnail (or a placeholder), and its add/edit form has Upload/Replace and Remove with a preview before saving. | Built |
| AC-CMP-13 | When recording a choice, the participant's complimentary panel shows the selected option's image, and the recorded choice shows the image of the option chosen, so the participant can be shown what they are picking. Images are served only to signed-in users (agents included, for their participants' panel). | Built |

## 7. API

All under `/api/v1`, signed in.

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/campaigns/:id/complimentary-options` | Super admin (all), agent (active only) | Options with counts of active choices and deliveries |
| POST | `/campaigns/:id/complimentary-options` | Super admin | `{ name, description?, valuePaise? }` → `201 { option }` |
| PATCH | `/complimentary-options/:id` | Super admin | Any of `{ name, description, valuePaise, isActive }` |
| PUT | `/complimentary-options/:id/image` | Super admin | Upload or replace the image (raw image bytes, as for prize images) |
| DELETE | `/complimentary-options/:id/image` | Super admin | Remove the image |
| GET | `/complimentary-options/:id/image` | Signed in | The image; URLs carry `?v=<imageUpdatedAt>` |
| GET | `/campaigns/:id/complimentary` | Super admin (all), agent (own) | Eligible participants plus anyone with a choice; filters `status`, `search` |
| GET | `/participants/:id/complimentary` | Super admin, own agent | `{ eligible, paidDraws, totalDraws, isWinner, choice }` |
| POST | `/participants/:id/complimentary` | Super admin, own agent | Record choice `{ optionId }` |
| POST | `/participants/:id/complimentary/deliver` | Super admin, own agent | `{ deliveredAt?, note? }` |

Errors: `VALIDATION_ERROR`, `NOT_FOUND`, `FORBIDDEN`, `NOT_ELIGIBLE_COMPLIMENTARY`, `OPTION_UNAVAILABLE`, `DUPLICATE_OPTION`, `COMPLIMENTARY_ALREADY_CHOSEN`, `COMPLIMENTARY_NOT_CHOSEN`.

Recording a choice runs in one transaction: re-check eligibility, check the option, then reuse a `CANCELLED` row with a conditional update or insert a new row. The unique index on `participantId` makes a second simultaneous insert fail, which is reported as `COMPLIMENTARY_ALREADY_CHOSEN`.

## 8. Screens

- **Participant detail** (both roles): a Complimentary prize panel next to draw and payment history (AC-CMP-8). Record choice: option dropdown, then a confirm step stating the choice is final. Mark delivered: date (Asia/Kolkata) and note. The option picker shows the selected option's image, and a recorded choice shows its option's image.
- **Complimentary** menu (super admin only): campaign selector; Options card with image thumbnails and add/edit (including image upload, preview, replace and remove) and Active/Inactive toggle; Participants table with search, status filter and row actions (AC-CMP-9).

## 9. Test plan

Backend integration tests on a real database for eligibility (paid all, partly paid, late joiner, winner), recording (option checks, finality, simultaneous attempts, agent scoping), delivery rules, and the automatic cancellations from winning and voiding. Frontend tests for the participant panel states and actions, and the Complimentary screen's options and list.

## 10. Open questions

- **OQ-C1** If a participant who already received their complimentary prize later wins a draw, should anything happen beyond the "Delivered before winning" flag (e.g. recover the gift)? Default: flag only.
- **OQ-C2** Should complimentary choices appear in participant exports, the participant PDF and the Overview? Default: not yet.
- **OQ-C3** Should options ever have limited stock? Decided no (C3); revisit if suppliers limit quantities.
