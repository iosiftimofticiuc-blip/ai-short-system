#!/bin/bash
# ════════════════════════════════════════════════════════════════════
# AI Shorts Daily Cron — runs generate + publish once per day
# Add to crontab with: crontab -e
#   0 8 * * * /root/ai-short-system/scripts/daily.sh
#
# The script resolves its own absolute path so it works regardless of
# the working directory cron launches it from.
# ════════════════════════════════════════════════════════════════════

set -e

# Resolve the project root from this script's own location.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# Load nvm so cron sees `node` / `npm`. Cron has a minimal PATH, so this
# step is required even though `npm` works fine in an interactive shell.
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
# If nvm installed a default, use it
[ -s "$NVM_DIR/nvm.sh" ] && nvm use default >/dev/null 2>&1 || true

# Timestamped log so each run is its own file (easy to tail / rotate)
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
LOG_FILE="$PROJECT_DIR/logs/cron-$TIMESTAMP.log"
mkdir -p "$PROJECT_DIR/logs"

{
  echo "════════════════════════════════════════"
  echo "Started: $TIMESTAMP"
  echo "PATH: $PATH"
  echo "node: $(command -v node)  -> $(node -v 2>/dev/null || echo MISSING)"
  echo "ffmpeg: $(command -v ffmpeg)  -> $(ffmpeg -version 2>/dev/null | head -1 || echo MISSING)"
  echo "════════════════════════════════════════"

  echo "→ Generating video..."
  npm run generate

  echo "→ Publishing to all platforms..."
  npm run publish

  echo "Finished: $(date +"%Y-%m-%d_%H-%M-%S")"
  echo "════════════════════════════════════════"
} >> "$LOG_FILE" 2>&1
