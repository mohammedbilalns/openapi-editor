import * as React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { getLine, type SerializeResult } from '@/lib/openapi/analysis'
import { cn } from '@/lib/utils'
import { tokenizeYamlLineCached, type YamlTokenType } from './yaml-tokenizer'

/** Fixed line height (DESIGN.md §9.19: 12.5px / 20px). */
export const YAML_LINE_HEIGHT = 20
const PADDING_Y = 12

/** Monochrome syntax colours, DESIGN.md §9.19 / BLUEPRINT §3 Inspector. */
const TOKEN_CLASS: Record<YamlTokenType, string | undefined> = {
  ws: undefined,
  key: 'text-foreground font-medium',
  string: 'text-success-foreground',
  number: 'text-info-foreground',
  boolean: 'text-info-foreground',
  null: 'text-info-foreground',
  ref: 'text-foreground/85',
  comment: 'text-muted-foreground',
  punct: 'text-muted-foreground',
  plain: 'text-foreground/85',
}

type YamlLineProps = {
  text: string
  inBlock: boolean
  number: number
  top: number
  gutterWidth: string
}

const YamlLine = React.memo(function YamlLine({ text, inBlock, number, top, gutterWidth }: YamlLineProps) {
  const tokens = tokenizeYamlLineCached(text, inBlock)
  return (
    <div
      data-line={number}
      className="absolute left-0 flex w-full"
      style={{ height: YAML_LINE_HEIGHT, transform: `translateY(${top}px)` }}
    >
      <span
        aria-hidden
        className="sticky left-0 shrink-0 bg-code pr-3 pl-3 text-right text-muted-foreground/60 select-none"
        style={{ width: gutterWidth }}
      >
        {number}
      </span>
      <span className="pr-3 whitespace-pre">
        {tokens.map(([type, value], i) => {
          const className = TOKEN_CLASS[type]
          return className ? (
            // Tokens have no identity beyond their position in the line.
            // oxlint-disable-next-line react/no-array-index-key
            <span key={i} className={className}>
              {value}
            </span>
          ) : (
            value
          )
        })}
        {tokens.length === 0 && ' '}
      </span>
    </div>
  )
})

export type YamlViewProps = {
  result: SerializeResult
  className?: string
}

/**
 * Virtualized, syntax-coloured YAML with a line-number gutter. Only the lines
 * in view (plus overscan) are sliced out of the string and tokenized, so a
 * 100k-line document costs the same to scroll as a short one.
 */
export const YamlView = React.memo(function YamlView({ result, className }: YamlViewProps) {
  const scrollRef = React.useRef<HTMLElement>(null)
  const { yaml, lineCount, blockFlags, maxLineLength } = result

  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: lineCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => YAML_LINE_HEIGHT,
    overscan: 24,
    paddingStart: PADDING_Y,
    paddingEnd: PADDING_Y,
    initialRect: { width: 0, height: 600 },
  })

  const digits = String(lineCount).length
  // Gutter: digits plus pl-3 + pr-3 (1.5rem). Content: longest line plus pr-3.
  const gutterWidth = `calc(${Math.max(digits, 2)}ch + 1.5rem)`
  const contentWidth = `calc(${Math.max(digits, 2)}ch + 2.25rem + ${maxLineLength}ch)`

  return (
    <section
      ref={scrollRef}
      aria-label="Generated YAML"
      // The region scrolls; keyboard users need to be able to focus it.
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      className={cn(
        'h-full overflow-auto bg-code font-mono text-[12.5px] leading-5 text-code-foreground [tab-size:2] outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        className,
      )}
    >
      <div
        className="relative"
        style={{ height: virtualizer.getTotalSize(), width: contentWidth, minWidth: '100%' }}
      >
        {virtualizer.getVirtualItems().map((item) => (
          <YamlLine
            key={item.index}
            text={getLine(yaml, result, item.index)}
            inBlock={blockFlags[item.index] === 1}
            number={item.index + 1}
            top={item.start}
            gutterWidth={gutterWidth}
          />
        ))}
      </div>
    </section>
  )
})
