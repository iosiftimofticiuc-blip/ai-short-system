/**
 * AI SHORTS GENERATOR — Psychology & Science Facts
 * ════════════════════════════════════════════════════════════════════
 * 
 * Pipeline:
 *   1. Claude     → Picks viral topic + writes script + image prompts
 *   2. DALL-E 3   → Generates 5 cinematic 9:16 images
 *   3. OpenAI TTS → Converts script to natural voiceover
 *   4. FFmpeg     → Assembles video with subtitles, music, transitions
 *   5. Output     → MP4 ready for publishing
 * 
 * Usage: node src/generate.js
 */

require("dotenv").config();
const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { execSync } = require("child_process");
const crypto = require("crypto");

// ─── CONFIG ────────────────────────────────────────────────────────────
const CONFIG = {
  outputDir: path.resolve(__dirname, "../output"),
  tempDir: path.resolve(__dirname, "../temp"),
  logsDir: path.resolve(__dirname, "../logs"),
  historyFile: path.resolve(__dirname, "../config/history.json"),
  
  niche: process.env.NICHE || "Psychology and Science Facts",
  voice: process.env.VOICE || "onyx",
  
  video: {
    width: 1080,
    height: 1920,
    fps: 30,
    imageDurationSec: 4, // 5 imagini × 4 sec = 20 sec... ajustam dinamic
  },
  
  models: {
    claude: "claude-opus-4-7",
    dalle: "dall-e-3",
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

const downloadFile = async (url, dest) => {
  const response = await axios.get(url, { responseType: "stream" });
  const writer = fs.createWriteStream(dest);
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
};

const ffmpeg = (cmd) => {
  log(`FFmpeg: ${cmd.substring(0, 100)}...`, "DEBUG");
  try {
    execSync(`ffmpeg -y -loglevel error ${cmd}`, { stdio: "pipe" });
  } catch (err) {
    log(`FFmpeg ERROR: ${err.message}`, "ERROR");
    throw err;
  }
};

// ─── STEP 1: CLAUDE GENERATES EVERYTHING ───────────────────────────────
async function generateContentPackage(usedTopics) {
  log("Step 1/5: Claude generates content package...");
  
  const prompt = `You are a viral short-form content expert specializing in ${CONFIG.niche} for TikTok, YouTube Shorts, Instagram Reels.

TASK: Create a complete viral video package for a 50-60 second short video.

CONSTRAINTS:
- Niche: ${CONFIG.niche}
- Audience: Global English speakers, 18-45
- Hook: First 3 seconds MUST stop scrolling (curiosity gap, shocking stat, controversial claim)
- Script: 130-150 words exactly (= ~55 seconds at TTS pace)
- Tone: Authoritative but conversational. Like a smart friend revealing a secret.
- End: With a "follow for more" CTA disguised as a teaser
- AVOID these used topics: ${usedTopics.slice(-30).join(" | ") || "none yet"}

OUTPUT (strict JSON, no markdown):
{
  "topic": "Short specific title",
  "hook": "First sentence that stops scrolling",
  "script": "Full 130-150 word script with hook included. Natural spoken English. No stage directions.",
  "imagePrompts": [
    "Cinematic image prompt 1 - vertical 9:16 - hyperrealistic - dramatic lighting",
    "Cinematic image prompt 2",
    "Cinematic image prompt 3", 
    "Cinematic image prompt 4",
    "Cinematic image prompt 5"
  ],
  "platforms": {
    "tiktok": {
      "caption": "Caption with line breaks",
      "hashtags": ["#fyp", "#psychology", "#mindblown", "8-12 total"]
    },
    "youtube": {
      "title": "SEO title with brackets [Hook] - max 60 chars",
      "description": "First 2 lines = hook. Then context. Then hashtags at end.",
      "tags": ["10-15 SEO tags"]
    },
    "instagram": {
      "caption": "Caption optimized for IG Reels",
      "hashtags": ["#reels", "#psychology", "20-30 total mix popular and niche"]
    },
    "facebook": {
      "caption": "Slightly longer caption, conversational, ends with question to drive comments"
    }
  }
}

CRITICAL: Return ONLY valid JSON. No \`\`\`json wrapper. No commentary.`;

  const response = await claude.messages.create({
    model: CONFIG.models.claude,
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });

  let text = response.content[0].text.trim();
  // Strip markdown if Claude added it
  text = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "");
  
  const pkg = JSON.parse(text);
  log(`Topic chosen: "${pkg.topic}"`);
  log(`Script length: ${pkg.script.split(/\s+/).length} words`);
  return pkg;
}

// ─── STEP 2: DALL-E GENERATES IMAGES ───────────────────────────────────
async function generateImages(prompts, sessionId) {
  log(`Step 2/5: DALL-E 3 generating ${prompts.length} images...`);
  
  const imagePaths = [];
  for (let i = 0; i < prompts.length; i++) {
    log(`  Image ${i + 1}/${prompts.length}...`);
    
    const response = await openai.images.generate({
      model: CONFIG.models.dalle,
      prompt: prompts[i],
      size: "1024x1792", // closest 9:16 ratio in DALL-E
      quality: "hd",
      n: 1,
    });
    
    const url = response.data[0].url;
    const dest = path.join(CONFIG.tempDir, `${sessionId}_img_${i}.png`);
    await downloadFile(url, dest);
    imagePaths.push(dest);
    
    // Resize to exact 1080x1920 for video
    const resized = path.join(CONFIG.tempDir, `${sessionId}_img_${i}_resized.png`);
    ffmpeg(`-i "${dest}" -vf "scale=${CONFIG.video.width}:${CONFIG.video.height}:force_original_aspect_ratio=increase,crop=${CONFIG.video.width}:${CONFIG.video.height}" "${resized}"`);
    fs.unlinkSync(dest);
    fs.renameSync(resized, dest);
  }
  
  return imagePaths;
}

// ─── STEP 3: OPENAI TTS GENERATES VOICEOVER ────────────────────────────
async function generateVoiceover(script, sessionId) {
  log("Step 3/5: OpenAI TTS generating voiceover...");
  
  const response = await openai.audio.speech.create({
    model: CONFIG.models.tts,
    voice: CONFIG.voice,
    input: script,
    speed: 1.05, // Slightly faster for shorts pacing
  });
  
  const audioPath = path.join(CONFIG.tempDir, `${sessionId}_voice.mp3`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(audioPath, buffer);
  
  // Get duration with ffprobe
  const duration = parseFloat(
    execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${audioPath}"`)
      .toString().trim()
  );
  
  log(`  Voice duration: ${duration.toFixed(2)}s`);
  return { audioPath, duration };
}

// ─── STEP 4: GENERATE SUBTITLES (SRT) ──────────────────────────────────
async function generateSubtitles(audioPath, sessionId) {
  log("Step 4/5: Generating subtitles via Whisper...");
  
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: "whisper-1",
    response_format: "srt",
    timestamp_granularities: ["word"],
  });
  
  const srtPath = path.join(CONFIG.tempDir, `${sessionId}_subs.srt`);
  fs.writeFileSync(srtPath, transcription);
  return srtPath;
}

// ─── STEP 5: ASSEMBLE VIDEO WITH FFMPEG ────────────────────────────────
async function assembleVideo(imagePaths, audioPath, srtPath, audioDuration, sessionId, topic) {
  log("Step 5/5: FFmpeg assembling final video...");
  
  const perImage = audioDuration / imagePaths.length;
  log(`  ${imagePaths.length} images × ${perImage.toFixed(2)}s each`);
  
  // Build concat file with Ken Burns zoom effect on each image
  const segments = [];
  for (let i = 0; i < imagePaths.length; i++) {
    const segPath = path.join(CONFIG.tempDir, `${sessionId}_seg_${i}.mp4`);
    
    // Ken Burns effect: zoom in slowly
    ffmpeg(
      `-loop 1 -i "${imagePaths[i]}" ` +
      `-vf "zoompan=z='min(zoom+0.0015,1.2)':d=${Math.round(perImage * CONFIG.video.fps)}:s=${CONFIG.video.width}x${CONFIG.video.height}:fps=${CONFIG.video.fps}" ` +
      `-t ${perImage} -c:v libx264 -pix_fmt yuv420p -preset fast "${segPath}"`
    );
    segments.push(segPath);
  }
  
  // Concat all segments
  const concatList = path.join(CONFIG.tempDir, `${sessionId}_concat.txt`);
  fs.writeFileSync(concatList, segments.map(s => `file '${s}'`).join("\n"));
  
  const videoNoAudio = path.join(CONFIG.tempDir, `${sessionId}_video.mp4`);
  ffmpeg(`-f concat -safe 0 -i "${concatList}" -c copy "${videoNoAudio}"`);
  
  // Add subtitle styling: bold, white with black outline, centered
  const subtitleStyle = "FontName=Impact,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=3,Shadow=1,Alignment=2,MarginV=300,Bold=1";
  
  // Final mix: video + audio + styled subtitles
  const date = new Date().toISOString().split("T")[0];
  const safeTitle = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").substring(0, 50);
  const finalPath = path.join(CONFIG.outputDir, `${date}_${safeTitle}.mp4`);
  
  ffmpeg(
    `-i "${videoNoAudio}" -i "${audioPath}" ` +
    `-vf "subtitles='${srtPath}':force_style='${subtitleStyle}'" ` +
    `-c:a aac -b:a 192k -shortest "${finalPath}"`
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

// ─── MAIN ──────────────────────────────────────────────────────────────
async function main() {
  ensureDirs();
  const sessionId = crypto.randomBytes(4).toString("hex");
  log(`════ NEW SESSION ${sessionId} ════`);
  
  try {
    const history = loadHistory();
    
    // 1. Claude: full content package
    const pkg = await generateContentPackage(history.topics);
    
    // 2. DALL-E: images
    const imagePaths = await generateImages(pkg.imagePrompts, sessionId);
    
    // 3. OpenAI TTS: voice
    const { audioPath, duration } = await generateVoiceover(pkg.script, sessionId);
    
    // 4. Whisper: subtitles
    const srtPath = await generateSubtitles(audioPath, sessionId);
    
    // 5. FFmpeg: final video
    const videoPath = await assembleVideo(imagePaths, audioPath, srtPath, duration, sessionId, pkg.topic);
    
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
