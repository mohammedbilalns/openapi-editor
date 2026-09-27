import { cn } from "@/lib/utils"

/**
 * Shared class recipes for primitives (DESIGN.md §6, §9.7, §9.8).
 */

/** Text field surface (§9.8). In dark mode the lit top edge is an inset shadow. */
export const fieldClassName = cn(
  "w-full min-w-0 rounded-lg border border-input bg-background text-sm text-foreground shadow-xs/5 outline-none",
  "transition-[color,box-shadow,border-color] duration-150 ease-standard",
  "placeholder:text-muted-foreground dark:shadow-edge-inset",
  "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/24 dark:focus-visible:ring-ring/48 dark:focus-visible:shadow-none",
  "aria-invalid:border-destructive/36 aria-invalid:ring-2 aria-invalid:ring-destructive/16 dark:aria-invalid:ring-destructive/24 dark:aria-invalid:shadow-none",
  "disabled:pointer-events-none disabled:opacity-64 dark:disabled:shadow-none"
)

/** Floating surface for popovers, menus, selects and tooltips (§6 "Popover"). */
export const popupSurfaceClassName = cn(
  "z-50 origin-(--transform-origin) rounded-lg border border-border bg-popover text-popover-foreground shadow-lg outline-none",
  "duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
  "data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
  "motion-reduce:data-open:zoom-in-100 motion-reduce:data-closed:zoom-out-100"
)

/** List row / menu item (§9.7). */
export const menuItemClassName = cn(
  "relative flex w-full cursor-default items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground outline-none select-none transition-colors duration-150",
  "hover:bg-accent/60 hover:text-foreground data-highlighted:bg-accent/60 data-highlighted:text-foreground",
  "data-selected:bg-accent data-selected:text-foreground",
  "data-disabled:pointer-events-none data-disabled:opacity-64",
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5"
)

/** Modal scrim (§9.20). */
export const scrimClassName = cn(
  "fixed inset-0 isolate z-50 bg-black/40 supports-backdrop-filter:backdrop-blur-[2px]",
  "transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0"
)
