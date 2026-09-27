import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { CheckIcon, MinusIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/** DESIGN.md §9.8: 16px, 4px radius, primary fill when checked. */
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border border-input bg-background text-primary-foreground shadow-xs/5 outline-none transition-colors duration-150",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        "aria-invalid:border-destructive/36 aria-invalid:ring-2 aria-invalid:ring-destructive/16",
        "data-checked:border-primary data-checked:bg-primary data-indeterminate:border-primary data-indeterminate:bg-primary",
        "data-disabled:cursor-not-allowed data-disabled:opacity-64",
        "pointer-coarse:after:absolute pointer-coarse:after:top-1/2 pointer-coarse:after:left-1/2 pointer-coarse:after:size-11 pointer-coarse:after:-translate-1/2",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="group/indicator grid place-content-center text-current [&>svg]:size-3"
        render={(indicatorProps, state) => (
          <span {...indicatorProps}>
            {state.indeterminate ? <MinusIcon strokeWidth={2.5} /> : <CheckIcon strokeWidth={2.5} />}
          </span>
        )}
      />
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
