'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown, Link2, Box } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { SchemaNode } from '@/lib/openapi/types';

interface SchemaOption {
  value: string;
  label: string;
  isRef?: boolean;
}

interface SchemaComboboxProps {
  value: string | null;
  onValueChange: (value: string) => void;
  schemas: SchemaNode[];
  placeholder?: string;
  includeNone?: boolean;
  noneLabel?: string;
  includeInline?: boolean;
  inlineLabel?: string;
  className?: string;
  triggerClassName?: string;
}

export function SchemaCombobox({
  value,
  onValueChange,
  schemas,
  placeholder = 'Select schema...',
  includeNone = false,
  noneLabel = 'No body',
  includeInline = false,
  inlineLabel = 'Inline Object',
  className,
  triggerClassName,
}: SchemaComboboxProps) {
  const [open, setOpen] = useState(false);

  // Build options list
  const options: SchemaOption[] = [];
  
  if (includeNone) {
    options.push({ value: 'none', label: noneLabel, isRef: false });
  }
  
  if (includeInline) {
    options.push({ value: 'inline', label: inlineLabel, isRef: false });
  }
  
  schemas.forEach((s) => {
    options.push({ value: s.id, label: s.name || 'Unnamed', isRef: true });
  });

  // Get display label for current value
  const getDisplayLabel = () => {
    if (!value || value === 'none') return includeNone ? noneLabel : placeholder;
    if (value === 'inline') return inlineLabel;
    const schema = schemas.find((s) => s.id === value);
    return schema?.name || 'Unnamed';
  };

  const isRef = value && value !== 'none' && value !== 'inline';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between bg-transparent', triggerClassName)}
        >
          <span className="flex items-center gap-2 truncate">
            {isRef && <Link2 className="h-3 w-3 shrink-0" />}
            {value === 'inline' && <Box className="h-3 w-3 shrink-0" />}
            <span className="truncate">{getDisplayLabel()}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn('w-[250px] p-0', className)} align="start">
        <Command>
          <CommandInput placeholder="Search schemas..." />
          <CommandList>
            <CommandEmpty>No schema found.</CommandEmpty>
            {(includeNone || includeInline) && (
              <CommandGroup heading="Options">
                {includeNone && (
                  <CommandItem
                    value={noneLabel}
                    onSelect={() => {
                      onValueChange('none');
                      setOpen(false);
                    }}
                  >
                    {noneLabel}
                    {value === 'none' && <Check className="ml-auto h-4 w-4" />}
                  </CommandItem>
                )}
                {includeInline && (
                  <CommandItem
                    value={inlineLabel}
                    onSelect={() => {
                      onValueChange('inline');
                      setOpen(false);
                    }}
                  >
                    <Box className="mr-2 h-3 w-3" />
                    {inlineLabel}
                    {value === 'inline' && <Check className="ml-auto h-4 w-4" />}
                  </CommandItem>
                )}
              </CommandGroup>
            )}
            {schemas.length > 0 && (
              <CommandGroup heading="Schemas">
                {schemas.map((schema) => (
                  <CommandItem
                    key={schema.id}
                    value={schema.name || 'Unnamed'}
                    onSelect={() => {
                      onValueChange(schema.id);
                      setOpen(false);
                    }}
                  >
                    <Link2 className="mr-2 h-3 w-3" />
                    {schema.name || 'Unnamed'}
                    {value === schema.id && <Check className="ml-auto h-4 w-4" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
