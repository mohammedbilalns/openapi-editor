/**
 * Single-line YAML tokenizer for the generated-YAML viewer (DESIGN.md §9.19).
 * It only has to be right for what a YAML emitter produces, line by line; block
 * scalar context comes from the precomputed line index (`blockFlags`).
 */

export type YamlTokenType =
  | 'ws'
  | 'key'
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'ref'
  | 'comment'
  | 'punct'
  | 'plain'

export type YamlToken = readonly [type: YamlTokenType, text: string]

const NUMBER =
  /^(?:[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?|0o[0-7]+|0x[0-9a-fA-F]+|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/
const BOOLEAN = /^(?:true|True|TRUE|false|False|FALSE)$/
const NULL = /^(?:null|Null|NULL|~)$/
const BLOCK_INDICATOR = /^[|>][-+1-9]{0,2}(?=\s|$)/

function classifyScalar(text: string, isRef: boolean): YamlTokenType {
  if (isRef) return 'ref'
  if (NUMBER.test(text)) return 'number'
  if (BOOLEAN.test(text)) return 'boolean'
  if (NULL.test(text)) return 'null'
  return 'string'
}

/** End index (exclusive) of a quoted scalar starting at `start`, or the line end when unterminated. */
function quotedEnd(line: string, start: number): number {
  const quote = line[start]
  let i = start + 1
  while (i < line.length) {
    const ch = line[i]
    if (quote === '"' && ch === '\\') {
      i += 2
      continue
    }
    if (ch === quote) {
      if (quote === "'" && line[i + 1] === "'") {
        i += 2
        continue
      }
      return i + 1
    }
    i += 1
  }
  return line.length
}

/** Index of a `#` that starts a comment (preceded by whitespace), from `from`. */
function commentStart(line: string, from: number): number {
  for (let i = from; i < line.length; i += 1) {
    if (line[i] === '#' && (i === 0 || line[i - 1] === ' ' || line[i - 1] === '\t')) return i
  }
  return -1
}

/** If a mapping key starts at `start`, the index of its `:` indicator; else -1. */
function keyColon(line: string, start: number): number {
  const first = line[start]
  if (first === '"' || first === "'") {
    let i = quotedEnd(line, start)
    while (line[i] === ' ') i += 1
    return line[i] === ':' && (i + 1 === line.length || line[i + 1] === ' ') ? i : -1
  }
  if (first === '#' || first === '[' || first === '{' || first === '|' || first === '>' || first === '&' || first === '*' || first === '!') {
    return -1
  }
  for (let i = start; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '#' && line[i - 1] === ' ') return -1
    if (ch === ':' && (i + 1 === line.length || line[i + 1] === ' ')) return i
  }
  return -1
}

function pushWs(out: YamlToken[], text: string) {
  if (text) out.push(['ws', text])
}

/** Tokens for a value (after `key: `, after `- `, or a bare scalar line). */
function tokenizeValue(line: string, start: number, isRef: boolean, out: YamlToken[]) {
  let i = start
  let first = true
  while (i < line.length) {
    const ch = line[i]
    if (ch === ' ' || ch === '\t') {
      let j = i
      while (j < line.length && (line[j] === ' ' || line[j] === '\t')) j += 1
      pushWs(out, line.slice(i, j))
      i = j
      continue
    }
    if (ch === '#' && (i === 0 || line[i - 1] === ' ' || line[i - 1] === '\t')) {
      out.push(['comment', line.slice(i)])
      return
    }
    if (ch === '"' || ch === "'") {
      const end = quotedEnd(line, i)
      out.push([isRef ? 'ref' : 'string', line.slice(i, end)])
      i = end
      continue
    }
    if (ch === '&' || ch === '*' || ch === '!') {
      let j = i
      while (j < line.length && line[j] !== ' ') j += 1
      out.push(['plain', line.slice(i, j)])
      i = j
      continue
    }
    const block = first ? BLOCK_INDICATOR.exec(line.slice(i)) : null
    first = false
    if (block) {
      out.push(['punct', block[0]])
      i += block[0].length
      continue
    }
    if (ch === '[' || ch === '{') {
      tokenizeFlow(line, i, out)
      return
    }
    // Plain scalar: up to a comment.
    const comment = commentStart(line, i)
    const end = comment === -1 ? line.length : comment
    const raw = line.slice(i, end)
    const text = raw.trimEnd()
    out.push([classifyScalar(text, isRef), text])
    pushWs(out, raw.slice(text.length))
    i = end
  }
}

/** Flow collections (`[a, b]`, `{ a: 1 }`): brackets and commas muted, scalars classified. */
function tokenizeFlow(line: string, start: number, out: YamlToken[]) {
  let i = start
  let expectKey = false
  while (i < line.length) {
    const ch = line[i]
    if (ch === '[' || ch === ']' || ch === '{' || ch === '}' || ch === ',') {
      out.push(['punct', ch])
      expectKey = ch === '{' || (ch === ',' && isInMapping(out))
      i += 1
      continue
    }
    if (ch === ' ') {
      let j = i
      while (line[j] === ' ') j += 1
      pushWs(out, line.slice(i, j))
      i = j
      continue
    }
    if (ch === '#' && line[i - 1] === ' ') {
      out.push(['comment', line.slice(i)])
      return
    }
    if (ch === ':') {
      out.push(['punct', ':'])
      i += 1
      expectKey = false
      continue
    }
    let end: number
    if (ch === '"' || ch === "'") {
      end = quotedEnd(line, i)
    } else {
      end = i
      while (end < line.length && !',[]{}'.includes(line[end]) && !(line[end] === ':' && (line[end + 1] === ' ' || line[end + 1] === undefined || ',]}'.includes(line[end + 1])))) end += 1
    }
    const raw = line.slice(i, end)
    const text = raw.trimEnd()
    let j = end
    while (line[j] === ' ') j += 1
    const isKey = expectKey || line[j] === ':'
    const quoted = ch === '"' || ch === "'"
    out.push([isKey ? 'key' : quoted ? 'string' : classifyScalar(text, false), text])
    pushWs(out, raw.slice(text.length))
    i = end
  }
}

function isInMapping(out: YamlToken[]): boolean {
  let depth = 0
  for (let k = out.length - 1; k >= 0; k -= 1) {
    const [type, text] = out[k]
    if (type !== 'punct') continue
    if (text === '}' || text === ']') depth += 1
    else if (text === '{' || text === '[') {
      if (depth === 0) return text === '{'
      depth -= 1
    }
  }
  return false
}

/** Tokenizes one line. `inBlock`: the line is block-scalar content (all string). */
export function tokenizeYamlLine(line: string, inBlock = false): YamlToken[] {
  const out: YamlToken[] = []
  let i = 0
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i += 1
  pushWs(out, line.slice(0, i))
  if (i === line.length) return out

  if (inBlock) {
    out.push(['string', line.slice(i)])
    return out
  }
  if (line[i] === '#') {
    out.push(['comment', line.slice(i)])
    return out
  }
  if (i === 0 && (line.startsWith('---') || line.startsWith('...')) && (line.length === 3 || line[3] === ' ')) {
    out.push(['punct', line.slice(0, 3)])
    tokenizeValue(line, 3, false, out)
    return out
  }

  // Sequence entries: "- ", possibly nested ("- - a").
  while (line[i] === '-' && (i + 1 === line.length || line[i + 1] === ' ')) {
    out.push(['punct', '-'])
    let j = i + 1
    while (line[j] === ' ') j += 1
    pushWs(out, line.slice(i + 1, j))
    i = j
  }
  if (i === line.length) return out

  const colon = keyColon(line, i)
  if (colon === -1) {
    tokenizeValue(line, i, false, out)
    return out
  }
  const keyRaw = line.slice(i, colon)
  const key = keyRaw.trimEnd()
  out.push(['key', key])
  pushWs(out, keyRaw.slice(key.length))
  out.push(['punct', ':'])
  const unquoted = key.startsWith('"') || key.startsWith("'") ? key.slice(1, -1) : key
  tokenizeValue(line, colon + 1, unquoted === '$ref', out)
  return out
}

// ---------------------------------------------------------------------------
// LRU cache

const CACHE_LIMIT = 2000
const cache = new Map<string, YamlToken[]>()

/** `tokenizeYamlLine` with a small LRU cache (visible lines are re-tokenized on every scroll frame otherwise). */
export function tokenizeYamlLineCached(line: string, inBlock: boolean): YamlToken[] {
  const key = inBlock ? `\u0001${line}` : line
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const tokens = tokenizeYamlLine(line, inBlock)
  cache.set(key, tokens)
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!)
  return tokens
}
