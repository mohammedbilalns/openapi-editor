/**
 * Line index for generated YAML, built once per serialization so
 * the virtualized viewer can slice out only the lines it shows.
 */

export interface YamlLineIndex {
  /** `lineCount + 1` entries: line `i` is `yaml.slice(starts[i], starts[i + 1] - 1)`. */
  lineStarts: Uint32Array
  /** 1 where the line is the content of a block scalar (`|` / `>`), so it is all string. */
  blockFlags: Uint8Array
  lineCount: number
  /** Longest line in UTF-16 code units, for the horizontal scroll width. */
  maxLineLength: number
}

const SPACE = 32

/** A block scalar indicator at the end of a line: `|`, `>-`, `|+2`, optionally with a trailing comment. */
const INDICATOR_TAIL = /(?:^|\s)[|>][-+1-9]{0,2}(?:\s+#.*)?$/
const ENTRY = /^( *)((?:- +)*)(.*)$/

/**
 * Column that block content has to be indented past, or -1 when the line
 * doesn't start a block scalar (`key: |`, `- key: >-`, `- |`).
 */
export function blockScalarParentIndent(line: string): number {
  const last = line.trimEnd()
  if (last.length === 0) return -1
  // Cheap reject before the regex: a header ends with the indicator or a comment.
  const tail = last.charCodeAt(last.length - 1)
  const plausible =
    tail === 124 /* | */ ||
    tail === 62 /* > */ ||
    tail === 43 /* + */ ||
    tail === 45 /* - */ ||
    (tail >= 49 && tail <= 57) ||
    last.includes('#')
  if (!plausible) return -1
  const indicator = INDICATOR_TAIL.exec(last)
  if (!indicator) return -1
  // Keep the whitespace before the indicator so `- |` still reads as a dash entry.
  const headEnd = indicator.index + (indicator[0].length - indicator[0].trimStart().length)
  const [, indent, dashes, rest] = ENTRY.exec(last.slice(0, headEnd))!
  const body = rest.trimEnd()
  if (body.startsWith('#')) return -1
  // `- |`: the scalar is the sequence item itself, so content only has to pass the dash.
  if (body === '' && dashes.length > 0) return indent.length + dashes.trimEnd().lastIndexOf('-')
  // `key: |`, possibly after dashes: content has to pass the key's column.
  if (!body.endsWith(':')) return -1
  return indent.length + dashes.length
}

function indentOf(yaml: string, start: number, end: number): number {
  let i = start
  while (i < end && yaml.charCodeAt(i) === SPACE) i += 1
  return i === end ? -1 : i - start // -1: blank line
}

/** Last non-space character code of `yaml[start, end)`, or -1 for a blank line. */
function lastCharCode(yaml: string, start: number, end: number): number {
  let i = end - 1
  while (i >= start) {
    const code = yaml.charCodeAt(i)
    if (code !== SPACE && code !== 13 /* CR */ && code !== 9 /* tab */) return code
    i -= 1
  }
  return -1
}

function mayStartBlock(tail: number): boolean {
  return tail === 124 /* | */ || tail === 62 /* > */ || tail === 43 /* + */ || tail === 45 /* - */ || (tail >= 49 && tail <= 57)
}

export function buildLineIndex(yaml: string): YamlLineIndex {
  // Line starts via indexOf (native, much faster than a charCodeAt loop on MBs of text).
  let starts = new Uint32Array(Math.max(16, (yaml.length >>> 5) + 16))
  let lineCount = 0
  let pos = 0
  while (pos < yaml.length) {
    if (lineCount + 2 > starts.length) {
      const grown = new Uint32Array(starts.length * 2)
      grown.set(starts)
      starts = grown
    }
    starts[lineCount++] = pos
    const newline = yaml.indexOf('\n', pos)
    pos = newline === -1 ? yaml.length + 1 : newline + 1
  }
  if (lineCount === 0) starts[lineCount++] = 0 // empty text: one empty line
  // Sentinel: one past the last line's (possibly virtual) newline.
  starts[lineCount] = pos === yaml.length ? yaml.length : Math.max(pos, yaml.length + 1)
  const lineStarts = starts.slice(0, lineCount + 1)

  const blockFlags = new Uint8Array(lineCount)
  let maxLineLength = 0
  let blockParent = -1
  // Next `#` at or after the current line, maintained monotonically (a line with a
  // comment can hide the block indicator before it).
  let nextHash = yaml.indexOf('#')
  for (let i = 0; i < lineCount; i += 1) {
    const start = lineStarts[i]
    const end = lineStarts[i + 1] - 1
    const length = end - start
    if (length > maxLineLength) maxLineLength = length

    if (blockParent >= 0) {
      const indent = indentOf(yaml, start, end)
      if (indent === -1 || indent > blockParent) {
        blockFlags[i] = 1
        continue
      }
      blockParent = -1
    }
    if (nextHash !== -1 && nextHash < start) nextHash = yaml.indexOf('#', start)
    const hasHash = nextHash !== -1 && nextHash < end
    if (!hasHash && !mayStartBlock(lastCharCode(yaml, start, end))) continue
    blockParent = blockScalarParentIndent(yaml.slice(start, end))
  }

  return { lineStarts, blockFlags, lineCount, maxLineLength }
}

export function getLine(yaml: string, index: YamlLineIndex, line: number): string {
  const text = yaml.slice(index.lineStarts[line], index.lineStarts[line + 1] - 1)
  return text.endsWith('\r') ? text.slice(0, -1) : text
}
