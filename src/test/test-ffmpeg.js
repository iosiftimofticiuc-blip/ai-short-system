/**
 * Test FFmpeg installation
 * Usage: node src/test/test-ffmpeg.js
 */
const { execSync } = require("child_process");

console.log("→ Testing FFmpeg...");
try {
  const version = execSync("ffmpeg -version", { encoding: "utf8" }).split("\n")[0];
  console.log(`✓ FFmpeg installed: ${version}`);
  
  const probe = execSync("ffprobe -version", { encoding: "utf8" }).split("\n")[0];
  console.log(`✓ FFprobe installed: ${probe}`);
  
  // Test essential filters
  const filters = execSync("ffmpeg -filters 2>&1 | grep -E 'zoompan|subtitles|scale' | head", { encoding: "utf8" });
  console.log("✓ Required filters available:");
  console.log(filters);
} catch (err) {
  console.error("✗ FFmpeg NOT installed or broken:", err.message);
  console.error("Install: sudo apt install ffmpeg");
  process.exit(1);
}
