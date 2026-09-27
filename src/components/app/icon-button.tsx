import type * as React from 'react'
import { Kbd } from '@/components/shared'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export type IconButtonProps = Omit<ButtonProps, 'aria-label'> & {
  /** Accessible name and tooltip text. */
  label: string
  /** Shortcut shown in the tooltip. */
  keys?: readonly string[]
  children?: React.ReactNode
}

/**
 * Ghost 28×28 icon button with a tooltip (§9.21, §12). Spreads extra props onto
 * the button, so it can be a menu trigger's `render` element.
 */
export function IconButton({ label, keys, children, variant = 'ghost', size = 'icon-sm', ...props }: IconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant={variant} size={size} aria-label={label} {...props} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {keys && <Kbd keys={keys} />}
      </TooltipContent>
    </Tooltip>
  )
}
