import type * as React from 'react'

/**
 * The app's glyph: braces around a path slash, `{/}`. One colour
 * (`currentColor`), drawn on Lucide's 24px grid with its 2px stroke so it sits
 * with the other 16px icons. `public/icon.svg` (the favicon) uses the same paths.
 */
export function WordmarkGlyph(props: React.ComponentProps<'svg'>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...props}
    >
      <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1" />
      <path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1" />
      <path d="M14 7.5l-4 9" />
    </svg>
  )
}
