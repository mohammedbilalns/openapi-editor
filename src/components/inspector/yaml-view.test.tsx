import { render, screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildLineIndex } from '@/lib/openapi/analysis/yaml-lines'
import { YamlView } from './yaml-view'

// jsdom has no layout; give scroll containers a viewport so the virtualizer has a window.
const descriptors = {
  offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight'),
  offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth'),
}
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 600 })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 400 })
})
afterAll(() => {
  if (descriptors.offsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', descriptors.offsetHeight)
  if (descriptors.offsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', descriptors.offsetWidth)
})

describe('YamlView', () => {
  it('renders only a window of lines for a 50k-line document, with no line cap', () => {
    const lines = Array.from({ length: 50_000 }, (_, i) => `key${i}: value ${i}`)
    const yaml = `${lines.join('\n')}\n`
    render(<YamlView result={{ yaml, ...buildLineIndex(yaml) }} />)

    const region = screen.getByRole('region', { name: 'Generated YAML' })
    const rendered = region.querySelectorAll('[data-line]')
    expect(rendered.length).toBeGreaterThan(0)
    expect(rendered.length).toBeLessThan(200)
    expect(rendered[0]).toHaveTextContent('1key0: value 0')

    // The scroll height covers every line (20px each + 24px padding), so nothing is truncated.
    const inner = region.firstElementChild as HTMLElement
    expect(inner.style.height).toBe(`${50_000 * 20 + 24}px`)
  })

  it('colours tokens with the §9.19 classes', () => {
    const yaml = 'openapi: 3.0.3\ninfo:\n  title: "Pet: store"\n  deprecated: false\n'
    render(<YamlView result={{ yaml, ...buildLineIndex(yaml) }} />)
    expect(screen.getByText('openapi')).toHaveClass('text-foreground', 'font-medium')
    expect(screen.getByText('"Pet: store"')).toHaveClass('text-success-foreground')
    expect(screen.getByText('false')).toHaveClass('text-info-foreground')
    expect(screen.getByText('3.0.3')).toHaveClass('text-success-foreground')
  })
})
