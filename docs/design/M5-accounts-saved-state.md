# M5 Design — Accounts & Saved State

> Status: in progress. Milestone: [`docs/ROADMAP.md`](../ROADMAP.md) → M5.
> Depends on M1 (scoring config), M3 (league config), M4 (state worth saving).

Last updated: 2026-08-05

M1–M4 gave a user a lot of state worth keeping: their exact league scoring, their
league size and lineup, a scatter they liked, five players they keep comparing, a board
sorted the way they think. All of it currently lives in a URL and a `localStorage` key
— which was the right call (spine C: shareable by default, no login wall on day one),
and which evaporates the moment they open the site on their phone.

M5 does not replace that. It **layers an account on top of it** as a sync and naming
mechanism, and changes nothing about how a page resolves its state when nobody is
signed in.

---

## 1. The core decision — the account is a sync layer, not a gate

Spine C said "URL-encoded + `localStorage` state before accounts; accounts later just
sync the same state." M5 is the "later", and takes that literally.

**Nothing is gated behind login.** Every board, every Insight score, every scatter,
every share link works exactly as it does today for a signed-out visitor. An account
buys you three things and no fourth: your config follows you between devices, you can
keep more than one of it, and you can name things.

This is the same shape as the three per-request configs. A signed-in user's active
league profile is a *source of defaults*, never the source of truth for a rendered
page. The resolution order is strict and one-directional:

```
URL query param  >  active league profile  >  localStorage  >  hard-coded default
```

The URL winning over the account is the load-bearing part. If a friend sends you a link
with `?scoring=ppr:te_rec=1.5`, you see *their* league, not yours — otherwise every
shared link silently lies to whoever opens it, and the shareability the whole product
was built around quietly stops working for exactly the users who care most. Signed-in
users get a "viewing a shared setup — switch back to *My League*" affordance rather
than a silent override.

**Consequence:** `useScoring` and `useLeague` keep their existing signature and their
existing URL/`localStorage` behaviour. Accounts slot in as one more fallback layer
between them. No page or hook that reads scoring today needs to know accounts exist.

---

## 2. Auth — Supabase issues, FastAPI verifies

Two sign-in methods, both email-based, neither requiring an account with any third
party:

- **Email + password** — the familiar path, and the one that still works when a user's
  mail is slow, filtered, or on a different device.
- **Email magic link** — nothing to invent or remember. Also the recovery path for
  anyone who set a password and forgot it.

They are deliberately complementary rather than redundant. A magic link is the lowest
-friction way to *start*; a password is the most reliable way to *return*, because it
does not depend on an email arriving. Offering only one would strand users at whichever
point that one fails.

> **Superseded (2026-08-05).** This originally shipped as Google OAuth only. Swapped
> before merge — see the decision log entry in `ROADMAP.md`. The backend was almost
> unaffected, which is the point of the split below: `app/auth.py` verifies whatever
> Supabase signs and has never cared how the user proved who they were.

The split of responsibility:

| Concern | Owner |
|---|---|
| Sign-up, password check, emailing links, session refresh | Supabase Auth (via `@supabase/supabase-js` in the browser) |
| Access token → identity | `app/auth.py`, verifying the JWT |
| Who owns what data | FastAPI + SQLAlchemy, exactly like every other table |

The frontend uses `supabase-js` **purely as a token issuer**. It never reads or writes
application data. Every request still goes to FastAPI over HTTP, now with an
`Authorization: Bearer <token>` header — which keeps CLAUDE.md's decoupling rule intact
and keeps authorization in tested Python rather than in RLS policies that live in a
dashboard and are invisible to code review.

### Verifying the token

Supabase signs project JWTs one of two ways depending on the project's age:

- **Asymmetric (current default)** — ECC P-256 or RSA, public keys published at
  `https://<project>.supabase.co/auth/v1/.well-known/jwks.json`. Verified with the
  public key; the API never holds a secret that could mint tokens.
- **Legacy HS256** — a shared project secret.

`app/auth.py` supports both: it fetches and caches the JWKS and verifies asymmetrically
when a key is available, and falls back to the shared secret when `SUPABASE_JWT_SECRET`
is configured instead. Both paths check signature, expiry, issuer, and the `authenticated`
audience. This is a decision made once in one file — nothing downstream cares which
path ran.

### The local `users` row

Supabase keeps its own `auth.users` table, in a schema Alembic does not own and should
not touch. Our tables need a real foreign key, so we mirror the minimum:

```sql
users (
  user_id     UUID PRIMARY KEY,   -- the Supabase JWT `sub`, verbatim
  email       VARCHAR(255),
  display_name VARCHAR(100),
  avatar_url  VARCHAR(512),
  created_at  TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ
)
```

The row is **provisioned just-in-time**: the first authenticated request from an unknown
`sub` inserts it (`ON CONFLICT DO UPDATE` on the profile fields, matching the pipeline's
idempotency rule). No webhook, no sync job, no second source of truth that can drift —
if you can present a valid token, your row exists by the time the handler runs.

`display_name` falls through `full_name` → `name` → `user_name` → **the email's local
part**. That last fallback matters for email sign-up, where a name is optional and the
token's metadata may be empty; `avatar_url` is simply null, and the UI renders an
initial, which for email accounts is the normal case rather than a degraded one.

### The client-side flow

`AuthDialog` is the whole surface: sign-in, sign-up, magic link, forgot-password, a
"check your inbox" terminal state, and a set-a-new-password form. That last mode is
never chosen — it is entered when Supabase fires `PASSWORD_RECOVERY`, which happens
after someone follows a reset link.

Two consequences worth knowing:

- **A reset link signs the user in.** So the recovery form has to be reachable from the
  *signed-in* branch of the header menu, not just the signed-out one. `AccountMenu`
  mounts `AuthDialog` in both.
- **The dialog is portalled to `document.body`.** It renders from inside the sticky
  header, and `.glass-header`'s `backdrop-filter` makes that header a containing block
  for `position: fixed` descendants — so without the portal the overlay is positioned
  against the header and clipped to it instead of covering the viewport. Any future
  modal rendered from the header has the same constraint.

---

## 3. League profiles — named bundles of two strings

A user in three leagues is the normal case, not the power case, so profiles are plural
from the start.

```sql
league_profiles (
  profile_id  UUID PRIMARY KEY,
  user_id     UUID REFERENCES users(user_id) ON DELETE CASCADE,
  name        VARCHAR(60),      -- "Home 12-team PPR"
  scoring_spec VARCHAR(500),    -- the M1 spec string, verbatim
  league_spec  VARCHAR(200),    -- the M3 spec string, verbatim
  is_active   BOOLEAN,
  created_at / updated_at TIMESTAMPTZ,
  UNIQUE (user_id, name)
)
```

**A profile stores the two spec strings verbatim** — the exact text that already goes in
the URL and `localStorage` — rather than a normalized column-per-scoring-rule schema.
That is deliberate:

- The grammars in `app/scoring.py` and `app/league.py` are already the canonical
  definition, already validated, already mirrored in `constants/scoring.js` and
  `constants/league.js`. A second, normalized representation would be a fourth place
  the grammar lives and a guaranteed drift source.
- Adding a scoring rule later (a new stat category) becomes a change in the grammar
  only — no migration, and every existing saved profile keeps parsing.
- A profile is then literally a bookmark of two strings, and everything downstream of
  the spec string is untouched.

Cost: the specs are validated on write (parsed through the same functions the API uses,
returning 422 on a bad spec) rather than being unrepresentable-when-invalid. Worth it.

`is_active` is enforced to at most one per user inside the same transaction as any
activation. Deleting the active profile promotes the most recently updated remaining
one, so a signed-in user is never left in a state with profiles but no active one.

### The anonymous → account migration

On first sign-in, if the browser has a non-default scoring or league in `localStorage`
**and** the account has zero profiles, that config is saved as a profile named
**"My League"** and made active. Someone who spent ten minutes entering their league's
scoring before deciding to sign up does not lose it, and does not have to notice that
anything was transferred.

Guarded on *zero existing profiles*, so it runs once and never overwrites real profiles
on a later sign-in from a different browser.

---

## 4. Saved views — a route and a query string

A scatter and a comparison are already *completely* described by their URL — that was
the point of spine C. So a saved view stores exactly that:

```sql
saved_views (
  view_id     UUID PRIMARY KEY,
  user_id     UUID REFERENCES users(user_id) ON DELETE CASCADE,
  name        VARCHAR(60),
  path        VARCHAR(120),   -- "/explore/scatter", "/insight/buy-low"
  query       VARCHAR(2000),  -- the query string, minus the leading "?"
  created_at / updated_at TIMESTAMPTZ,
  UNIQUE (user_id, name)
)
```

No per-board save logic, no typed config union, and **every board added after M5 is
saveable the day it ships** with zero additional code. The alternative — a typed schema
per view kind — buys validation we do not need and costs a migration every time a board
gains a filter.

### The premise was only half true — the boards had to be fixed first

Implementing this exposed that the claim above held for the Explore tools and **not**
for the 17 boards: `LeaderboardView` and `InsightView` kept season, week, position,
season type, and sort in `useState`, so none of it was ever in the URL. The first saved
board view stored `/fantasy/leaders` with an empty query — a bookmark to the default
view, which is not a saved view at all. The same gap meant a *shared* board link had
been silently dropping its filters since those boards shipped.

So M5 moves those filters into the URL (`useUrlState`), which is what spine C had
claimed all along. Defaults stay out of the query string, so a clean view still has a
clean address bar, and a param is validated against the board's own column list before
it is used — a `metric` carried over from another board falls back instead of being
sent to the API. The watchlist toggle is URL state for the same reason; the starred
player **ids** never go in the URL, since they are the user's data and are resolved
from the account on load.

Two guards, because a stored URL is a stored assumption:

- **The backend enforces a safety envelope; the frontend enforces the catalog.** The
  API rejects anything that is not a single-slash, same-origin app route under a known
  section, with no scheme and no `..` segment (a browser resolves `..` before the
  router sees it, so a traversal would walk straight out of the section check). It
  deliberately does *not* hold a copy of the 19-board registry: that list lives in
  `constants/boards.js`, and duplicating it in Python would be a fourth place to keep
  in sync. The save button, which already has the registry, rejects unknown boards.
- A saved view that opens with parameters a board no longer understands degrades to
  that board's defaults, which is what the boards already do with junk query params.

Saved views deliberately **capture the scoring/league in the query string** when it is
present. "My Buy-Low board in my dynasty scoring" is the useful unit; a saved view that
silently re-scores itself when you switch profiles would be a different feature.

---

## 5. Favorites

The simplest table in the milestone, and the one most likely to be why someone signs up.

```sql
favorites (
  user_id    UUID REFERENCES users(user_id) ON DELETE CASCADE,
  player_id  VARCHAR(50) REFERENCES players(player_id),
  created_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, player_id)
)
```

Three surfaces, all of which have to exist for the feature to be worth anything — a
star with nowhere to look at the starred things is a dead control:

1. **A star control** on the player profile and on every board row.
2. **A favorites-only filter** on every board, applied server-side as a
   `player_id IN (...)` filter so it composes with the existing position/season/week
   filters and with sort and pagination rather than filtering a page after the fact.
   On the **leaderboard** that filter goes into the SQL (`window_filters`). On the
   **Insight boards** it is applied *after* scoring instead, exactly like the
   `position` filter: those scores are percentiles within a position pool, and
   filtering the pool first would make "82nd percentile" mean *among the six players
   you starred*. Verified: a receiver's FOR and VORP are identical whether the board
   returns 420 players or 2.
3. **A "My Players" tile** on the Command Center — the favorites, in the active
   profile's scoring, with their current Insight signals.

Note this is the *watchlist* scope of M5, not a roster. Roster import is M6+ territory
and would need a league-provider integration; a manually-starred watchlist needs
nothing and answers most of the same questions.

---

## 6. API surface

All under `/api/v1/`, all requiring a verified token except where noted.

```
GET    /me                          ← profile + counts; 401 when signed out
DELETE /me                          ← delete account and all owned rows (cascade)

GET    /me/league-profiles          ← list, active first
POST   /me/league-profiles          ← create (validates both spec strings)
PATCH  /me/league-profiles/{id}     ← rename / edit specs / activate
DELETE /me/league-profiles/{id}

GET    /me/favorites                ← player ids + hydrated player summaries
PUT    /me/favorites/{player_id}    ← idempotent add
DELETE /me/favorites/{player_id}    ← idempotent remove

GET    /me/saved-views
POST   /me/saved-views              ← validates path against the board registry
PATCH  /me/saved-views/{id}         ← rename
DELETE /me/saved-views/{id}
```

`DELETE /me` exists in the first release rather than as a follow-up: collecting a Google
identity means owing the user a way to revoke it, and the cascade makes it a five-line
handler. Deferring it is how a project ends up with a support-email deletion process.

Every list endpoint is implicitly scoped to the token's `sub`. **No endpoint accepts a
`user_id` parameter** — the id comes from the verified token and nowhere else, so there
is no shape of request that can read another user's rows.

### The second API you didn't write (found during production rollout)

That guarantee covers *our* API. It does not, on its own, cover Supabase — which serves
the entire `public` schema through **PostgREST** at `/rest/v1/`, and whose default
privileges grant the `anon` and `authenticated` roles access to new tables there.

So a table created by a plain Alembic migration is, by default, readable **and
writable** by anyone holding the anon key — which is public by design and ships inside
our JavaScript bundle. `GET /rest/v1/users?select=*` would have returned every user's
email address, and profiles, favorites, and saved views would have been open to anyone.
Every authorization rule above would have been bypassed, not by defeating it, but by
going around it.

Migration `8f73b5b2b1a1` closes this: **row-level security enabled on all four account
tables with no policies**, plus an explicit `REVOKE` from both roles. Under RLS a role
with no matching policy sees nothing and writes nothing, while the table *owner*
bypasses RLS — and the backend connects as the owner, so the API is unaffected
(verified: all 36 checks pass unchanged with RLS on).

No policies are created, deliberately. Writing one would be the first step toward
letting the browser talk to the database directly, which is exactly the architecture §2
rejects.

**The general lesson:** "the backend owns the data" is a statement about code, and it
holds only as long as nothing else is also serving that database. On a
platform-as-a-database, check what the platform exposes by default before assuming your
API is the only door.

---

## 7. What M5 deliberately does not do

- **No gating.** Discussed above. Signed-out is a first-class state, not a funnel.
- **No personalized Command Center reordering.** The "My Players" tile ships; the
  dashboard does not rearrange itself around your league. That is a bigger design job
  than the rest of the milestone combined and is better done once favorites have
  actually been used.
- **No social sign-in.** Email only. Adding a provider later is a Supabase toggle, one
  `signInWithOAuth` call, and a button — `app/auth.py` never learns about it.
- **No sharing a profile with another user.** URLs already share a setup perfectly.
- **No league import.** M6+, needs a provider integration.
- **No server-side session.** The Supabase token is the session; the API is stateless.

## 8. Setup (one-time, outside the codebase)

Accounts stay dormant until these are configured, so the app is fully usable before any
of it is done. There is no third-party OAuth app to register.

1. **Supabase → Authentication → Providers → Email**: enable it. Leave *Confirm email*
   on (the default) unless you want sign-ups usable instantly — the dialog handles both,
   showing "check your inbox" only when a session was withheld.
2. **Supabase → Authentication → URL Configuration**: set the Site URL, and add
   redirect URLs as wildcards — `http://localhost:5173/**`, `https://<prod>.vercel.app/**`,
   and the preview pattern. The wildcard matters: emailed links return the user to *the
   page they started from*, not a fixed callback path, and an unlisted URL silently
   falls back to the Site URL.
3. **⚠️ Supabase → Project Settings → Auth → SMTP Settings**: configure a real sender
   (Resend, Postmark, SendGrid). **Do this before any real traffic.** Supabase's
   built-in mailer is rate-limited to a handful of messages per hour and its shared
   sender frequently lands in spam. Every path here depends on email delivery —
   confirmation, magic link, and password reset — so a throttled or spam-filed mailer
   is not a cosmetic problem, it is the feature not working.
4. **Render** (backend env): `SUPABASE_URL` — again the **project URL**, not an API
   endpoint under it. A `/rest/v1` suffix here points the JWKS lookup at a path that
   does not exist, and because `PyJWKClientError` is a `PyJWTError`, the failure is
   indistinguishable from a forged token: every signed-in request returns
   *"Invalid or expired token."* Check with `GET /api/v1/health/auth`, which reports
   the expected issuer, the JWKS URL, and whether it is actually reachable. Add
   `SUPABASE_JWT_SECRET` only if the project still signs HS256.
5. **Vercel** (frontend env): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. ⚠️ The
   first is the **project URL**, not one of the API endpoints displayed beside it.
   Setting `…/rest/v1` sends every auth call to PostgREST, which answers
   `PGRST125: Invalid path specified in request URL` — an error naming neither the
   cause nor the fix. `services/supabase.js` now strips such a suffix and warns in the
   console rather than shipping an unexplainable sign-up failure.
6. Run the migrations against Supabase (`alembic upgrade head` with `DATABASE_URL`
   pointed at it), as M4 did for `player_target_depth`. This must include
   **`8f73b5b2b1a1`**, which locks the account tables away from PostgREST — without it
   they are world-readable through Supabase's own REST API (see §6).

Optionally raise the password floor in **Authentication → Policies**; the UI already
enforces 8 characters, above Supabase's default of 6.

## 9. Verification

Backend, against local Postgres with the real router and ORM (`get_current_user`
overridden so endpoints could be driven without Google): **36 checks**, all passing —
CRUD on all three resources, the one-active-profile invariant, successor promotion on
deleting the active profile, idempotent favorites, duplicate-name 409s, invalid-spec
422s, off-site and traversal path rejection, cascade on account deletion, and
**cross-user isolation** (user B gets 404 — never another user's rows — on every
read, patch, and delete of user A's data).

Token verification, against a running server with a test-signed JWT: a valid token
resolves and provisions the user; a **tampered signature**, a token signed with the
**wrong secret**, an **expired** token, a **wrong-issuer** token, and an
**`alg=none`** token all return 401.

Frontend, driven in a browser against a seeded session: sign-in state, profile
creation and activation, the star toggle persisting across reload, the watchlist
filter (2 rows and a *total* of 2 — proving the filter is server-side, not a trimmed
page), saving and reopening a view with its filters intact, deletion from the account
menu, the Command Center watchlist tile, and sign-out clearing both the session and
every account surface. Signed-out and Supabase-unconfigured builds render exactly as
the pre-M5 app.

**Email auth**, driven in a browser against a local stand-in for Supabase's auth
endpoints that mints JWTs with the same secret and issuer the backend expects — so the
whole loop was real from the app's side, with only email sending and the password check
faked:

| Flow | Result |
|---|---|
| Sign up (name + email + password) | confirmation "sent"; dialog shows *Check your email* |
| Sign in with password | session issued → token → **backend verified it** and provisioned `pat@example.com` as *Pat Rivera* |
| Magic link request | link "sent"; terminal state renders |
| Password reset request | reset "sent" |
| Arrive on a reset link | signs in, fires `PASSWORD_RECOVERY`, shows *Set a new password*; saving it reaches the server, clears the URL hash, and leaves the user signed in |
| Sign out | session cleared, every account surface gone |

Also checked: the 8-character floor disables submit and shows a warning; a network
failure surfaces a readable message rather than "Failed to fetch"; `autocomplete` is
`current-password` on sign-in and `new-password` on sign-up/recovery (so password
managers behave); email persists across mode switches while the password field clears;
and the dialog renders correctly in both themes.

Email accounts with no name resolve `display_name` to the email's local part
(`bare@example.com` → `bare`), verified directly against the API for the bare-metadata,
named, and magic-link token shapes.

## 10. Known limits

- **Everything depends on email delivery.** Confirmation, magic link, and password reset
  all fail the same way if mail is throttled or filtered — see setup step 3. The
  password path is the partial hedge: once an account exists and is confirmed, signing
  in again needs no email at all, which is exactly why both methods ship rather than
  magic link alone.
- **Magic links use the implicit flow** (supabase-js's default), so the session arrives
  in the URL fragment. That is what makes a link work when opened on a *different*
  device from the one that requested it — a real scenario, since people read mail on
  their phones. The cost is a short-lived access token in the URL hash, which the client
  consumes and clears immediately. Switching to PKCE would tighten that at the price of
  breaking cross-device links; worth revisiting only if the threat model changes.
- **A saved view is a URL, so it inherits URL semantics** — including that a board which
  renames a query param orphans the old value. Accepted; the degradation is to defaults,
  not to an error.
- **Profiles store spec strings, so an invalid spec is representable in the type system**
  and prevented by validation instead. A grammar change that removes a token would need
  a data migration over stored specs.
- **A rejected token does not say why, by design — so diagnose with `/health/auth`.**
  Bad signature, unreachable JWKS, and wrong issuer all produce one 401. That is right
  for a client (distinguishing them helps an attacker more than a user) and unhelpful
  for an operator, which is why the health endpoint exists. Worth remembering when
  *testing*, too: a forged-token probe returning "Invalid or expired token" proves the
  request was rejected, **not** that the verification path is correctly configured.
- **JIT provisioning trusts the token's claims for email/name.** They come from a
  Supabase-signed token so they are not user-editable in transit, but they are a mirror
  and can go stale if the user changes their Google profile; refreshed on every request
  is cheap enough that they will not.
- **The watchlist filter passes player ids in the query string.** At the 300-favorite
  cap that is roughly 3.6 kB of URL — within every practical limit, but it is the
  reason the cap exists. If watchlists ever need to be larger, the filter should become
  a server-side join against `favorites` keyed on the token instead.
- **No automated test suite exists in this repo**, so the auth boundary is covered by
  scripted verification rather than committed tests. Given that this is the first code
  in the project where a bug means one user reading another's data, a real test suite
  starting here is the obvious next investment.
