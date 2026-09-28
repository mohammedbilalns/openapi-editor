/**
 * A Markdown description as one plain line (the overview header): its first
 * paragraph with the Markdown syntax removed ("Supports **markdown**." →
 * "Supports markdown."). The result is rendered as text, never as HTML.
 */
export function plainTextSummary(markdown: string): string {
  const firstParagraph = markdown.trim().split(/\n\s*\n/)[0] ?? ''
  return (
    firstParagraph
      .replace(/```[^\n]*\n?/g, '') // code fences
      .replace(/<[^>]*>/g, '') // inline HTML tags
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images → alt text
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → text
      .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, '') // headings, quotes, list markers
      .replace(/`([^`]*)`/g, '$1') // inline code
      .replace(/(\*\*|__|~~)(?=\S)(.+?)(?<=\S)\1/g, '$2') // bold, strikethrough
      // italics; `_` inside words (snake_case) is left alone
      .replace(/(^|[^\w*])([*_])(?=\S)(.+?)(?<=\S)\2(?![\w*])/g, '$1$3')
      .replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, '$1') // backslash escapes
      .replace(/\s+/g, ' ')
      .trim()
  )
}
