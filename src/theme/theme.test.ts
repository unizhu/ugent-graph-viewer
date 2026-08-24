/**
 * Tests for theme-token validation.
 *
 * The viewer accepts a theme over `postMessage` from the window that
 * opened it, and `isThemePayload` checked only that `tokens` and `kinds`
 * were objects -- never what was in them. Those values are interpolated
 * into the tooltip markup in `canvas/GraphCanvas.tsx`, which
 * `react-force-graph` and `PointsCanvas` inject as raw HTML, so a token
 * carrying markup executed script in the viewer's own origin on the first
 * node hover.
 *
 * Same convention as the sibling tests: no test framework in this repo,
 * so this is a standalone script run via tsx that throws on failure.
 */
import { isThemePayload, safeColor } from "./theme.ts";

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


// The payload that made a hover into script execution.
eq(
  "a token breaking out of the style attribute is refused",
  safeColor('"><img src=x onerror=alert(document.domain)>'),
  "transparent",
);
eq("a token closing the tag is refused", safeColor("#fff\"></span><script>alert(1)</script>"), "transparent");
eq("url() is refused", safeColor("url(https://evil.example/x)"), "transparent");
eq("var() is refused", safeColor("var(--anything)"), "transparent");
eq("an expression is refused", safeColor("expression(alert(1))"), "transparent");
eq("a non-string is refused", safeColor(42), "transparent");
eq("an absurdly long value is refused", safeColor(`#${"a".repeat(200)}`), "transparent");

// The forms the console actually sends have to keep working.
eq("hex passes", safeColor("#09090b"), "#09090b");
eq("short hex passes", safeColor("#fff"), "#fff");
eq("hex with alpha passes", safeColor("#09090bcc"), "#09090bcc");
eq("rgb passes", safeColor("rgb(9, 9, 11)"), "rgb(9, 9, 11)");
eq("rgba passes", safeColor("rgba(9, 9, 11, 0.5)"), "rgba(9, 9, 11, 0.5)");
eq("hsl passes", safeColor("hsl(240 6% 10%)"), "hsl(240 6% 10%)");
eq("a keyword passes", safeColor("transparent"), "transparent");
eq("surrounding whitespace is trimmed", safeColor("  #fafafa  "), "#fafafa");


const validShape = { theme: "dark", tokens: {}, kinds: {} };
check("a well-shaped payload is accepted", isThemePayload(validShape));
check("a missing theme is refused", !isThemePayload({ tokens: {}, kinds: {} }));
check("an unknown theme name is refused", !isThemePayload({ theme: "neon", tokens: {}, kinds: {} }));
check("a non-object tokens field is refused", !isThemePayload({ theme: "dark", tokens: "x", kinds: {} }));
check("a null payload is refused", !isThemePayload(null));

// Same convention as the sibling tests: throw rather than exit, so no
// node type definitions are needed for `process`.
console.log(`theme: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} theme assertion(s) failed`);
