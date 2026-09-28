import { describe, expect, it } from 'vitest'
import { plainTextSummary } from './plain-text'

describe('plainTextSummary', () => {
  it('removes emphasis, code and links', () => {
    expect(plainTextSummary('A realistic pet store. Supports **markdown**.')).toBe(
      'A realistic pet store. Supports markdown.',
    )
    expect(plainTextSummary('Use *this* or __that__ with `code` and ~~old~~.')).toBe(
      'Use this or that with code and old.',
    )
    expect(plainTextSummary('See [the docs](https://example.com) ![logo](x.png)')).toBe('See the docs logo')
  })

  it('keeps snake_case and plain asterisks', () => {
    expect(plainTextSummary('Filter by pet_id and owner_id, 2 * 3')).toBe('Filter by pet_id and owner_id, 2 * 3')
  })

  it('keeps the first paragraph on one line, without block syntax or HTML', () => {
    expect(plainTextSummary('# Pets API\nManages <b>pets</b>.\n\nSecond paragraph.')).toBe('Pets API Manages pets.')
    expect(plainTextSummary('- one\n- two')).toBe('one two')
  })
})
