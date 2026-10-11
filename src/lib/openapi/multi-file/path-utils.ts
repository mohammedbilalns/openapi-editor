/**
 * Relative path and reference utilities for multi-file OpenAPI projects.
 */

export interface ResolvedRef {
  filePath: string;
  fragment?: string;
}

/**
 * Resolves relative file path `targetPath` against the directory containing `fromFilePath`.
 * Strips any trailing `#...` fragment before resolving.
 */
export function resolveRelativePath(fromFilePath: string, targetPath: string): string {
  const [cleanTarget] = targetPath.split('#');
  const fromDir = fromFilePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
  const segments = [
    ...(fromDir ? fromDir.split('/') : []),
    ...cleanTarget.replace(/\\/g, '/').split('/'),
  ];
  const resolved: string[] = [];
  for (const seg of segments) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') {
      resolved.pop();
    } else {
      resolved.push(seg);
    }
  }
  return resolved.join('/');
}

/**
 * Resolves a reference string (with optional `#...` fragment) relative to `fromFilePath`.
 */
export function resolveRefPath(fromFilePath: string, ref: string): ResolvedRef {
  const hashIdx = ref.indexOf('#');
  const targetPath = hashIdx === -1 ? ref : ref.slice(0, hashIdx);
  const fragment = hashIdx === -1 ? undefined : ref.slice(hashIdx + 1);
  return {
    filePath: resolveRelativePath(fromFilePath, targetPath),
    fragment,
  };
}

/**
 * Derives a human-readable schema name from a file path.
 * e.g. "schemas/user-profile.json" -> "UserProfile"
 */
export function deriveSchemaName(filePath: string): string {
  const filename = filePath.split('/').pop() ?? 'Schema';
  const basename = filename.replace(/\.(yaml|yml|json)$/i, '');
  return basename
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * Calculates relative reference string from the directory of `fromEntryFile` to `targetFile`.
 * e.g. fromEntryFile = "openapi.yaml", targetFile = "schemas/user.yaml" -> "./schemas/user.yaml"
 */
export function makeRelativeRef(fromEntryFile: string, targetFile: string): string {
  const fromDir = fromEntryFile.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
  if (!fromDir) {
    return `./${targetFile.replace(/^\.?\//, '')}`;
  }
  const fromParts = fromDir.split('/').filter(Boolean);
  const targetParts = targetFile.replace(/^\.?\//, '').split('/').filter(Boolean);

  let common = 0;
  while (common < fromParts.length && common < targetParts.length && fromParts[common] === targetParts[common]) {
    common++;
  }

  const up = fromParts.length - common;
  const rel = [...Array(up).fill('..'), ...targetParts.slice(common)].join('/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}
