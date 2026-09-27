import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn("group/tabs flex gap-2 data-horizontal:flex-col", className)}
      {...props}
    />
  )
}

/**
 * `segmented` (default) is the view switcher from DESIGN.md §9.2;
 * `line` is the underline scene-tab variant.
 */
const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center text-muted-foreground group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        segmented: "h-8 gap-0.5 rounded-lg border border-border/80 bg-background p-0.5",
        line: "gap-1",
      },
    },
    defaultVariants: {
      variant: "segmented",
    },
  }
)

function TabsList({
  className,
  variant = "segmented",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex cursor-pointer items-center justify-center gap-1 rounded-md font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors duration-150",
        "focus-visible:ring-2 focus-visible:ring-ring",
        "data-disabled:pointer-events-none data-disabled:opacity-64",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        "group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start",
        // segmented item
        "group-data-[variant=segmented]/tabs-list:h-6 group-data-[variant=segmented]/tabs-list:px-2 group-data-[variant=segmented]/tabs-list:text-xs",
        "group-data-[variant=segmented]/tabs-list:hover:bg-accent/60 group-data-[variant=segmented]/tabs-list:hover:text-foreground",
        "group-data-[variant=segmented]/tabs-list:data-active:bg-accent group-data-[variant=segmented]/tabs-list:data-active:text-foreground",
        // underline item
        "group-data-[variant=line]/tabs-list:min-h-10 group-data-[variant=line]/tabs-list:px-3 group-data-[variant=line]/tabs-list:text-xs group-data-[variant=line]/tabs-list:font-normal",
        "group-data-[variant=line]/tabs-list:hover:bg-muted group-data-[variant=line]/tabs-list:data-active:text-foreground",
        "after:absolute after:inset-x-3 after:bottom-0 after:h-px after:bg-foreground after:opacity-0 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

/** Aliases for view switchers that aren't tied to tab panels (DESIGN.md §9.2). */
const SegmentedControl = Tabs
const SegmentedControlList = TabsList
const SegmentedControlItem = TabsTrigger

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  tabsListVariants,
  SegmentedControl,
  SegmentedControlList,
  SegmentedControlItem,
}
