import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import {
  fieldClassName,
  menuItemClassName,
  popupSurfaceClassName,
} from "@/components/ui/recipes"
import { cn } from "@/lib/utils"

type SelectItemEntry = { value: unknown; label: React.ReactNode }

/** Collects `<SelectItem value>{label}</SelectItem>` descendants from the JSX tree. */
function collectItems(node: React.ReactNode, out: SelectItemEntry[] = []): SelectItemEntry[] {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement<{ value?: unknown; children?: React.ReactNode }>(child)) return
    if (child.type === SelectItem) {
      if (child.props.value !== undefined) {
        out.push({ value: child.props.value, label: child.props.children })
      }
      return
    }
    if (child.props.children) collectItems(child.props.children, out)
  })
  return out
}

type SelectProps<Value> = Omit<SelectPrimitive.Root.Props<Value>, "onValueChange"> & {
  /** Called with the newly selected value (never `null`, matching the previous Radix API). */
  onValueChange?: (value: Value, eventDetails: SelectPrimitive.Root.ChangeEventDetails) => void
}

/**
 * Base UI's `Select.Value` renders the raw value unless the root knows each
 * item's label, so labels are derived from the `SelectItem` children when no
 * `items` prop is given.
 */
function Select<Value = string>({ items, children, onValueChange, ...props }: SelectProps<Value>) {
  const derivedItems = React.useMemo(
    () => items ?? (collectItems(children) as { value: Value; label: React.ReactNode }[]),
    [items, children]
  )
  return (
    <SelectPrimitive.Root<Value>
      items={derivedItems}
      onValueChange={
        onValueChange
          ? (value, eventDetails) => {
              if (value !== null) onValueChange(value as Value, eventDetails)
            }
          : undefined
      }
      {...props}
    >
      {children}
    </SelectPrimitive.Root>
  )
}

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1", className)}
      {...props}
    />
  )
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 truncate text-left", className)}
      {...props}
    />
  )
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        fieldClassName,
        "flex w-fit cursor-pointer items-center justify-between gap-1.5 pr-2 pl-2.5 whitespace-nowrap select-none",
        "data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-md data-[size=sm]:text-xs",
        "data-popup-open:border-ring data-disabled:pointer-events-none data-disabled:opacity-64",
        "*:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={<ChevronDownIcon className="pointer-events-none size-3.5 text-muted-foreground" />}
      />
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  alignOffset = 0,
  alignItemWithTrigger = false,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            popupSurfaceClassName,
            "relative max-h-(--available-height) w-(--anchor-width) min-w-36 overflow-x-hidden overflow-y-auto p-1",
            className
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-2 py-1 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(menuItemClassName, "pr-7", className)}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex flex-1 shrink-0 items-center gap-1.5 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2 flex size-3.5 items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 text-muted-foreground [&_svg:not([class*='size-'])]:size-3.5",
        className
      )}
      {...props}
    >
      <ChevronUpIcon />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 text-muted-foreground [&_svg:not([class*='size-'])]:size-3.5",
        className
      )}
      {...props}
    >
      <ChevronDownIcon />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
