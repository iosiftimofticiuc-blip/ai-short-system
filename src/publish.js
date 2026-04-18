/**
 * AI SHORTS PUBLISHER — Multi-platform auto-poster
 * ════════════════════════════════════════════════════════════════════
 * 
 * Publishes the latest video (or specified) to:
 *   - TikTok (via TikTok Content Posting API)
 *   - YouTube Shorts (via YouTube Data API v3)
 *   - Instagram Reels (via Instagram Graph API)
 *   - Facebook Reels (via Facebook Graph API)
 * 
 * Usage:
 *   node src/publish.js                          # publish latest unpublished
 *   node src/publish.js 2026-04-18_topic.json    # publish specific
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");

const OUTPUT_DIR = path.resolve(__dirname, "../output");
const LOGS_DIR = path.resolve(__dirname, "../logs");

const log = (msg, level = "INFO") => {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${msg}`;
  console.log(line);
  fs.appendFileSync(
    path.join(LOGS_DIR, `publisher-${new Date().toISOString().split("T")[0]}.log`),
    line + "\n"
  );
};

// ─── PLATFORM 1: TIKTOK ────────────────────────────────────────────────
async function publishTikTok(videoPath, metadata) {
  log("→ TikTok: starting upload...");
  const { caption, hashtags } = metadata.platforms.tiktok;
  const fullCaption = `${caption}\n\n${hashtags.join(" ")}`.substring(0, 2200);
  
  // Step 1: Init upload
  const initRes = await axios.post(
    "https://open.tiktokapis.com/v2/post/publish/video/init/",
    {
      post_info: {
        title: fullCaption,
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: fs.statSync(videoPath).size,
        chunk_size: fs.statSync(videoPath).size,
        total_chunk_count: 1,
      },
    },
    { headers: { Authorization: `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}` } }
  );
  
  const { upload_url, publish_id } = initRes.data.data;
  
  // Step 2: Upload video chunk
  const videoBuffer = fs.readFileSync(videoPath);
  await axios.put(upload_url, videoBuffer, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Range": `bytes 0-${videoBuffer.length - 1}/${videoBuffer.length}`,
    },
  });
  
  log(`✓ TikTok uploaded — publish_id: ${publish_id}`);
  return publish_id;
}

// ─── PLATFORM 2: YOUTUBE SHORTS ────────────────────────────────────────
async function publishYouTube(videoPath, metadata) {
  log("→ YouTube: starting upload...");
  const { title, description, tags } = metadata.platforms.youtube;
  
  // Refresh access token
  const tokenRes = await axios.post("https://oauth2.googleapis.com/token", {
    client_id: process.env.YOUTUBE_CLIENT_ID,
    client_secret: process.env.YOUTUBE_CLIENT_SECRET,
    refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  const accessToken = tokenRes.data.access_token;
  
  // Resumable upload init
  const metadataBody = {
    snippet: {
      title: title.substring(0, 100),
      description: `${description}\n\n#Shorts #${metadata.platforms.youtube.tags.slice(0, 3).join(" #")}`,
      tags: tags,
      categoryId: "27", // Education
    },
    status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
  };
  
  const initRes = await axios.post(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    metadataBody,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": "video/mp4",
      },
    }
  );
  
  const uploadUrl = initRes.headers.location;
  const videoBuffer = fs.readFileSync(videoPath);
  
  const uploadRes = await axios.put(uploadUrl, videoBuffer, {
    headers: { "Content-Type": "video/mp4", "Content-Length": videoBuffer.length },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
  
  log(`✓ YouTube published — videoId: ${uploadRes.data.id}`);
  return uploadRes.data.id;
}

// ─── PLATFORM 3: INSTAGRAM REELS ───────────────────────────────────────
async function publishInstagram(videoPath, metadata) {
  log("→ Instagram: starting upload...");
  const { caption, hashtags } = metadata.platforms.instagram;
  const fullCaption = `${caption}\n\n${hashtags.join(" ")}`.substring(0, 2200);
  
  // IG requires public video URL — assumes you host on Cloudflare R2 / S3 / etc
  // For VPS: serve via simple Express endpoint or upload to free R2
  const publicUrl = process.env.PUBLIC_VIDEO_URL_BASE
    ? `${process.env.PUBLIC_VIDEO_URL_BASE}/${path.basename(videoPath)}`
    : null;
  
  if (!publicUrl) {
    throw new Error("Instagram needs PUBLIC_VIDEO_URL_BASE set (host video publicly)");
  }
  
  // Step 1: Create container
  const containerRes = await axios.post(
    `https://graph.facebook.com/v21.0/${process.env.INSTAGRAM_BUSINESS_ID}/media`,
    {
      media_type: "REELS",
      video_url: publicUrl,
      caption: fullCaption,
      share_to_feed: true,
      access_token: process.env.META_ACCESS_TOKEN,
    }
  );
  const containerId = containerRes.data.id;
  
  // Step 2: Wait for processing (poll status)
  let status = "IN_PROGRESS";
  let attempts = 0;
  while (status === "IN_PROGRESS" && attempts < 30) {
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await axios.get(
      `https://graph.facebook.com/v21.0/${containerId}?fields=status_code&access_token=${process.env.META_ACCESS_TOKEN}`
    );
    status = statusRes.data.status_code;
    attempts++;
  }
  
  if (status !== "FINISHED") throw new Error(`IG processing failed: ${status}`);
  
  // Step 3: Publish
  const publishRes = await axios.post(
    `https://graph.facebook.com/v21.0/${process.env.INSTAGRAM_BUSINESS_ID}/media_publish`,
    { creation_id: containerId, access_token: process.env.META_ACCESS_TOKEN }
  );
  
  log(`✓ Instagram published — id: ${publishRes.data.id}`);
  return publishRes.data.id;
}

// ─── PLATFORM 4: FACEBOOK REELS ────────────────────────────────────────
async function publishFacebook(videoPath, metadata) {
  log("→ Facebook: starting upload...");
  const { caption } = metadata.platforms.facebook;
  
  // Step 1: Initialize upload session
  const initRes = await axios.post(
    `https://graph.facebook.com/v21.0/${process.env.FACEBOOK_PAGE_ID}/video_reels`,
    {
      upload_phase: "start",
      access_token: process.env.META_ACCESS_TOKEN,
    }
  );
  const { video_id, upload_url } = initRes.data;
  
  // Step 2: Upload binary
  const videoBuffer = fs.readFileSync(videoPath);
  await axios.post(upload_url, videoBuffer, {
    headers: {
      Authorization: `OAuth ${process.env.META_ACCESS_TOKEN}`,
      offset: "0",
      file_size: videoBuffer.length.toString(),
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
  
  // Step 3: Finish & publish
  const finishRes = await axios.post(
    `https://graph.facebook.com/v21.0/${process.env.FACEBOOK_PAGE_ID}/video_reels`,
    {
      video_id,
      upload_phase: "finish",
      video_state: "PUBLISHED",
      description: caption,
      access_token: process.env.META_ACCESS_TOKEN,
    }
  );
  
  log(`✓ Facebook published — video_id: ${video_id}`);
  return video_id;
}

// ─── MAIN ──────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
  
  // Find target metadata file
  const arg = process.argv[2];
  let metadataPath;
  
  if (arg) {
    metadataPath = path.isAbsolute(arg) ? arg : path.join(OUTPUT_DIR, arg);
  } else {
    // Find latest unpublished
    const files = fs.readdirSync(OUTPUT_DIR)
      .filter(f => f.endsWith(".json"))
      .map(f => ({ f, mtime: fs.statSync(path.join(OUTPUT_DIR, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);
    
    for (const { f } of files) {
      const data = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, f), "utf8"));
      if (Object.values(data.published).some(v => !v)) {
        metadataPath = path.join(OUTPUT_DIR, f);
        break;
      }
    }
  }
  
  if (!metadataPath) {
    log("No unpublished videos found", "WARN");
    return;
  }
  
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  const videoPath = metadata.videoPath;
  
  log(`════ PUBLISHING: ${metadata.topic} ════`);
  
  const platforms = [
    { name: "tiktok", fn: publishTikTok, enabled: !!process.env.TIKTOK_ACCESS_TOKEN },
    { name: "youtube", fn: publishYouTube, enabled: !!process.env.YOUTUBE_REFRESH_TOKEN },
    { name: "instagram", fn: publishInstagram, enabled: !!process.env.INSTAGRAM_BUSINESS_ID },
    { name: "facebook", fn: publishFacebook, enabled: !!process.env.FACEBOOK_PAGE_ID },
  ];
  
  for (const platform of platforms) {
    if (!platform.enabled) {
      log(`⊘ ${platform.name}: skipped (no credentials)`, "WARN");
      continue;
    }
    if (metadata.published[platform.name]) {
      log(`⊘ ${platform.name}: already published`, "INFO");
      continue;
    }
    try {
      const id = await platform.fn(videoPath, metadata);
      metadata.published[platform.name] = { id, publishedAt: new Date().toISOString() };
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    } catch (err) {
      log(`✗ ${platform.name} FAILED: ${err.response?.data ? JSON.stringify(err.response.data) : err.message}`, "ERROR");
    }
  }
  
  log("════ DONE ════");
}

if (require.main === module) main();
module.exports = { main };
