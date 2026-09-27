import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('merges conflicting Tailwind classes, last one wins', () => {
    const hidden: boolean = false
    expect(cn('px-2 py-1', 'px-4', hidden && 'hidden', { 'text-sm': true })).toBe('py-1 px-4 text-sm')
  })
})
