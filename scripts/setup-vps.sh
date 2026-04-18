#!/bin/bash
# ════════════════════════════════════════════════════════════════════
# AI Shorts System — Hetzner VPS Setup Script
# Run on fresh Ubuntu 22.04 / 24.04 server:
#   curl -fsSL <raw-url-to-this> | bash
# Or: bash setup-vps.sh
# ════════════════════════════════════════════════════════════════════

set -e

echo "════════════════════════════════════════════════"
echo "  AI Shorts System — VPS Setup"
echo "════════════════════════════════════════════════"

# Update system
echo "→ Updating system packages..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq

# Install essentials
echo "→ Installing essentials (git, curl, build tools)..."
sudo apt-get install -y -qq git curl build-essential ca-certificates

# Install FFmpeg (latest with all codecs)
echo "→ Installing FFmpeg..."
sudo apt-get install -y -qq ffmpeg
ffmpeg -version | head -1

# Install Node.js 20 LTS via nvm
echo "→ Installing Node.js 20 LTS..."
if [ ! -d "$HOME/.nvm" ]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 20
nvm use 20
nvm alias default 20

# Verify
echo "→ Node version: $(node -v)"
echo "→ npm version: $(npm -v)"

# Install project dependencies (assumes you already cloned the repo)
if [ -f "package.json" ]; then
  echo "→ Installing project dependencies..."
  npm install
else
  echo "⚠ No package.json found in current dir."
  echo "  After cloning your repo: cd ai-shorts-system && npm install"
fi

# Create dirs
mkdir -p output temp logs config

# Setup .env if missing
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp .env.example .env
  echo "✓ Created .env from .env.example"
  echo "⚠ EDIT .env with your API keys: nano .env"
fi

echo ""
echo "════════════════════════════════════════════════"
echo "  ✓ Setup complete!"
echo "════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Edit your API keys:        nano .env"
echo "  2. Test generation:           npm run generate"
echo "  3. Test publishing:           npm run publish"
echo "  4. Setup daily cron:          crontab -e"
echo "     Add line: 0 8 * * * $HOME/ai-shorts-system/scripts/daily.sh"
echo ""
