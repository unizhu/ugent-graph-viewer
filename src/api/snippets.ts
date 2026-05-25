import type { FileSnippetsResponse } from "../types";

const TOKEN_STORAGE_KEY = "ugent.token";

/**
 * Read the bearer token used for engine API calls. Persisted in
 * localStorage so the user only enters it once. Returns null when
 * unset (acceptable when the engine has SERVICE_TOKENS empty).
 */
export function getEngineToken(): string | null {
  try {
    const raw = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    return raw && raw.trim().length > 0 ? raw.trim() : null;
  } catch {
    return null;
  }
}

export function setEngineToken(token: string | null): void {
  try {
    if (!token || token.trim().length === 0) {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    } else {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token.trim());
    }
  } catch {
    // localStorage unavailable (private mode) — calls without a token
    // still work when the engine has SERVICE_TOKENS disabled.
  }
}

/**
 * Fetch all (or up to `maxChunks`) chunks for a file node from the live
 * engine. Returns null when the network call fails so the UI can render
 * a non-blocking placeholder.
 */
export async function fetchFileSnippets(
  codebaseId: string,
  filePath: string,
  signal: AbortSignal,
  maxChunks: number = 200,
): Promise<FileSnippetsResponse | { error: string }> {
  const params = new URLSearchParams({
    codebase_id: codebaseId,
    file_path: filePath,
    max_chunks: String(maxChunks),
  });
  const headers: Record<string, string> = {};
  const token = getEngineToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`/v1/files/snippets?${params.toString()}`, {
      method: "GET",
      headers,
      signal,
    });
  } catch (err) {
    if ((err as DOMException)?.name === "AbortError") throw err;
    return { error: `network error: ${(err as Error).message}` };
  }

  if (!res.ok) {
    let reason = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string; reason?: string };
      if (body.reason) reason = `${reason}: ${body.reason}`;
      else if (body.error) reason = `${reason}: ${body.error}`;
    } catch {
      // ignore non-JSON body
    }
    return { error: reason };
  }

  return (await res.json()) as FileSnippetsResponse;
}
