/** Shown while the saved document loads (BLUEPRINT §3): sidebar rows, empty main, no spinner. */
export function ShellSkeleton() {
  return (
    <div className="flex min-h-svh" aria-busy="true" aria-label="Loading the editor">
      <div className="hidden w-60 shrink-0 flex-col gap-2 border-r border-sidebar-border bg-sidebar p-2 md:flex xl:w-64">
        <div className="h-11" />
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="h-6 rounded-md bg-muted motion-safe:animate-pulse"
            style={{ width: `${88 - ((i * 17) % 40)}%` }}
          />
        ))}
      </div>
      <div className="flex-1 bg-background" />
    </div>
  )
}
