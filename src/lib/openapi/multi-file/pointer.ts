/**
 * RFC 6901 JSON Pointer encoding, decoding, and evaluation utilities.
 */

/**
 * Decodes a JSON Pointer token according to RFC 6901:
 * `~1` -> `/`, `~0` -> `~`
 */
export function decodeJsonPointerToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Encodes a JSON Pointer token according to RFC 6901:
 * `~` -> `~0`, `/` -> `~1`
 */
export function encodeJsonPointerToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Resolves a JSON Pointer (RFC 6901) against data.
 * Supports fragments like `#/components/schemas/User` or `#/~1auth~1login`.
 */
export function resolveJsonPointer(data: unknown, pointer: string): unknown {
  if (!pointer || pointer === '#' || pointer === '') {
    return data;
  }
  const clean = pointer.startsWith('#') ? pointer.slice(1) : pointer;
  if (!clean.startsWith('/')) {
    if (data && typeof data === 'object' && clean in (data as Record<string, unknown>)) {
      return (data as Record<string, unknown>)[clean];
    }
    return undefined;
  }

  const tokens = clean
    .split('/')
    .slice(1)
    .map(decodeJsonPointerToken);

  let current: unknown = data;
  for (const token of tokens) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    if (Array.isArray(current)) {
      const idx = Number.parseInt(token, 10);
      if (Number.isNaN(idx) || idx < 0 || idx >= current.length) {
        return undefined;
      }
      current = current[idx];
    } else {
      current = (current as Record<string, unknown>)[token];
    }
  }
  return current;
}
