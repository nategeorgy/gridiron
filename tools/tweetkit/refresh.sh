#!/bin/sh
# Rebuild the tweet kit for the newest fully played week (or pass --week N).
# Needs the local backend on :8000 with that week loaded. Ends with index.html built and
# checked; publishing it to the review page is the one step left (see README).
set -e
cd "$(dirname "$0")"
if ! curl -sf http://localhost:8000/api/v1/health >/dev/null; then
  echo "The backend is not running on localhost:8000. Start it from backend/ with:"
  echo "  .venv/bin/uvicorn app.main:app --port 8000"
  exit 1
fi
python3 pull.py "$@"
python3 build_data.py
python3 fetch_img.py
python3 build.py
node check.mjs
echo
echo "Built tools/tweetkit/index.html. To update the review page, ask Claude:"
echo "  publish tools/tweetkit/index.html to https://claude.ai/artifact/4L9cX5h9qxcWZnysXjVTG4"
