import * as React from 'react'
import { cn } from '@/lib/utils'

type IconComponent = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>

/**
 * An icon slot. Pass a lucide component (`icon={Braces}`) so the primitive can
 * size it per DESIGN.md §8, or an element when it needs its own props.
 */
export type IconProp = IconComponent | React.ReactElement<{ className?: string; 'aria-hidden'?: boolean }>

export function renderIcon(icon: IconProp | undefined, className: string): React.ReactNode {
  if (!icon) return null
  if (React.isValidElement<{ className?: string; 'aria-hidden'?: boolean }>(icon)) {
    return React.cloneElement(icon, {
      className: cn(className, icon.props.className),
      'aria-hidden': true,
    })
  }
  // Not an element, so it is the component half of the union.
  const Icon = icon as IconComponent
  return <Icon className={className} aria-hidden />
}
