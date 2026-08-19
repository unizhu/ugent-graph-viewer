/**
 * Tests for the render quality tiers.
 *
 * Both surviving tiers apply to the 2D canvas: the 3D path draws the whole
 * graph in two calls and highlights in O(degree), so it sheds nothing. The
 * boundary cases below are the ones that regress silently, because a wrong
 * threshold still renders correctly and only shows up as frame rate.
 *
 * Same convention as `../graph/memory-loader.test.ts`: standalone tsx script,
 * throws on failure.
 */
import {
  ARROWS_OFF_ABOVE_LINKS,
  HOVER_HIGHLIGHT_MAX_NODES,
  arrowsEnabledFor,
  hoverHighlightFor,
} from "./render-settings.ts";

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

// --- hoverHighlightFor ---
{
  check("small graph highlights on hover", hoverHighlightFor(500));
  check("at the threshold still highlights", hoverHighlightFor(HOVER_HIGHLIGHT_MAX_NODES));
  check("one over stops highlighting", !hoverHighlightFor(HOVER_HIGHLIGHT_MAX_NODES + 1));
  // ugent-7559fca657ae is 26k raw, ~10k after block pruning.
  check("10k nodes stop highlighting", !hoverHighlightFor(10_000));
}

// --- arrowsEnabledFor ---
{
  check("arrows on for a small graph", arrowsEnabledFor(100));
  check("arrows on at the threshold", arrowsEnabledFor(ARROWS_OFF_ABOVE_LINKS));
  check("arrows off above it", !arrowsEnabledFor(ARROWS_OFF_ABOVE_LINKS + 1));
}

// --- summary ---
console.log(`render-settings: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} render-settings assertion(s) failed`);
