/**
 * AI SHORTS GENERATOR — Psychology & Science Facts
 * ════════════════════════════════════════════════════════════════════
 *
 * Pipeline:
 *   1. Claude     → Viral topic + ~170-word script + platform captions
 *   2. OpenAI TTS → Natural voiceover (voice "onyx", 1.05x pace)
 *   3. Whisper    → Word-level timestamps → tight karaoke-style SRT
 *   4. FFmpeg     → Random segment from background/*.mp4 (gameplay loop),
 *                   center-cropped to 1080x1920, muted, voice + subtitles
 *                   burned on top
 *   5. Output     → MP4 ready for publishing on 4 platforms
 *
 * Usage:
 *   node src/generate.js                   # fresh run
 *   node src/generate.js --resume          # reuse latest aborted session
 *   node src/generate.js --resume=<id>     # reuse specific session
 */

require("dotenv").config();
const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const crypto = require("crypto");

// ─── CONFIG ────────────────────────────────────────────────────────────
const CONFIG = {
  outputDir: path.resolve(__dirname, "../output"),
  tempDir: path.resolve(__dirname, "../temp"),
  logsDir: path.resolve(__dirname, "../logs"),
  backgroundDir: path.resolve(__dirname, "../background"),
  historyFile: path.resolve(__dirname, "../config/history.json"),

  niche: process.env.NICHE || "Psychology and Science Facts",
  voice: process.env.VOICE || "onyx",

  video: {
    width: 1080,
    height: 1920,
    fps: 30,
  },

  // Target ~62s voiceover: long enough for TikTok Creativity Program
  // (>60s), short enough for all Shorts/Reels platforms.
  scriptWordTarget: 170,

  models: {
    claude: "claude-opus-4-7",
    tts: "tts-1-hd",
  },
};

// ─── CLIENTS ───────────────────────────────────────────────────────────
const claude = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── UTILITIES ─────────────────────────────────────────────────────────
const log = (msg, level = "INFO") => {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${msg}`;
  console.log(line);
  fs.appendFileSync(
    path.join(CONFIG.logsDir, `generator-${new Date().toISOString().split("T")[0]}.log`),
    line + "\n"
  );
};

const ensureDirs = () => {
  [CONFIG.outputDir, CONFIG.tempDir, CONFIG.logsDir, path.dirname(CONFIG.historyFile)]
    .forEach(d => !fs.existsSync(d) && fs.mkdirSync(d, { recursive: true }));
};

const loadHistory = () => {
  if (!fs.existsSync(CONFIG.historyFile)) return { topics: [], videos: [] };
  return JSON.parse(fs.readFileSync(CONFIG.historyFile, "utf8"));
};

const saveHistory = (h) => fs.writeFileSync(CONFIG.historyFile, JSON.stringify(h, null, 2));

const ffmpeg = (cmd) => {
  log(`FFmpeg: ${cmd.substring(0, 120)}...`, "DEBUG");
  try {
    execSync(`ffmpeg -y -loglevel error ${cmd}`, { stdio: "pipe" });
  } catch (err) {
    log(`FFmpeg ERROR: ${err.message}`, "ERROR");
    throw err;
  }
};

const ffprobeDuration = (filePath) => parseFloat(
  execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`)
    .toString().trim()
);

// ─── STEP 1: CLAUDE GENERATES CONTENT PACKAGE ──────────────────────────
async function generateContentPackage(usedTopics) {
  log("Step 1/4: Claude generates content package...");

  const prompt = `You are a viral short-form content expert specializing in ${CONFIG.niche} for TikTok, YouTube Shorts, Instagram Reels, Facebook Reels.

TASK: Create a complete viral video package. The video will use GAMEPLAY FOOTAGE (Minecraft parkour / Subway Surfers style) as the visual — your job is the spoken script and platform metadata. No image prompts needed.

CONSTRAINTS:
- Niche: ${CONFIG.niche}
- Audience: Global English speakers, 18-45
- Hook: First 3 seconds MUST stop scrolling (curiosity gap, shocking stat, controversial claim, bold question)
- Script: ${CONFIG.scriptWordTarget} words (+/- 10). At TTS 1.05x pace this runs ~62 seconds, which qualifies the video for TikTok Creativity Program (>60s requirement).
- Tone: Authoritative but conversational. Like a smart friend revealing a secret.
- Structure: HOOK → shock/claim → 2-3 concrete examples or mini-story → payoff/insight → CTA
- End: Soft CTA disguised as teaser ("follow for more X" or "comment your answer")
- AVOID these used topics: ${usedTopics.slice(-30).join(" | ") || "none yet"}

OUTPUT (strict JSON, no markdown, no commentary):
{
  "topic": "Short specific title",
  "hook": "First sentence that stops scrolling",
  "script": "Full ${CONFIG.scriptWordTarget}-word script with hook included. Natural spoken English. No stage directions. No asterisks. No emojis.",
  "platforms": {
    "tiktok": {
      "caption": "Caption with line breaks (max 150 chars before hashtags)",
      "hashtags": ["#fyp", "#psychology", "#mindblown", "8-12 total hashtags mixing popular and niche"]
    },
    "youtube": {
      "title": "SEO title with hook - max 60 chars",
      "description": "First 2 lines = hook. Then 1-2 lines context. End with #Shorts and 3-5 relevant hashtags.",
      "tags": ["10-15 SEO tags, lowercase, comma-friendly"]
    },
    "instagram": {
      "caption": "Caption optimized for IG Reels, under 150 chars before hashtags",
      "hashtags": ["#reels", "#psychology", "20-30 total, mix popular and niche"]
    },
    "facebook": {
      "caption": "Slightly longer than other platforms, conversational tone, ends with a question to drive comments"
    }
  }
}

CRITICAL: Return ONLY valid JSON. No \`\`\`json wrapper. No commentary.`;

  const response = await claude.messages.create({
    model: CONFIG.models.claude,
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });

  let text = response.content[0].text.trim()
    .replace(/^```(?:json)?\n?/i, "")
    .replace(/\n?```$/, "");

  const pkg = JSON.parse(text);
  log(`  Topic: "${pkg.topic}"`);
  log(`  Script: ${pkg.script.split(/\s+/).length} words`);
  return pkg;
}

// ─── STEP 2: OPENAI TTS GENERATES VOICEOVER ────────────────────────────
async function generateVoiceover(script, sessionId) {
  log("Step 2/4: OpenAI TTS generating voiceover...");

  const response = await openai.audio.speech.create({
    model: CONFIG.models.tts,
    voice: CONFIG.voice,
    input: script,
    speed: 1.05,
  });

  const audioPath = path.join(CONFIG.tempDir, `${sessionId}_voice.mp3`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(audioPath, buffer);

  const duration = ffprobeDuration(audioPath);
  log(`  Voice duration: ${duration.toFixed(2)}s`);
  return { audioPath, duration };
}

// ─── STEP 3: GENERATE WORD-LEVEL SUBTITLES (SRT) ───────────────────────
// Whisper constraint: `timestamp_granularities: ["word"]` REQUIRES
// `response_format: "verbose_json"`. We then build SRT ourselves with
// 2 words per cue for viral-style karaoke pacing (guaranteed one line,
// max punch).
const WORDS_PER_CUE = 2;

function formatSrtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function buildSrtFromWords(words, wordsPerCue = WORDS_PER_CUE) {
  if (!Array.isArray(words) || words.length === 0) {
    throw new Error("Whisper returned no word-level timestamps");
  }
  // First pass: build raw cues.
  const raw = [];
  for (let i = 0; i < words.length; i += wordsPerCue) {
    const chunk = words.slice(i, i + wordsPerCue);
    raw.push({
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
      text: chunk.map(w => w.word.trim()).join(" ").toUpperCase(),
    });
  }
  // Second pass: extend each cue's end to the next cue's start so no
  // frame is left without a caption (eliminates flicker between words).
  // Cap the stretch at 1s per cue to avoid a long tail hanging after the
  // last word if there's silence at the end.
  const MAX_STRETCH = 1.0;
  const cues = raw.map((cue, idx) => {
    const nextStart = raw[idx + 1]?.start ?? (cue.end + MAX_STRETCH);
    const stretchedEnd = Math.min(nextStart, cue.end + MAX_STRETCH);
    return `${idx + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(stretchedEnd)}\n${cue.text}\n`;
  });
  return cues.join("\n");
}

async function generateSubtitles(audioPath, sessionId) {
  log("Step 3/4: Whisper generating word-level SRT...");

  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["word"],
  });

  const srt = buildSrtFromWords(transcription.words);
  const srtPath = path.join(CONFIG.tempDir, `${sessionId}_subs.srt`);
  fs.writeFileSync(srtPath, srt);
  log(`  ${transcription.words.length} words -> ${Math.ceil(transcription.words.length / WORDS_PER_CUE)} cues`);
  return srtPath;
}

// ─── STEP 4: ASSEMBLE VIDEO (BACKGROUND + VOICE + SUBTITLES) ───────────
function pickRandomBackground() {
  if (!fs.existsSync(CONFIG.backgroundDir)) {
    throw new Error(
      `Background directory missing: ${CONFIG.backgroundDir}\n` +
      `Run: bash scripts/download-background.sh <youtube-url> <name>`
    );
  }
  const candidates = fs.readdirSync(CONFIG.backgroundDir)
    .filter(f => /\.(mp4|mov|mkv|webm)$/i.test(f))
    .map(f => path.join(CONFIG.backgroundDir, f));
  if (candidates.length === 0) {
    throw new Error(
      `No background videos in ${CONFIG.backgroundDir}\n` +
      `Run: bash scripts/download-background.sh <youtube-url> <name>`
    );
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function prepareBackgroundSegment(audioDuration, sessionId) {
  const bgPath = pickRandomBackground();
  const bgDuration = ffprobeDuration(bgPath);

  if (bgDuration < audioDuration + 1) {
    throw new Error(
      `Background ${path.basename(bgPath)} too short (${bgDuration.toFixed(1)}s) ` +
      `for ${audioDuration.toFixed(1)}s voiceover. Use a clip of at least ` +
      `${Math.ceil(audioDuration + 5)}s.`
    );
  }

  // Pick random start so every video has different visuals.
  const maxStart = Math.max(0, bgDuration - audioDuration - 0.5);
  const start = Math.random() * maxStart;

  const segPath = path.join(CONFIG.tempDir, `${sessionId}_bg.mp4`);
  // scale+crop covers the frame (any input AR works), strip audio.
  ffmpeg(
    `-ss ${start.toFixed(2)} -i "${bgPath}" -t ${audioDuration.toFixed(2)} ` +
    `-vf "scale=${CONFIG.video.width}:${CONFIG.video.height}:force_original_aspect_ratio=increase,crop=${CONFIG.video.width}:${CONFIG.video.height},fps=${CONFIG.video.fps}" ` +
    `-an -c:v libx264 -pix_fmt yuv420p -preset fast "${segPath}"`
  );
  log(`  Background: ${path.basename(bgPath)} [${start.toFixed(1)}s → ${(start + audioDuration).toFixed(1)}s]`);
  return segPath;
}

async function assembleVideo(audioPath, srtPath, audioDuration, sessionId, topic) {
  log("Step 4/4: FFmpeg assembling final video...");

  const bgSegment = prepareBackgroundSegment(audioDuration, sessionId);

  // Viral subtitle style. Key facts:
  //  - libass default PlayResY for SRT is 288. FontSize and MarginV are in
  //    PlayResY units, scaled up to the actual video height at render time.
  //  - FontSize=22 renders ~22/288*1920 = ~147px tall — big and punchy.
  //  - Alignment=2 anchors to the bottom; MarginV is offset from bottom.
  //  - MarginV=85 ≈ 30% of screen height from the bottom → classic viral
  //    lower-third position. (MarginV > PlayResY pushes subs OFF-SCREEN —
  //    the previous 250/300 values were invisible for this reason.)
  const subtitleStyle = [
    "FontName=Impact",
    "FontSize=22",
    "PrimaryColour=&H00FFFFFF",
    "OutlineColour=&H00000000",
    "BorderStyle=1",
    "Outline=4",
    "Shadow=0",
    "Alignment=2",
    "MarginV=85",
    "Bold=1",
    "Spacing=0.5",
  ].join(",");

  const date = new Date().toISOString().split("T")[0];
  const safeTitle = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").substring(0, 50);
  const finalPath = path.join(CONFIG.outputDir, `${date}_${safeTitle}.mp4`);

  ffmpeg(
    `-i "${bgSegment}" -i "${audioPath}" ` +
    `-vf "subtitles='${srtPath}':force_style='${subtitleStyle}'" ` +
    `-c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest "${finalPath}"`
  );

  log(`✓ Video ready: ${finalPath}`);
  return finalPath;
}

// ─── CLEANUP ───────────────────────────────────────────────────────────
function cleanup(sessionId) {
  const tempFiles = fs.readdirSync(CONFIG.tempDir)
    .filter(f => f.startsWith(sessionId));
  tempFiles.forEach(f => fs.unlinkSync(path.join(CONFIG.tempDir, f)));
  log(`Cleaned ${tempFiles.length} temp files`);
}

// ─── RESUME HELPERS ────────────────────────────────────────────────────
// Resume mode reuses paid artifacts (Claude pkg + TTS audio) from a prior
// run that crashed mid-pipeline. Background + subtitles + FFmpeg are cheap
// to recompute, so resume skips only the API-costly steps.
function parseResumeArg() {
  for (const arg of process.argv.slice(2)) {
    if (arg === "--resume") return { mode: "auto" };
    if (arg.startsWith("--resume=")) return { mode: "explicit", id: arg.slice(9) };
  }
  return null;
}

function findLatestSessionInTemp() {
  if (!fs.existsSync(CONFIG.tempDir)) return null;
  const candidates = fs.readdirSync(CONFIG.tempDir)
    .filter(f => f.endsWith("_voice.mp3"))
    .map(f => ({
      id: f.slice(0, -"_voice.mp3".length),
      mtime: fs.statSync(path.join(CONFIG.tempDir, f)).mtime,
    }))
    .sort((a, b) => b.mtime - a.mtime);
  return candidates[0]?.id || null;
}

// If pkg.json wasn't persisted (older runs), reconstruct topic + captions
// from the audio transcript. Costs ~$0.01 instead of re-running TTS.
async function reconstructPkgFromAudio(audioPath) {
  log("  No cached pkg.json — reconstructing from audio transcript...");
  const transcript = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: "whisper-1",
    response_format: "text",
  });
  const script = String(transcript).trim();

  const prompt = `Given the transcript of a short viral video about ${CONFIG.niche}, produce the publishing metadata.

Transcript:
"""
${script}
"""

Return STRICT JSON (no markdown, no commentary):
{
  "topic": "Short specific title derived from the transcript",
  "platforms": {
    "tiktok":    { "caption": "...", "hashtags": ["#fyp","#psychology","..."] },
    "youtube":   { "title": "SEO title max 60 chars", "description": "Hook-first description", "tags": ["10-15 SEO tags"] },
    "instagram": { "caption": "...", "hashtags": ["#reels", "20-30 mixed popularity"] },
    "facebook":  { "caption": "Conversational, ends with a question" }
  }
}`;

  const res = await claude.messages.create({
    model: CONFIG.models.claude,
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });
  const text = res.content[0].text.trim()
    .replace(/^```(?:json)?\n?/i, "")
    .replace(/\n?```$/, "");
  const meta = JSON.parse(text);
  return { topic: meta.topic, script, platforms: meta.platforms };
}

async function loadResumeState(resumeArg) {
  const sessionId = resumeArg.mode === "explicit"
    ? resumeArg.id
    : findLatestSessionInTemp();
  if (!sessionId) throw new Error("No resumable session found in temp/");

  const audioPath = path.join(CONFIG.tempDir, `${sessionId}_voice.mp3`);
  if (!fs.existsSync(audioPath)) throw new Error(`No audio for session ${sessionId}`);
  const duration = ffprobeDuration(audioPath);

  const pkgPath = path.join(CONFIG.tempDir, `${sessionId}_pkg.json`);
  let pkg;
  if (fs.existsSync(pkgPath)) {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    log("  Loaded cached pkg.json");
  } else {
    pkg = await reconstructPkgFromAudio(audioPath);
  }

  return { sessionId, pkg, audioPath, duration };
}

// ─── MAIN ──────────────────────────────────────────────────────────────
async function main() {
  ensureDirs();
  const resumeArg = parseResumeArg();

  let sessionId, pkg, audioPath, duration;

  try {
    const history = loadHistory();

    if (resumeArg) {
      log(`════ RESUME MODE (${resumeArg.mode}) ════`);
      ({ sessionId, pkg, audioPath, duration } = await loadResumeState(resumeArg));
      log(`Resumed session ${sessionId}: topic="${pkg.topic}", ${duration.toFixed(2)}s audio`);
    } else {
      sessionId = crypto.randomBytes(4).toString("hex");
      log(`════ NEW SESSION ${sessionId} ════`);

      // 1. Claude
      pkg = await generateContentPackage(history.topics);
      fs.writeFileSync(
        path.join(CONFIG.tempDir, `${sessionId}_pkg.json`),
        JSON.stringify(pkg, null, 2)
      );

      // 2. TTS
      ({ audioPath, duration } = await generateVoiceover(pkg.script, sessionId));
    }

    // 3. Whisper SRT
    const srtPath = await generateSubtitles(audioPath, sessionId);

    // 4. FFmpeg (bg + voice + subs)
    const videoPath = await assembleVideo(audioPath, srtPath, duration, sessionId, pkg.topic);

    // Save metadata for publisher
    const metadataPath = videoPath.replace(".mp4", ".json");
    fs.writeFileSync(metadataPath, JSON.stringify({
      sessionId,
      videoPath,
      topic: pkg.topic,
      script: pkg.script,
      duration,
      platforms: pkg.platforms,
      createdAt: new Date().toISOString(),
      published: { tiktok: false, youtube: false, instagram: false, facebook: false },
    }, null, 2));

    // Update history
    history.topics.push(pkg.topic);
    history.videos.push({ sessionId, topic: pkg.topic, videoPath, createdAt: new Date().toISOString() });
    saveHistory(history);

    cleanup(sessionId);
    log(`✓ SUCCESS — ready to publish: ${path.basename(videoPath)}`);
    log(`  Run: npm run publish -- ${path.basename(metadataPath)}`);

    return { videoPath, metadataPath };
  } catch (err) {
    log(`✗ FAILED: ${err.message}`, "ERROR");
    log(err.stack, "ERROR");
    process.exit(1);
  }
}

if (require.main === module) main();
module.exports = { main };
