import { describe, expect, it } from 'vitest'
import { buildLineIndex, getLine } from '@/lib/openapi/analysis/yaml-lines'
import { tokenizeYamlLine, type YamlToken, type YamlTokenType } from './yaml-tokenizer'

/** Tokens without whitespace, as `type:text` strings, for compact assertions. */
function tokens(line: string, inBlock = false): string[] {
  return tokenizeYamlLine(line, inBlock)
    .filter(([type]) => type !== 'ws')
    .map(([type, text]) => `${type}:${text}`)
}

function typeOf(line: string, text: string): YamlTokenType | undefined {
  return tokenizeYamlLine(line).find((token: YamlToken) => token[1] === text)?.[0]
}

describe('tokenizeYamlLine', () => {
  it('reassembles the original line exactly', () => {
    const lines = [
      '    description: "Returns: a pet # not a comment"  # real comment',
      "  - 'it''s: quoted'",
      '      $ref: "#/components/schemas/Pet"',
      '  enum: [available, pending, 3, true]',
      '  example: { id: 1, name: "Rex" }',
    ]
    for (const line of lines) {
      expect(tokenizeYamlLine(line).map(([, text]) => text).join('')).toBe(line)
    }
  })

  it('classifies keys, strings, numbers, booleans and nulls', () => {
    expect(tokens('  title: Petstore')).toEqual(['key:title', 'punct::', 'string:Petstore'])
    expect(tokens('  minimum: -1.5e3')).toEqual(['key:minimum', 'punct::', 'number:-1.5e3'])
    expect(tokens('  maxLength: 0x1F')).toEqual(['key:maxLength', 'punct::', 'number:0x1F'])
    expect(tokens('  required: true')).toEqual(['key:required', 'punct::', 'boolean:true'])
    expect(tokens('  default: null')).toEqual(['key:default', 'punct::', 'null:null'])
    expect(tokens('  version: 1.0.0')).toEqual(['key:version', 'punct::', 'string:1.0.0'])
    expect(tokens("  '200':")).toEqual(["key:'200'", 'punct::'])
  })

  it('keeps colons and hashes inside quoted strings', () => {
    expect(tokens('  summary: "Find pet: by id # 1"')).toEqual([
      'key:summary',
      'punct::',
      'string:"Find pet: by id # 1"',
    ])
    expect(tokens("  summary: 'it''s: fine' # trailing")).toEqual([
      'key:summary',
      'punct::',
      "string:'it''s: fine'",
      'comment:# trailing',
    ])
  })

  it('treats a quoted key containing a colon as a key', () => {
    expect(tokens('  "x-a: b": value')).toEqual(['key:"x-a: b"', 'punct::', 'string:value'])
  })

  it('does not split plain scalars on colons without a following space', () => {
    expect(tokens('  - url: https://api.example.com:8080/v1')).toEqual([
      'punct:-',
      'key:url',
      'punct::',
      'string:https://api.example.com:8080/v1',
    ])
    expect(tokens('  - https://example.com')).toEqual(['punct:-', 'string:https://example.com'])
  })

  it('only starts comments at a # preceded by whitespace', () => {
    expect(tokens('  color: blue#1')).toEqual(['key:color', 'punct::', 'string:blue#1'])
    expect(tokens('  color: blue #1')).toEqual(['key:color', 'punct::', 'string:blue', 'comment:#1'])
    expect(tokens('# top comment: with colon')).toEqual(['comment:# top comment: with colon'])
  })

  it('marks $ref values, quoted or not', () => {
    expect(typeOf("      $ref: '#/components/schemas/Pet'", "'#/components/schemas/Pet'")).toBe('ref')
    expect(typeOf('      $ref: "#/components/schemas/Pet"', '"#/components/schemas/Pet"')).toBe('ref')
    // Unquoted, `#` after a space starts a comment in YAML (which is why emitters quote refs).
    expect(typeOf('      $ref: #/x', '#/x')).toBe('comment')
  })

  it('handles block scalar headers and their content lines', () => {
    expect(tokens('  description: |-')).toEqual(['key:description', 'punct::', 'punct:|-'])
    expect(tokens('  description: >')).toEqual(['key:description', 'punct::', 'punct:>'])
    // Content lines are strings even when they look like keys or comments.
    expect(tokens('    key: value # not a comment', true)).toEqual(['string:key: value # not a comment'])
  })

  it('tokenizes flow collections', () => {
    expect(tokens('  enum: [available, 3, true, "a, b"]')).toEqual([
      'key:enum',
      'punct::',
      'punct:[',
      'string:available',
      'punct:,',
      'number:3',
      'punct:,',
      'boolean:true',
      'punct:,',
      'string:"a, b"',
      'punct:]',
    ])
    expect(tokens('  example: { id: 1 }')).toEqual(['key:example', 'punct::', 'punct:{', 'key:id', 'punct::', 'number:1', 'punct:}'])
  })
})

describe('buildLineIndex', () => {
  it('flags block scalar content by indentation, including under sequence items', () => {
    const yaml = [
      'info:',
      '  description: |',
      '    First line: not a key',
      '',
      '    # not a comment',
      '  version: 1.0.0',
      'tags:',
      '  - description: >-',
      '      Folded',
      '    name: pets',
      '  - |',
      '    item text',
      "  - 'x: |'",
      '  - name: plain',
      '',
    ].join('\n')
    const index = buildLineIndex(yaml)
    expect(index.lineCount).toBe(14)
    const flagged = [...index.blockFlags].flatMap((flag, i) => (flag ? [getLine(yaml, index, i)] : []))
    expect(flagged).toEqual(['    First line: not a key', '', '    # not a comment', '      Folded', '    item text'])
    expect(getLine(yaml, index, 13)).toBe('  - name: plain')
    expect(index.maxLineLength).toBe('    First line: not a key'.length)
  })

  it('handles text without a trailing newline', () => {
    const index = buildLineIndex('a: 1\nb: 2')
    expect(index.lineCount).toBe(2)
    expect(getLine('a: 1\nb: 2', index, 1)).toBe('b: 2')
  })
})
