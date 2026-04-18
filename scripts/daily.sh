#!/bin/bash
# ════════════════════════════════════════════════════════════════════
# AI Shorts Daily Cron — runs generate + publish once per day
# Add to crontab with: crontab -e
#   0 8 * * * /home/USER/ai-shorts-system/scripts/daily.sh
# ════════════════════════════════════════════════════════════════════

set -e

# Path to project (CHANGE THIS)
PROJECT_DIR="$HOME/ai-shorts-system"
cd "$PROJECT_DIR"

# Load nvm if installed
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Timestamp for log
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
LOG_FILE="$PROJECT_DIR/logs/cron-$TIMESTAMP.log"

echo "════════════════════════════════════════" >> "$LOG_FILE"
echo "Started: $TIMESTAMP" >> "$LOG_FILE"

# Generate video
echo "→ Generating video..." >> "$LOG_FILE"
npm run generate >> "$LOG_FILE" 2>&1

# Wait 30 seconds for filesystem sync
sleep 30

# Publish to all platforms
echo "→ Publishing to all platforms..." >> "$LOG_FILE"
npm run publish >> "$LOG_FILE" 2>&1

echo "Finished: $(date +"%Y-%m-%d_%H-%M-%S")" >> "$LOG_FILE"
echo "════════════════════════════════════════" >> "$LOG_FILE"
