// Shared node-search matching used by both the render builder (graph-data.ts)
// and the visibility counter (filters.ts) so they always agree.
//
// Plain mode (default):
//   - `|` separates OR alternatives
//   - whitespace separates AND terms
//   - a node matches when EVERY space-separated group matches, where a group
//     matches if ANY of its `|`-alternatives is a case-insensitive substring
//     of the node's label or file path.
//   Example: "policy|token config" -> (policy OR token) AND config
//
// Regex mode:
//   - the whole query is one case-insensitive regular expression tested
//     against label and file path. An invalid regex matches nothing.
//
// A query is compiled once into a predicate; the predicate is cheap per node.

export interface SearchMatcher {
  /** True when the node's label or path satisfies the query. */
  test: (label: string, filePath: string) => boolean;
  /** True when the compiled query is effectively empty (matches everything). */
  isEmpty: boolean;
  /** True when regex mode was requested but the pattern failed to compile. */
  invalid: boolean;
}

const MATCH_ALL: SearchMatcher = { test: () => true, isEmpty: true, invalid: false };

export function compileSearch(query: string, regexMode: boolean): SearchMatcher {
  const trimmed = (query || "").trim();
  if (!trimmed) return MATCH_ALL;

  if (regexMode) {
    let re: RegExp;
    try {
      re = new RegExp(trimmed, "i");
    } catch {
      // Invalid pattern: match nothing so the user sees the query is not valid
      // yet (rather than silently matching everything).
      return { test: () => false, isEmpty: false, invalid: true };
    }
    return {
      test: (label, filePath) => re.test(label) || re.test(filePath || ""),
      isEmpty: false,
      invalid: false,
    };
  }

  // Plain mode: AND of OR-groups, all lowercased for case-insensitive compare.
  const groups = trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((g) => g.split("|").map((t) => t.trim()).filter(Boolean))
    .filter((alts) => alts.length > 0);

  if (groups.length === 0) return MATCH_ALL;

  return {
    test: (label, filePath) => {
      const hay = `${label}\n${filePath || ""}`.toLowerCase();
      return groups.every((alts) => alts.some((t) => hay.includes(t)));
    },
    isEmpty: false,
    invalid: false,
  };
}
