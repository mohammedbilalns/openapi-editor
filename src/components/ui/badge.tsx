import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * DESIGN.md §9.3. `default`/`outline` are neutral meta chips, `secondary` is a
 * count badge, and the status variants are tinted chips (never solid fills).
 */
const badgeVariants = cva(
  "inline-flex h-5.5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded border border-transparent px-2 text-[11px] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-border/70 bg-muted/55 text-subtle-foreground",
        outline: "border-border/70 text-subtle-foreground",
        secondary:
          "h-auto rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-subtle-foreground",
        destructive: "bg-destructive/10 font-medium text-destructive-foreground",
        warning: "bg-warning/10 font-medium text-warning-foreground",
        success: "bg-success/10 font-medium text-success-foreground",
        info: "bg-info/10 font-medium text-info-foreground",
        ghost: "text-subtle-foreground hover:bg-accent",
        link: "text-muted-foreground underline-offset-4 hover:text-foreground hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      { className: cn(badgeVariants({ variant }), className) },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
