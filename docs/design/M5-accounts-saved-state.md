# M5 Design — Accounts & Saved State

> Status: in progress. Milestone: [`docs/ROADMAP.md`](../ROADMAP.md) → M5.
> Depends on M1 (scoring config), M3 (league config), M4 (state worth saving).

Last updated: 2026-08-04

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

Google OAuth is the only sign-in method. No passwords, no reset flow, no email
deliverability problem, one tap.

The split of responsibility:

| Concern | Owner |
|---|---|
| OAuth dance, session, refresh tokens | Supabase Auth (via `@supabase/supabase-js` in the browser) |
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

A board, a scatter, and a comparison are already *completely* described by their URL —
that was the entire point of spine C. So a saved view stores exactly that:

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

Two guards, because a stored URL is a stored assumption:

- `path` is validated against the board/Explore registry on write. An unknown path is
  rejected, so a saved view can never become an open redirect or point somewhere that
  does not exist.
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

---

## 7. What M5 deliberately does not do

- **No gating.** Discussed above. Signed-out is a first-class state, not a funnel.
- **No personalized Command Center reordering.** The "My Players" tile ships; the
  dashboard does not rearrange itself around your league. That is a bigger design job
  than the rest of the milestone combined and is better done once favorites have
  actually been used.
- **No email/password or magic link.** Google only until there is evidence someone
  bounced for want of an alternative.
- **No sharing a profile with another user.** URLs already share a setup perfectly.
- **No league import.** M6+, needs a provider integration.
- **No server-side session.** The Supabase token is the session; the API is stateless.

## 8. Known limits

- **Google-only sign-in excludes anyone without a Google account** and couples signup to
  one provider's availability. Mitigated by the fact that nothing is gated: a user who
  cannot or will not sign in loses persistence, not the product.
- **A saved view is a URL, so it inherits URL semantics** — including that a board which
  renames a query param orphans the old value. Accepted; the degradation is to defaults,
  not to an error.
- **Profiles store spec strings, so an invalid spec is representable in the type system**
  and prevented by validation instead. A grammar change that removes a token would need
  a data migration over stored specs.
- **JIT provisioning trusts the token's claims for email/name.** They come from a
  Supabase-signed token so they are not user-editable in transit, but they are a mirror
  and can go stale if the user changes their Google profile; refreshed on every request
  is cheap enough that they will not.
