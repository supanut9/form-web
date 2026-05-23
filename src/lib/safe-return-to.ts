/**
 * safeReturnTo — validate a user-supplied return URL before redirecting.
 *
 * Adapted from language-web/src/app/auth/login/route.ts.
 * Only allows same-origin relative paths or URLs whose origin is in
 * allowedOrigins. Returns null when the input is invalid so callers can
 * fall back to a safe default.
 *
 * Rules (mirrors language-web behaviour):
 * - null / empty input → return null
 * - Relative paths must start with "/" but not "//" (protocol-relative).
 * - Absolute URLs must have an origin present in allowedOrigins.
 * - Everything else → return null (caller uses its own default).
 */
export function safeReturnTo(
  input: string | null,
  allowedOrigins: string[],
): string | null {
  if (!input) {
    return null;
  }

  // Relative path — same checks as language-web's safeReturnTo.
  if (input.startsWith("/") && !input.startsWith("//")) {
    return input;
  }

  // Absolute URL — only allow if origin is whitelisted.
  try {
    const url = new URL(input);
    if (allowedOrigins.includes(url.origin)) {
      return input;
    }
  } catch {
    // Not a valid URL — fall through to null.
  }

  return null;
}
