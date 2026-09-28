import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * DESIGN.md §9.1. Pressed states cover both `:active` and Base UI's
 * `[data-pressed]`; the dark-mode top highlight is a `::before` layer whose
 * shadow sits on the top border.
 */
const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border text-sm font-medium whitespace-nowrap outline-none select-none",
    "transition-[color,background-color,border-color,box-shadow,scale] duration-150 ease-standard",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-64 data-disabled:pointer-events-none data-disabled:opacity-64",
    "aria-invalid:border-destructive/36 aria-invalid:ring-2 aria-invalid:ring-destructive/16 dark:aria-invalid:ring-destructive/24",
    "before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)]",
    "pointer-coarse:after:absolute pointer-coarse:after:top-1/2 pointer-coarse:after:left-1/2 pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 pointer-coarse:after:-translate-1/2",
    "[&_svg]:pointer-events-none [&_svg]:-mx-0.5 [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default: [
          "border-primary bg-primary text-primary-foreground shadow-shine",
          "hover:border-primary/90 hover:bg-primary/90",
          "active:scale-[0.98] active:border-primary/85 active:bg-primary/85 active:shadow-xs active:duration-160 active:ease-snappy",
          "data-pressed:scale-[0.98] data-pressed:border-primary/85 data-pressed:bg-primary/85 data-pressed:shadow-xs",
          // §7: no transforms under reduced motion (press feedback keeps its colour change).
          "motion-reduce:active:scale-100 motion-reduce:data-pressed:scale-100",
        ],
        outline: [
          "border-border bg-background text-foreground shadow-xs/5",
          "dark:border-white/8 dark:bg-white/2.5 dark:before:shadow-edge",
          "hover:bg-accent/50 dark:hover:bg-accent/50",
          "active:bg-accent active:before:shadow-none dark:active:bg-accent",
          "data-pressed:bg-accent data-pressed:before:shadow-none dark:data-pressed:bg-accent",
          "data-popup-open:bg-accent/50 dark:data-popup-open:bg-accent/50",
        ],
        secondary: [
          "border-transparent bg-secondary text-secondary-foreground",
          "hover:bg-secondary/80 active:bg-accent data-pressed:bg-accent data-popup-open:bg-accent",
        ],
        ghost: [
          "border-transparent text-muted-foreground",
          "hover:bg-accent hover:text-foreground",
          "active:bg-accent/80 data-pressed:bg-accent/80 data-pressed:text-foreground",
          "data-popup-open:bg-accent data-popup-open:text-foreground",
        ],
        destructive: [
          "border-destructive bg-destructive text-white",
          "hover:border-destructive/90 hover:bg-destructive/90",
          "active:bg-destructive/85 data-pressed:bg-destructive/85",
          "focus-visible:ring-destructive/40",
        ],
        link: [
          "border-transparent text-muted-foreground underline-offset-4",
          "hover:text-foreground hover:underline",
        ],
      },
      size: {
        xs: "h-6 gap-1 rounded-md px-2 text-xs before:rounded-[calc(var(--radius-md)-1px)] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1.5 rounded-md px-2.5 text-xs before:rounded-[calc(var(--radius-md)-1px)] [&_svg:not([class*='size-'])]:size-3.5",
        default: "h-8 px-2.5",
        lg: "h-10 px-3.5",
        xl: "h-12 px-5",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-md before:rounded-[calc(var(--radius-md)-1px)] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-md before:rounded-[calc(var(--radius-md)-1px)] [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ButtonProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants>

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Button, buttonVariants, type ButtonProps }
