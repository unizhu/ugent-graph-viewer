/**
 * Tests for the render quality tiers.
 *
 * These predicates decide how much geometry and per-frame work a large graph
 * pays for. The one that matters most is `cylinderLinksFor`: three-forcegraph
 * selects its link object with `useCylinder = !!widthAccessor(link)`, so a
 * caller that returns any non-zero width -- including a small "dimmed" width --
 * keeps every link as a lit cylinder mesh. The boundary cases below are the
 * ones that regress silently, because a wrong threshold still renders
 * correctly and only shows up as frame rate.
 *
 * Same convention as `../graph/memory-loader.test.ts`: standalone tsx script,
 * throws on failure.
 */
import {
  ARROWS_OFF_ABOVE_LINKS,
  FLAT_LINKS_ABOVE_LINKS,
  HOVER_HIGHLIGHT_MAX_NODES,
  LOW_RES_ABOVE_NODES,
  arrowsEnabledFor,
  cylinderLinksFor,
  hoverHighlightFor,
  nodeResolutionFor,
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

function eq<T>(name: string, actual: T, expected: T): void {
  const ok = actual === expected;
  if (!ok) console.error(`  (${name}) expected ${String(expected)}, got ${String(actual)}`);
  check(name, ok);
}

// --- cylinderLinksFor: inclusive at the threshold, off above it ---
{
  check("small graph keeps cylinders", cylinderLinksFor(0));
  check("at the threshold still cylinders", cylinderLinksFor(FLAT_LINKS_ABOVE_LINKS));
  check("one over goes flat", !cylinderLinksFor(FLAT_LINKS_ABOVE_LINKS + 1));
  // The real workspaces this exists for: ~10k nodes carry ~18k links.
  check("18k links go flat", !cylinderLinksFor(18_000));
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

// --- nodeResolutionFor ---
{
  eq("small graph resolution", nodeResolutionFor(100), 6);
  eq("at the threshold", nodeResolutionFor(LOW_RES_ABOVE_NODES), 6);
  eq("above the threshold", nodeResolutionFor(LOW_RES_ABOVE_NODES + 1), 4);
}

// --- tier ordering: the cheaper degradations must engage first ---
{
  // Arrows are the least useful and go first; flat links next; hover highlight
  // last because losing it is the most noticeable. A future edit that reorders
  // these would degrade the wrong thing first.
  check("arrows shed before flat links", ARROWS_OFF_ABOVE_LINKS < FLAT_LINKS_ABOVE_LINKS);
  check("low-res spheres shed before hover", LOW_RES_ABOVE_NODES < HOVER_HIGHLIGHT_MAX_NODES);
}

// --- summary ---
console.log(`render-settings: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} render-settings assertion(s) failed`);
