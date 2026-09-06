#!/usr/bin/env bash
#
# Apply database migrations, retrying a pooler checkout timeout.
#
# Run from Render's build command. The naive `alembic upgrade head` failed there once
# (5d111be) and it was NOT a connectivity problem — the build reached Supabase fine and
# then could not get a connection out of it:
#
#   FATAL: (ECHECKOUTTIMEOUT) unable to check out connection from the pool
#          after 15000ms in Session mode
#
# A build runs while the previous version is still serving, so the app's own pool is
# holding connections at exactly the moment the migration wants one. Supabase's free
# session-mode pooler is small enough that this can tip it over. The app's pool is now
# bounded (see app/database.py), which is the real fix; this retry covers the rest,
# because the contention is transient by nature — a scheduled pipeline run or a burst
# of traffic can produce it just as easily.
#
# Exits non-zero if every attempt fails, so a genuinely broken migration still aborts
# the deploy and leaves the previous version serving.
set -euo pipefail

ATTEMPTS=${MIGRATE_ATTEMPTS:-5}
DELAY=${MIGRATE_RETRY_DELAY:-15}

# Render's Python runtime provides `python`; a developer shell often only has
# `python3`, and a venv provides its own. Resolve rather than assume, so running this
# by hand behaves the same as running it in a deploy.
PYTHON=${PYTHON:-$(command -v python || command -v python3)}
if [ -z "$PYTHON" ]; then
  echo "✗ no python interpreter on PATH" >&2
  exit 1
fi
echo "using $PYTHON"

for attempt in $(seq 1 "$ATTEMPTS"); do
  echo "→ migration attempt ${attempt}/${ATTEMPTS}"
  if "$PYTHON" -m alembic upgrade head; then
    echo "✓ database is at head"
    exit 0
  fi
  if [ "$attempt" -lt "$ATTEMPTS" ]; then
    echo "… attempt ${attempt} failed; retrying in ${DELAY}s"
    sleep "$DELAY"
  fi
done

echo "✗ migrations failed after ${ATTEMPTS} attempts — aborting the deploy" >&2
exit 1
