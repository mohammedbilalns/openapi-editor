import type * as React from "react"
import { fieldClassName } from "@/components/ui/recipes"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldClassName, "flex min-h-16 px-2.5 py-2", className)}
      {...props}
    />
  )
}

export { Textarea }
