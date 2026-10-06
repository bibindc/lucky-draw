# Public Website Module

The single source of truth for the public showcase website: a site anyone can open, without signing in, that presents one featured campaign — its upcoming draws, prizes, recent winners and past results — and tells visitors how to join. Other specs refer here instead of repeating these rules.

Status key: **Built**, **Proposed** (agreed, not yet implemented), **Open** (needs a decision).

---

## 1. Purpose and scope

The admin app is private. Members and prospective members need a trustworthy, attractive place to see what the lucky draw offers and that draws really happen and are won.

In scope:
- A separate public website app (`site/`), with no sign-in.
- A public, read-only API that exposes only what the website shows.
- Site settings managed by super admins: which campaign is featured, and contact details.

Out of scope (see §9): participant self-service (sign-in, viewing own payments), online sign-up or payment, multiple featured campaigns, a CMS for free-form pages, multiple languages.

## 2. Decisions

- **P1. One featured campaign.** A super admin chooses at most one campaign to feature. Only the featured campaign's data is ever public. With no featured campaign, the site shows a "No lucky draw is being showcased right now" message and the contact details.
- **P2. Winner privacy.** Winners are shown by first name and last initial (e.g. "Asha R.") and serial number. A single-word name shows as-is. Mobile, email, address, agent, payments and claim or delivery status are never public.
- **P3. Separate app.** The website is its own app in the repository (`site/`), built and hosted separately from the admin app. It ships no admin code and sends no cookies.
- **P4. Read-only, aggregated API.** The public API is one summary endpoint plus image endpoints, all `GET`, all unauthenticated, all limited to the featured campaign.
- **P5. Content.** The site has: a hero with the next draw and a live countdown, headline figures, upcoming draws, the prizes of every draw, complimentary gifts, recent winners, past draw results, how it works, and contact / join details.

## 3. Glossary

| Term | Meaning |
|---|---|
| Featured campaign | The one campaign the site showcases (P1). |
| Public name | A winner's first name plus the initial of their last name (P2). |
| Next draw | The earliest `Scheduled` draw of the featured campaign. |

## 4. Data model

`SiteSettings` — a single row (id = 1), created on first save.

| Field | Rules |
|---|---|
| `featuredCampaignId` | Optional campaign. Null means nothing is featured. |
| `organizerName` | Optional, up to 120 characters. Shown as the site's organiser / brand line. |
| `contactPhone` | Optional, 7–15 digits with an optional leading `+`; spaces and dashes are removed. |
| `whatsappNumber` | Optional, same format as `contactPhone`. Shown as a "Chat on WhatsApp" link. |
| `contactEmail` | Optional, a valid email up to 160 characters. |
| `joinNote` | Optional, up to 600 characters, plain text. How to join (e.g. "Contact your area agent or call us"). |
| `updatedAt` | Set by the database. |
| `updatedByAdminId` | The super admin who last saved. |

## 5. Acceptance criteria

- AC-PUB-1: A super admin can open **Public website** in the admin app, choose the featured campaign (or none), and edit the organiser name, phone, WhatsApp number, email and join note, with the validation in §4. Agents cannot see the screen or call its API (403). **Built**
- AC-PUB-2: Saved settings appear on the public site within a minute (public responses are cached for at most 60 seconds). **Built**
- AC-PUB-3: The public summary contains only the featured campaign: name, per-draw amount, total amount, number of draws, duration, status, member count, and headline figures (draws completed, winners so far, prizes in total). No other campaign is reachable through the public API. **Built**
- AC-PUB-4: Every draw of the featured campaign is listed with its number, scheduled date and time, status (`Upcoming`, `Happening now` when in progress, `Results soon` when its time has passed but it has not started, `Completed`), and number of prizes. **Built**
- AC-PUB-5: The hero shows the next draw with a live countdown (days, hours, minutes, seconds) to its scheduled time. When a draw is in progress it shows "Draw N is happening now" instead; when the time has passed it shows "Results coming soon"; when every draw is completed it shows a "All draws completed — thank you" message. **Built**
- AC-PUB-6: Prizes are shown per draw with name, description, rank, value (when set), quantity and image (placeholder when none). Complimentary gift options that are active are shown with name, description and image, explaining that every member who pays all dues without winning chooses one. **Built**
- AC-PUB-7: Recent winners show the latest 8 winners across the featured campaign, newest first: public name (P2), serial number, prize, draw number and when it was drawn. **Built**
- AC-PUB-8: Past results list every completed draw, newest first, with its date, mode (Automatic or Manual) and its winners in round order (public name, serial, prize). **Built**
- AC-PUB-9: No public response contains a participant's mobile, email, address, agent, full surname, payments, claim status or any admin data. Tests assert this on the raw response. **Built**
- AC-PUB-10: Prize and complimentary option images of the featured campaign are served publicly (`Cache-Control: public`, cache-busted by `?v=`). Images of any other campaign return 404. **Built**
- AC-PUB-11: "How it works" explains, using the campaign's figures: join through an agent, pay the per-draw amount for each draw, winners are drawn each draw from members who have paid, a winner stops paying for later draws, and members who pay every draw without winning choose a complimentary gift. **Built**
- AC-PUB-12: Contact / join shows the join note and only the contact details that are set: phone as a `tel:` link, WhatsApp as a `https://wa.me/` link, email as a `mailto:` link. The section is hidden when nothing is set. **Built**
- AC-PUB-13: The site works without signing in, is responsive from 360 px phones to desktops, meets basic accessibility (landmarks, headings, alt text, visible focus, reduced motion respected), and refreshes its data every 60 seconds so a countdown that reaches zero and newly drawn winners appear without a reload. **Built**
- AC-PUB-14: If the API cannot be reached, the site shows a friendly "We could not load the latest draw details" message with a Retry button instead of a blank page. **Built**

## 6. API

Public (no authentication, mounted before the session check, no cookies needed):

| Method | Path | Purpose |
|---|---|---|
| GET | /public/site | Everything the site shows (AC-PUB-3..8, 11, 12): `{ settings, campaign \| null, stats, draws, nextDraw, prizes, complimentaryOptions, recentWinners, pastResults }`. `Cache-Control: public, max-age=60`. |
| GET | /public/prizes/:id/image | A featured campaign's prize image (AC-PUB-10). |
| GET | /public/complimentary-options/:id/image | A featured campaign's complimentary option image (AC-PUB-10). |

Super admin:

| Method | Path | Purpose |
|---|---|---|
| GET | /site-settings | Current settings (defaults when never saved). |
| PUT | /site-settings | Save settings (AC-PUB-1). `VALIDATION_ERROR` with field details; unknown campaign → `CAMPAIGN_NOT_FOUND`. |

`/public/*` allows any browser origin (it is read-only and uses no cookies), so the site can be hosted on any domain. The signed-in API keeps its own allow-list: `CORS_ORIGIN` may list several origins, separated by commas.

## 7. Screens

- **Admin → Public website** (super admin only, in the sidebar): featured campaign selector (None + every campaign with its status), contact fields, join note with a character count, Save, a success message, and an **Open public website** link (`VITE_SITE_URL`).
- **Public site** (one page, section links in the header, port 5180 in development): hero (campaign name, organiser, next draw and countdown, "See the prizes" and "How to join" buttons, and a spotlight of the top prize of the next draw that has prizes — or the latest winner when no upcoming draw has prizes yet), figures strip, draw calendar, prizes by draw (opening on the next draw with prizes), complimentary gifts, recent winners, past results, how it works, contact / join, footer.

## 8. Non-functional

- The public API reads only; it never writes. Responses are built from a fixed allow-list of fields (P4, AC-PUB-9).
- The site uses only public data and works if hosted on a different domain from the admin app.

## 9. Out of scope / later

- Participant self-service and online joining or payment.
- More than one featured campaign, or campaign archives beyond the featured one.
- Rate limiting at the API (recommended at the hosting proxy for production).
