/**
 * Shown while the saved document loads (BLUEPRINT §3): the sidebar with 8 muted
 * rows, an empty top bar and main. No spinner; the pulse stops under reduced motion.
 */
export function ShellSkeleton() {
  return (
    <div className="flex h-svh bg-background" aria-busy="true" aria-label="Loading the editor">
      <div className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-2 md:flex xl:w-64">
        <div className="h-11" />
        <div className="h-[50px] rounded-lg border border-sidebar-border bg-background/40" />
        <div className="mt-2 h-8 rounded-lg border border-input" />
        <div className="mt-3 flex flex-col gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <div
              // Static placeholder rows; order never changes.
              // oxlint-disable-next-line react/no-array-index-key
              key={i}
              className="h-5 rounded-md bg-muted motion-safe:animate-pulse"
              style={{ width: `${88 - ((i * 17) % 40)}%` }}
            />
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="h-11 shrink-0 border-b border-border" />
        <div className="flex-1" />
      </div>
    </div>
  )
}
