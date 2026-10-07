import "dotenv/config";
import { claudeAuthStatus, runAi, backend, modelFor, STRIPPED_ENV, AiSetupError } from "../ai.js";

/**
 * Preflight for the headless setup - run this before your first real scoring run.
 *   npm run ai-check          shows how Claude is signed in (spends nothing)
 *   npm run ai-check -- --ping  also makes one tiny call to prove headless mode works end to end
 */
async function main() {
  console.log(`Backend: ${backend()}`);
  if (backend() !== "claude-cli") {
    console.log("AI_BACKEND=api: calls go to the Anthropic API and are billed per token to your API account.");
    return;
  }

  const present = STRIPPED_ENV.filter((name) => process.env[name]);
  if (present.length) {
    console.log(`Note: ${present.join(", ")} is set here. That's fine: it is removed before Claude is launched, so it can't redirect billing.`);
  }

  const status = await claudeAuthStatus();
  console.log("claude auth status:", JSON.stringify(status));
  if (status.loggedIn !== true) {
    console.error('\nNot signed in. Run "claude auth login" and sign in with your subscription, then re-run this check.');
    process.exitCode = 1;
    return;
  }
  const method = String(status.authMethod ?? "");
  if (/api[_ -]?key|console/i.test(method)) {
    console.warn(`\nWARNING: Claude is signed in via "${method}", which looks like API billing, not your subscription. Run "claude auth login" and choose your subscription account.`);
  } else {
    console.log(`\nSigned in via "${method}". Headless calls will draw on this login's usage allowance.`);
  }

  if (process.argv.includes("--ping")) {
    const started = Date.now();
    const { text, costUsd } = await runAi({ tier: "screen", prompt: "Reply with exactly the single word: OK" });
    console.log(`\nPing (${modelFor("screen")}): "${text.trim()}" in ${((Date.now() - started) / 1000).toFixed(1)}s` + (costUsd !== undefined ? `, estimated API-equivalent cost $${costUsd.toFixed(4)}` : ""));
  } else {
    console.log('Add "-- --ping" to make one tiny test call.');
  }
}

main().catch((err) => {
  console.error(err instanceof AiSetupError ? `\n${err.message}` : err);
  process.exit(1);
});
