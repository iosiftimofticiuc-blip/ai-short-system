#!/bin/bash
# ════════════════════════════════════════════════════════════════════
# Download a YouTube video into background/ for use as gameplay loop.
# Also installs one-off dependencies needed by the new pipeline:
#   - yt-dlp (for downloading)
#   - ttf-mscorefonts-installer (for Impact subtitle font)
#
# Usage:
#   bash scripts/download-background.sh <youtube-url> [name]
# Example:
#   bash scripts/download-background.sh https://youtu.be/XXXX minecraft
# ════════════════════════════════════════════════════════════════════

set -e

URL="$1"
NAME="${2:-background}"

if [ -z "$URL" ]; then
  echo "Usage: $0 <youtube-url> [name]"
  echo ""
  echo "Tip: find a 'Minecraft parkour no copyright' or 'Subway Surfers"
  echo "     no commentary' compilation on YouTube that's at least 10 min"
  echo "     long. The pipeline will pick a random ~62s segment per video."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BG_DIR="$SCRIPT_DIR/../background"
mkdir -p "$BG_DIR"

# Install yt-dlp if missing
if ! command -v yt-dlp &>/dev/null; then
  echo "→ Installing yt-dlp..."
  sudo apt-get update -qq
  # Prefer pip install so we get the latest version; --break-system-packages
  # is required on Ubuntu 24.04's PEP 668 managed Python.
  sudo apt-get install -y -qq python3-pip
  sudo pip3 install --break-system-packages --quiet yt-dlp
fi

# Install Microsoft core fonts (provides Impact, used by viral subtitles).
# The EULA prompt is auto-accepted via debconf.
if ! fc-list | grep -qi "impact"; then
  echo "→ Installing Microsoft core fonts (Impact)..."
  echo "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true" | sudo debconf-set-selections
  sudo apt-get install -y -qq ttf-mscorefonts-installer
  sudo fc-cache -f
fi

echo "→ Downloading background video from $URL ..."
cd "$BG_DIR"
# Best video up to 1080p, merged with best audio, output as .mp4
yt-dlp -f "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/best[height<=1080]" \
       --merge-output-format mp4 \
       -o "${NAME}.mp4" \
       --no-warnings \
       "$URL"

echo ""
echo "✓ Done. Background folder now contains:"
ls -lh "$BG_DIR/"
echo ""
echo "You can call this script multiple times with different URLs to build"
echo "a pool — the generator picks one at random for each video."
