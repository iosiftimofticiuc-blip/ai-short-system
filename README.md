# AI Shorts System — Psychology & Science Facts

Sistem 100% automat de generare și publicare video shorts pe TikTok, YouTube Shorts, Instagram Reels și Facebook Reels. Un singur cron pe zi → 1 video → 4 platforme.

**Stack:** Claude API + OpenAI (GPT-4o + DALL-E 3 + TTS + Whisper) + FFmpeg

**Cost lunar:** ~$4 (doar VPS Hetzner) + costuri API (estimat $0.50-1 per video)

---

## 📋 Ce Face Sistemul

```
8:00 AM zilnic (cron)
    ↓
Claude alege topic viral + scrie script + image prompts + caption-uri
    ↓
DALL-E 3 generează 5 imagini cinematice 9:16
    ↓
OpenAI TTS generează voiceover natural
    ↓
Whisper transcrie pentru subtitrări sincronizate
    ↓
FFmpeg asamblează totul: imagini cu Ken Burns zoom + voce + subtitrări
    ↓
Publishing automat pe TikTok + YouTube + Instagram + Facebook
```

---

## 🚀 Setup Pas cu Pas

### PASUL 1 — Cumpără VPS Hetzner (~3-5 min)

1. Mergi pe [hetzner.com/cloud](https://www.hetzner.com/cloud)
2. Creează cont (verificare prin SMS)
3. Click "Add Server":
   - **Location:** Nuremberg, Germany (cel mai aproape)
   - **Image:** Ubuntu 24.04
   - **Type:** CX22 (€3.79/lună, 2 vCPU, 4GB RAM — perfect pentru FFmpeg)
   - **SSH Key:** Generează pe local cu `ssh-keygen -t ed25519` și adaugă cheia publică
   - **Name:** `ai-shorts`
4. Click "Create & Buy now"
5. Notează IP-ul serverului

### PASUL 2 — Conectează-te și Instalează

Pe local terminal:
```bash
ssh root@<IP-ul-tau>
```

Pe server:
```bash
# Creează user normal (best practice)
adduser shorts
usermod -aG sudo shorts
su - shorts

# Clonează acest proiect (vezi PASUL 3)
git clone <url-repo-tau> ai-shorts-system
cd ai-shorts-system

# Rulează setup-ul (instalează Node, npm, FFmpeg)
chmod +x scripts/setup-vps.sh
./scripts/setup-vps.sh
```

### PASUL 3 — Pune Codul pe GitHub

Pe local:
```bash
cd ai-shorts-system
git init
git add .
git commit -m "initial setup"
gh repo create ai-shorts-system --private --source=. --push
```

(Sau prin web: github.com → New Repository → Private → push manual)

### PASUL 4 — Configurează API Keys

Pe server:
```bash
nano .env
```

Completează:
```env
CLAUDE_API_KEY=sk-ant-api03-...     # din console.anthropic.com
OPENAI_API_KEY=sk-proj-...           # din platform.openai.com/api-keys
```

**Test imediat:**
```bash
npm run test-claude   # verifică Claude
npm run test-openai   # verifică OpenAI (costă ~$0.10)
npm run test-ffmpeg   # verifică FFmpeg
```

### PASUL 5 — Test Generation (fără publishing)

```bash
npm run generate
```

După ~3-5 minute vei avea în `output/` un fișier `.mp4` cu primul video. Descarcă-l pe local:
```bash
# Pe local:
scp shorts@<IP>:~/ai-shorts-system/output/*.mp4 ~/Desktop/
```

Vezi rezultatul. Dacă e ok, treci la setup OAuth pentru publishing.

---

## 🔑 Setup OAuth pentru Fiecare Platformă

### TikTok

1. Mergi pe [developers.tiktok.com](https://developers.tiktok.com)
2. Login cu contul TikTok pe care vrei să postezi
3. "Manage apps" → "Create an app"
4. Add product: **"Content Posting API"** și **"Login Kit"**
5. Sub Login Kit, adaugă scope: `video.upload`, `video.publish`, `user.info.basic`
6. Notează **Client Key** și **Client Secret**
7. Pentru Access Token: necesită OAuth flow — vezi `docs/tiktok-auth.md` (sau folosește Postman cu OAuth 2.0)
8. Adaugă în `.env`:
```env
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
TIKTOK_ACCESS_TOKEN=...
TIKTOK_REFRESH_TOKEN=...
```

### YouTube

1. [console.cloud.google.com](https://console.cloud.google.com) → Create Project "AI Shorts"
2. APIs & Services → Library → caută **"YouTube Data API v3"** → Enable
3. Credentials → Create OAuth Client ID:
   - Application type: **Desktop app**
   - Notează **Client ID** și **Client Secret**
4. Pentru Refresh Token, rulează:
```bash
# Vom face un script auth — momentan folosește OAuth Playground:
# https://developers.google.com/oauthplayground
# Selectează scope: https://www.googleapis.com/auth/youtube.upload
# Settings → "Use your own OAuth credentials" → pune Client ID/Secret
# Authorize → Exchange authorization code for tokens
# Copiază refresh_token
```
5. Adaugă în `.env`:
```env
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REFRESH_TOKEN=...
```

### Instagram + Facebook (același API Meta)

1. Trebuie să ai un cont **Instagram Business** (nu personal) conectat la o **Facebook Page**
2. [developers.facebook.com](https://developers.facebook.com) → My Apps → Create App
   - Type: **"Business"**
3. Add Products: **"Instagram Graph API"** și **"Facebook Login"**
4. Generează un **Long-lived User Access Token** (60 zile, apoi refresh):
   - App Dashboard → Tools → Graph API Explorer
   - Generate token cu permissions: `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`
5. Schimbă pentru **Page Access Token** (long-lived, nu expiră dacă pagina e activă):
```bash
curl "https://graph.facebook.com/v21.0/me/accounts?access_token=USER_TOKEN"
# → primești Page Access Token
```
6. Găsește IDs:
```bash
# Page ID:
curl "https://graph.facebook.com/v21.0/me/accounts?access_token=PAGE_TOKEN"

# Instagram Business ID:
curl "https://graph.facebook.com/v21.0/PAGE_ID?fields=instagram_business_account&access_token=PAGE_TOKEN"
```
7. Adaugă în `.env`:
```env
META_APP_ID=...
META_APP_SECRET=...
META_ACCESS_TOKEN=<page-access-token>
INSTAGRAM_BUSINESS_ID=...
FACEBOOK_PAGE_ID=...
```

**Notă pentru Instagram:** Necesită URL public pentru video. Soluție gratuită — Cloudflare R2 (10GB free):
```env
PUBLIC_VIDEO_URL_BASE=https://your-r2-bucket.r2.dev
```
Sau servește din VPS cu Nginx + domeniu (mai complex, dar gratuit complet).

---

## ⏰ Activează Cron Job-ul Zilnic

Pe server:
```bash
chmod +x scripts/daily.sh

crontab -e
```

Adaugă linia (rulează la 8:00 AM zilnic):
```
0 8 * * * /home/shorts/ai-shorts-system/scripts/daily.sh
```

Pentru 2 videouri/zi (8:00 AM și 6:00 PM):
```
0 8,18 * * * /home/shorts/ai-shorts-system/scripts/daily.sh
```

Verifică că e activ:
```bash
crontab -l
```

Loguri:
```bash
tail -f logs/cron-*.log
tail -f logs/generator-*.log
tail -f logs/publisher-*.log
```

---

## 💰 Estimare Costuri Lunare

| Item | Cost |
|---|---|
| VPS Hetzner CX22 | €3.79 |
| Claude API (~30 cereri/lună) | ~$2-3 |
| GPT-4o (script extra dacă folosești) | ~$1 |
| DALL-E 3 HD (5 imagini × 30 zile × $0.08) | ~$12 |
| OpenAI TTS HD (~150 chars × 30 × $0.030/1k) | ~$1 |
| Whisper (transcribe ~1 min × 30 × $0.006) | ~$0.20 |
| Cloudflare R2 (storage video) | $0 (free tier) |
| **TOTAL** | **~$20/lună pentru 30 video shorts** |

**Per video: ~$0.65** — versus $5-10 dacă plăteai Creatomate + Blotato.

---

## 📊 Monitorizare & Optimizare

După 2 săptămâni de rulare:
1. Verifică în `config/history.json` care topic-uri au fost folosite
2. Analizează în TikTok Analytics / YouTube Studio care videouri performează
3. Modifică prompt-ul din `generate.js` (funcția `generateContentPackage`) ca să direcționeze Claude spre stilul câștigător
4. Crește la 2-3 videouri/zi când ai sistem stabil

---

## 🛡️ Probleme Frecvente

**FFmpeg crashes / out of memory:**
- Upgrade la Hetzner CX32 (€6.49/lună, 8GB RAM)

**TikTok upload fails:**
- Verifică Access Token nu a expirat (24h validity, refresh cu Refresh Token)
- Adaugă logică de refresh în `publish.js`

**Instagram API "Application does not have capability":**
- Trebuie App Review de la Meta pentru `instagram_content_publish` în prod
- Pentru testing: poți folosi în Development Mode cu cont propriu (limitat la admins)

**Claude API rate limit:**
- Verifică tier-ul în console.anthropic.com
- Adaugă `await new Promise(r => setTimeout(r, 1000))` între cereri

---

## 🎯 Următorii Pași După Setup

1. **Săptămâna 1:** rulezi manual `npm run generate`, verifici 5-10 videouri, ajustezi prompt-ul
2. **Săptămâna 2:** activezi cron, lași sistemul autonom, monitorizezi
3. **Luna 2:** adaugi link affiliate în bio (Amazon, ClickBank), primii bani
4. **Luna 3+:** când ai 1K-10K followeri, sponsorizări direct + TikTok Creativity Program

**Pentru întrebări specifice de implementare, întreabă în chat. Codul e gata — doar setup-ul mai rămâne.**
