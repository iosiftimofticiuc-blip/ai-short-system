/**
 * Test OpenAI API: GPT, DALL-E, TTS, Whisper
 * Usage: node src/test/test-openai.js
 */
require("dotenv").config();
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

(async () => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const tempDir = path.resolve(__dirname, "../../temp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  // Test TTS
  console.log("→ Testing OpenAI TTS...");
  try {
    const speech = await openai.audio.speech.create({
      model: "tts-1-hd",
      voice: "onyx",
      input: "This is a test of the AI shorts system.",
    });
    const buf = Buffer.from(await speech.arrayBuffer());
    fs.writeFileSync(path.join(tempDir, "test-voice.mp3"), buf);
    console.log("✓ TTS works! Saved to temp/test-voice.mp3");
  } catch (err) {
    console.error("✗ TTS FAILED:", err.message);
  }

  // Test DALL-E (1 image, costs ~$0.08)
  console.log("→ Testing DALL-E 3 (this costs ~$0.08)...");
  try {
    const img = await openai.images.generate({
      model: "dall-e-3",
      prompt: "A cinematic 9:16 portrait of a brain with neural connections glowing, dark background, hyperrealistic",
      size: "1024x1792",
      quality: "hd",
      n: 1,
    });
    console.log("✓ DALL-E works! Image URL:", img.data[0].url);
  } catch (err) {
    console.error("✗ DALL-E FAILED:", err.message);
  }
})();
