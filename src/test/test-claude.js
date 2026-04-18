/**
 * Test Claude API connectivity and content generation
 * Usage: node src/test/test-claude.js
 */
require("dotenv").config();
const Anthropic = require("@anthropic-ai/sdk");

(async () => {
  console.log("Testing Claude API...");
  const claude = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
  
  try {
    const response = await claude.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: "Generate ONE viral hook for a Psychology Facts TikTok short. Just the hook, one sentence."
      }],
    });
    console.log("✓ Claude works!");
    console.log("Response:", response.content[0].text);
    console.log("Tokens used:", response.usage);
  } catch (err) {
    console.error("✗ Claude FAILED:", err.message);
    process.exit(1);
  }
})();
