/**
 * Tests for the data-route 401 classification.
 *
 * Regression: the viewer treated every 401 from `/api/graph/data` as an
 * expired session, re-ran the whole handshake, and then showed "Session
 * expired". The console returns 401 both for a dead session and for an engine
 * refusal it passes through, so on a deployment with `[access] require_actor`
 * an authorization failure was reported as expiry -- and the retry made the
 * audit log show two mint/redeem pairs per click.
 *
 * Same convention as `../graph/memory-loader.test.ts`: no test framework in
 * this repo, so this is a standalone script run via tsx that throws on
 * failure.
 */
import { isSessionGoneCode, readErrorCode } from "./handoff.ts";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean): void {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`  FAIL: ${name}`);
  }
}

function eq<T>(name: string, actual: T, expected: T): void {
  const ok = actual === expected;
  if (!ok) console.error(`  (${name}) expected ${String(expected)}, got ${String(actual)}`);
  check(name, ok);
}

/** A minimal stand-in for the parts of `Response` that `readErrorCode` uses. */
function jsonResponse(body: unknown): Response {
  return { json: async () => body } as unknown as Response;
}

function brokenResponse(): Response {
  return {
    json: async () => {
      throw new SyntaxError("Unexpected end of JSON input");
    },
  } as unknown as Response;
}

// --- readErrorCode: pulls the code out of the console's error body ---
{
  eq("engine passthrough code", await readErrorCode(jsonResponse({ error: "unauthorized" })), "unauthorized");
  eq("session code", await readErrorCode(jsonResponse({ error: "session_gone" })), "session_gone");
  eq("no error field", await readErrorCode(jsonResponse({ ok: true })), null);
  eq("empty code is not a code", await readErrorCode(jsonResponse({ error: "" })), null);
  eq("non-string code", await readErrorCode(jsonResponse({ error: 401 })), null);
  eq("null body", await readErrorCode(jsonResponse(null)), null);
  eq("unparseable body", await readErrorCode(brokenResponse()), null);
}

// --- isSessionGoneCode: only session codes justify a re-mint ---
{
  check("session_gone re-mints", isSessionGoneCode("session_gone"));
  check("expired re-mints", isSessionGoneCode("expired"));
  // The bug this file exists for: an engine refusal must NOT be retried and
  // must not be reported as expiry.
  check("unauthorized does not re-mint", !isSessionGoneCode("unauthorized"));
  check("forbidden does not re-mint", !isSessionGoneCode("forbidden"));
  check("engine_unreachable does not re-mint", !isSessionGoneCode("engine_unreachable"));
  // An unreadable body degrades to the pre-existing behaviour rather than to
  // a new one.
  check("unreadable body falls back to re-mint", isSessionGoneCode(null));
}

// --- summary ---
console.log(`handoff: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} handoff assertion(s) failed`);
