'use client';

import React from "react"

import { useState } from 'react';
import {
  Plus,
  Trash2,
  ChevronRight,
  Link2,
  GripVertical,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useEditorStore } from '@/lib/openapi/store';
import {
  SchemaNode,
  SchemaType,
  PropertyDef,
  SchemaOrRef,
  NodeId,
  createSchema,
  generateId,
} from '@/lib/openapi/types';
import { cn } from '@/lib/utils';

const SCHEMA_TYPES: { value: SchemaType; label: string }[] = [
  { value: 'object', label: 'Object' },
  { value: 'array', label: 'Array' },
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'integer', label: 'Integer' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'enum', label: 'Enum' },
  { value: 'oneOf', label: 'oneOf' },
  { value: 'anyOf', label: 'anyOf' },
  { value: 'allOf', label: 'allOf' },
];

const PRIMITIVE_TYPES: SchemaType[] = ['string', 'number', 'integer', 'boolean'];

interface SchemaListProps {
  onSelect: (id: NodeId) => void;
}

export function SchemaList({ onSelect }: SchemaListProps) {
  const { document, selectedSchemaId, selectSchema, addSchema, deleteSchema, getSchemaUsageCount } =
    useEditorStore();
  const [newSchemaDialogOpen, setNewSchemaDialogOpen] = useState(false);
  const [newSchemaName, setNewSchemaName] = useState('');
  const [newSchemaType, setNewSchemaType] = useState<SchemaType>('object');

  const schemas = Array.from(document.schemas.values());

  const handleCreateSchema = () => {
    if (!newSchemaName.trim()) return;
    const schema = createSchema(newSchemaType, newSchemaName.trim());
    addSchema(schema);
    setNewSchemaDialogOpen(false);
    setNewSchemaName('');
    setNewSchemaType('object');
  };

  const handleDeleteSchema = (id: NodeId, e: React.MouseEvent) => {
    e.stopPropagation();
    const usageCount = getSchemaUsageCount(id);
    if (usageCount > 0) {
      const confirmed = window.confirm(
        `This schema is used in ${usageCount} place(s). Are you sure you want to delete it?`
      );
      if (!confirmed) return;
    }
    deleteSchema(id);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b-4 border-foreground p-4">
        <h2 className="text-lg font-bold uppercase tracking-tight text-foreground">Schemas</h2>
        <Dialog open={newSchemaDialogOpen} onOpenChange={setNewSchemaDialogOpen}>
          <DialogTrigger asChild>
            <Button className="neo-btn-accent">
              <Plus className="mr-1 h-4 w-4" />
              New
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Schema</DialogTitle>
              <DialogDescription>
                Define a new schema (DTO) for your API.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="schemaName">Name</Label>
                <Input
                  id="schemaName"
                  placeholder="e.g., User, OrderRequest"
                  value={newSchemaName}
                  onChange={(e) => setNewSchemaName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="schemaType">Type</Label>
                <Select
                  value={newSchemaType}
                  onValueChange={(v) => setNewSchemaType(v as SchemaType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHEMA_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewSchemaDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateSchema} disabled={!newSchemaName.trim()}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {schemas.length === 0 ? (
            <div className="m-2 border-2 border-dashed border-muted-foreground/50 p-8 text-center">
              <p className="font-mono text-sm text-muted-foreground">No schemas defined yet.</p>
              <p className="font-mono text-sm text-muted-foreground">Click "New" to create one.</p>
            </div>
          ) : (
            schemas.map((schema) => {
              const usageCount = getSchemaUsageCount(schema.id);
              return (
                <div
                  key={schema.id}
                  className={cn(
                    'group flex cursor-pointer items-center justify-between border-2 border-transparent px-3 py-3 transition-all hover:border-foreground hover:bg-muted',
                    selectedSchemaId === schema.id && 'border-foreground bg-secondary neo-shadow-sm'
                  )}
                  onClick={() => {
                    selectSchema(schema.id);
                    onSelect(schema.id);
                  }}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <SchemaTypeIcon type={schema.type} />
                    <span className="truncate font-bold text-foreground">
                      {schema.name || 'Anonymous'}
                    </span>
                    {usageCount > 0 && (
                      <Badge className="border-2 border-foreground bg-accent text-foreground font-mono text-xs">
                        {usageCount}
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 border-2 border-transparent opacity-0 group-hover:opacity-100 hover:border-destructive hover:bg-destructive/10"
                    onClick={(e) => handleDeleteSchema(schema.id, e)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

interface SchemaEditorProps {
  schemaId: NodeId;
}

export function SchemaEditor({ schemaId }: SchemaEditorProps) {
  const { document, updateSchema, addFieldToSchema, updateField, deleteField } =
    useEditorStore();
  const schema = document.schemas.get(schemaId);
  const [addFieldDialogOpen, setAddFieldDialogOpen] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<SchemaType>('string');
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [newFieldRef, setNewFieldRef] = useState<NodeId | null>(null);

  if (!schema) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Select a schema to edit
      </div>
    );
  }

  const allSchemas = Array.from(document.schemas.values()).filter(
    (s) => s.id !== schemaId && s.name
  );

  const handleAddField = () => {
    if (!newFieldName.trim()) return;

    const fieldSchema: SchemaOrRef = newFieldRef
      ? { kind: 'ref', targetId: newFieldRef }
      : { kind: 'inline', schema: createSchema(newFieldType) };

    const field: PropertyDef = {
      name: newFieldName.trim(),
      schema: fieldSchema,
      required: newFieldRequired,
    };

    addFieldToSchema(schemaId, field);
    setAddFieldDialogOpen(false);
    resetFieldForm();
  };

  const resetFieldForm = () => {
    setNewFieldName('');
    setNewFieldType('string');
    setNewFieldRequired(false);
    setNewFieldRef(null);
  };

  const handleAddEnumValue = () => {
    const value = prompt('Enter enum value:');
    if (value && schema.enumValues) {
      updateSchema(schemaId, {
        enumValues: [...schema.enumValues, value],
      });
    } else if (value) {
      updateSchema(schemaId, { enumValues: [value] });
    }
  };

  const handleRemoveEnumValue = (index: number) => {
    if (schema.enumValues) {
      const newValues = [...schema.enumValues];
      newValues.splice(index, 1);
      updateSchema(schemaId, { enumValues: newValues });
    }
  };

  const handleAddVariant = (targetId: NodeId) => {
    const variants = schema.variants || [];
    updateSchema(schemaId, {
      variants: [...variants, { kind: 'ref', targetId }],
    });
  };

  const handleRemoveVariant = (index: number) => {
    if (schema.variants) {
      const newVariants = [...schema.variants];
      newVariants.splice(index, 1);
      updateSchema(schemaId, { variants: newVariants });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b-4 border-foreground p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center border-2 border-foreground bg-secondary neo-shadow-sm">
            <SchemaTypeIcon type={schema.type} />
          </div>
          <Input
            value={schema.name || ''}
            onChange={(e) => updateSchema(schemaId, { name: e.target.value })}
            placeholder="Schema name"
            className="border-2 border-foreground bg-background text-xl font-bold uppercase tracking-tight focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-accent"
          />
        </div>
        <div className="mt-4">
          <Textarea
            placeholder="Description"
            value={schema.description || ''}
            onChange={(e) => updateSchema(schemaId, { description: e.target.value })}
            className="h-20 resize-none border-2 border-foreground bg-background font-mono focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-accent"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        {schema.type === 'object' && (
          <ObjectSchemaEditor
            schema={schema}
            allSchemas={allSchemas}
            onUpdateField={(fieldName, updates) => updateField(schemaId, fieldName, updates)}
            onDeleteField={(fieldName) => deleteField(schemaId, fieldName)}
            onAddFieldClick={() => setAddFieldDialogOpen(true)}
          />
        )}

        {schema.type === 'array' && (
          <ArraySchemaEditor
            schema={schema}
            allSchemas={allSchemas}
            onUpdate={(updates) => updateSchema(schemaId, updates)}
          />
        )}

        {schema.type === 'enum' && (
          <EnumSchemaEditor
            schema={schema}
            onAddValue={handleAddEnumValue}
            onRemoveValue={handleRemoveEnumValue}
          />
        )}

        {['oneOf', 'anyOf', 'allOf'].includes(schema.type) && (
          <CompositionSchemaEditor
            schema={schema}
            allSchemas={allSchemas}
            onAddVariant={handleAddVariant}
            onRemoveVariant={handleRemoveVariant}
            onUpdate={(updates) => updateSchema(schemaId, updates)}
          />
        )}

        {PRIMITIVE_TYPES.includes(schema.type) && (
          <PrimitiveSchemaEditor
            schema={schema}
            onUpdate={(updates) => updateSchema(schemaId, updates)}
          />
        )}
      </ScrollArea>

      {/* Add Field Dialog */}
      <Dialog open={addFieldDialogOpen} onOpenChange={setAddFieldDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Field</DialogTitle>
            <DialogDescription>Add a new field to this schema.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="fieldName">Field Name</Label>
              <Input
                id="fieldName"
                placeholder="e.g., email, userId"
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select
                value={newFieldRef ? 'ref' : newFieldType}
                onValueChange={(v) => {
                  if (v === 'ref') {
                    setNewFieldRef(allSchemas[0]?.id || null);
                  } else {
                    setNewFieldRef(null);
                    setNewFieldType(v as SchemaType);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCHEMA_TYPES.filter((t) => !['oneOf', 'anyOf', 'allOf'].includes(t.value)).map(
                    (type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    )
                  )}
                  {allSchemas.length > 0 && (
                    <SelectItem value="ref">Reference...</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            {newFieldRef !== null && (
              <div className="grid gap-2">
                <Label>Reference To</Label>
                <Select value={newFieldRef || ''} onValueChange={setNewFieldRef}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allSchemas.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="fieldRequired"
                checked={newFieldRequired}
                onCheckedChange={(c) => setNewFieldRequired(c === true)}
              />
              <Label htmlFor="fieldRequired">Required</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddFieldDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddField} disabled={!newFieldName.trim()}>
              Add Field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Sub-components

interface ObjectSchemaEditorProps {
  schema: SchemaNode;
  allSchemas: SchemaNode[];
  onUpdateField: (fieldName: string, updates: Partial<PropertyDef>) => void;
  onDeleteField: (fieldName: string) => void;
  onAddFieldClick: () => void;
}

function ObjectSchemaEditor({
  schema,
  allSchemas,
  onUpdateField,
  onDeleteField,
  onAddFieldClick,
}: ObjectSchemaEditorProps) {
  const properties = schema.properties ? Array.from(schema.properties.entries()) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold uppercase tracking-tight text-foreground">Fields</h3>
        <Button onClick={onAddFieldClick} className="neo-btn-accent">
          <Plus className="mr-1 h-4 w-4" />
          Add Field
        </Button>
      </div>

      {properties.length === 0 ? (
        <div className="border-2 border-dashed border-muted-foreground/50 p-8 text-center">
          <p className="font-mono text-sm text-muted-foreground">No fields defined. Click "Add Field" to create one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {properties.map(([name, field]) => (
            <FieldRow
              key={name}
              field={field}
              allSchemas={allSchemas}
              onUpdate={(updates) => onUpdateField(name, updates)}
              onDelete={() => onDeleteField(name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FieldRowProps {
  field: PropertyDef;
  allSchemas: SchemaNode[];
  onUpdate: (updates: Partial<PropertyDef>) => void;
  onDelete: () => void;
}

function FieldRow({ field, allSchemas, onUpdate, onDelete }: FieldRowProps) {
  const { document } = useEditorStore();

  const getTypeLabel = (schemaOrRef: SchemaOrRef): string => {
    if (schemaOrRef.kind === 'ref') {
      const refSchema = document.schemas.get(schemaOrRef.targetId);
      return refSchema?.name || 'Unknown';
    }
    return schemaOrRef.schema.type;
  };

  const isRef = field.schema.kind === 'ref';

  return (
    <div className="group flex items-center gap-3 border-2 border-foreground bg-card p-3 neo-shadow-sm">
      <GripVertical className="h-4 w-4 cursor-move text-muted-foreground" />
      <Input
        value={field.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        className="h-8 w-32 flex-shrink-0 border-2 border-foreground bg-background font-mono focus-visible:ring-0 focus-visible:border-accent"
      />
      <div className="h-6 w-0.5 bg-foreground" />
      <div className="flex items-center gap-2">
        {isRef && <Link2 className="h-4 w-4 text-accent" />}
        <Badge className={cn(
          "border-2 border-foreground font-mono text-xs uppercase",
          isRef ? "bg-accent text-foreground" : "bg-secondary text-foreground"
        )}>
          {getTypeLabel(field.schema)}
        </Badge>
      </div>
      <div className="h-6 w-0.5 bg-foreground" />
      <div className="flex items-center gap-2">
        <Checkbox
          id={`required-${field.name}`}
          checked={field.required}
          onCheckedChange={(c) => onUpdate({ required: c === true })}
          className="border-2 border-foreground data-[state=checked]:bg-accent data-[state=checked]:border-accent"
        />
        <Label htmlFor={`required-${field.name}`} className="font-mono text-xs uppercase text-muted-foreground">
          required
        </Label>
      </div>
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 border-2 border-transparent opacity-0 group-hover:opacity-100 hover:border-destructive hover:bg-destructive/10"
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

interface ArraySchemaEditorProps {
  schema: SchemaNode;
  allSchemas: SchemaNode[];
  onUpdate: (updates: Partial<SchemaNode>) => void;
}

function ArraySchemaEditor({ schema, allSchemas, onUpdate }: ArraySchemaEditorProps) {
  const { document } = useEditorStore();
  const [useRef, setUseRef] = useState(schema.items?.kind === 'ref');

  const getItemsType = (): string => {
    if (!schema.items) return 'string';
    if (schema.items.kind === 'ref') {
      return 'ref';
    }
    return schema.items.schema.type;
  };

  const getRefTarget = (): NodeId | null => {
    if (schema.items?.kind === 'ref') {
      return schema.items.targetId;
    }
    return null;
  };

  const handleTypeChange = (value: string) => {
    if (value === 'ref') {
      setUseRef(true);
      if (allSchemas.length > 0) {
        onUpdate({ items: { kind: 'ref', targetId: allSchemas[0].id } });
      }
    } else {
      setUseRef(false);
      onUpdate({ items: { kind: 'inline', schema: createSchema(value as SchemaType) } });
    }
  };

  const handleRefChange = (targetId: NodeId) => {
    onUpdate({ items: { kind: 'ref', targetId } });
  };

  return (
    <div className="space-y-4">
      <h3 className="font-medium text-foreground">Array Items</h3>
      <Card>
        <CardContent className="pt-4">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Items Type</Label>
              <Select value={getItemsType()} onValueChange={handleTypeChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCHEMA_TYPES.filter((t) => !['oneOf', 'anyOf', 'allOf', 'array'].includes(t.value)).map(
                    (type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    )
                  )}
                  {allSchemas.length > 0 && (
                    <SelectItem value="ref">Reference...</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            {useRef && (
              <div className="grid gap-2">
                <Label>Reference To</Label>
                <Select value={getRefTarget() || ''} onValueChange={handleRefChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allSchemas.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface EnumSchemaEditorProps {
  schema: SchemaNode;
  onAddValue: () => void;
  onRemoveValue: (index: number) => void;
}

function EnumSchemaEditor({ schema, onAddValue, onRemoveValue }: EnumSchemaEditorProps) {
  const values = schema.enumValues || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-foreground">Enum Values</h3>
        <Button size="sm" onClick={onAddValue}>
          <Plus className="mr-1 h-4 w-4" />
          Add Value
        </Button>
      </div>

      {values.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
          No values defined. Click "Add Value" to create one.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {values.map((value, index) => (
            <Badge
              key={index}
              variant="secondary"
              className="cursor-pointer pr-1"
              onClick={() => onRemoveValue(index)}
            >
              {value}
              <Trash2 className="ml-1 h-3 w-3" />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

interface CompositionSchemaEditorProps {
  schema: SchemaNode;
  allSchemas: SchemaNode[];
  onAddVariant: (targetId: NodeId) => void;
  onRemoveVariant: (index: number) => void;
  onUpdate: (updates: Partial<SchemaNode>) => void;
}

function CompositionSchemaEditor({
  schema,
  allSchemas,
  onAddVariant,
  onRemoveVariant,
  onUpdate,
}: CompositionSchemaEditorProps) {
  const { document } = useEditorStore();
  const variants = schema.variants || [];
  const [selectedVariant, setSelectedVariant] = useState<NodeId | null>(null);

  const getCompositionLabel = () => {
    switch (schema.type) {
      case 'oneOf':
        return 'One Of (exactly one)';
      case 'anyOf':
        return 'Any Of (one or more)';
      case 'allOf':
        return 'All Of (combines all)';
      default:
        return 'Composition';
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="font-medium text-foreground">{getCompositionLabel()}</h3>

      {schema.type === 'oneOf' && (
        <div className="grid gap-2">
          <Label>Discriminator Property</Label>
          <Input
            placeholder="e.g., type, kind"
            value={schema.discriminator?.propertyName || ''}
            onChange={(e) =>
              onUpdate({
                discriminator: e.target.value
                  ? { propertyName: e.target.value }
                  : undefined,
              })
            }
          />
        </div>
      )}

      <Card>
        <CardContent className="pt-4">
          <div className="space-y-2">
            {variants.length === 0 ? (
              <div className="py-4 text-center text-muted-foreground">
                No variants added yet.
              </div>
            ) : (
              variants.map((variant, index) => {
                if (variant.kind !== 'ref') return null;
                const refSchema = document.schemas.get(variant.targetId);
                return (
                  <div
                    key={index}
                    className="group flex items-center justify-between rounded-md bg-muted px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <Link2 className="h-4 w-4 text-primary" />
                      <span className="text-foreground">{refSchema?.name || 'Unknown'}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100"
                      onClick={() => onRemoveVariant(index)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <Select value={selectedVariant || ''} onValueChange={setSelectedVariant}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select schema..." />
              </SelectTrigger>
              <SelectContent>
                {allSchemas.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!selectedVariant}
              onClick={() => {
                if (selectedVariant) {
                  onAddVariant(selectedVariant);
                  setSelectedVariant(null);
                }
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface PrimitiveSchemaEditorProps {
  schema: SchemaNode;
  onUpdate: (updates: Partial<SchemaNode>) => void;
}

function PrimitiveSchemaEditor({ schema, onUpdate }: PrimitiveSchemaEditorProps) {
  return (
    <div className="space-y-4">
      <h3 className="font-medium text-foreground">Constraints</h3>
      <Card>
        <CardContent className="grid gap-4 pt-4">
          {schema.type === 'string' && (
            <>
              <div className="grid gap-2">
                <Label>Format</Label>
                <Select
                  value={schema.format || 'none'}
                  onValueChange={(v) => onUpdate({ format: v === 'none' ? undefined : v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="date">date</SelectItem>
                    <SelectItem value="date-time">date-time</SelectItem>
                    <SelectItem value="email">email</SelectItem>
                    <SelectItem value="uri">uri</SelectItem>
                    <SelectItem value="uuid">uuid</SelectItem>
                    <SelectItem value="password">password</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Min Length</Label>
                  <Input
                    type="number"
                    value={schema.minLength ?? ''}
                    onChange={(e) =>
                      onUpdate({
                        minLength: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Max Length</Label>
                  <Input
                    type="number"
                    value={schema.maxLength ?? ''}
                    onChange={(e) =>
                      onUpdate({
                        maxLength: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Pattern (Regex)</Label>
                <Input
                  placeholder="e.g., ^[a-z]+$"
                  value={schema.pattern || ''}
                  onChange={(e) =>
                    onUpdate({ pattern: e.target.value || undefined })
                  }
                />
              </div>
            </>
          )}

          {(schema.type === 'number' || schema.type === 'integer') && (
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Minimum</Label>
                <Input
                  type="number"
                  value={schema.minimum ?? ''}
                  onChange={(e) =>
                    onUpdate({
                      minimum: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Maximum</Label>
                <Input
                  type="number"
                  value={schema.maximum ?? ''}
                  onChange={(e) =>
                    onUpdate({
                      maximum: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <Label>Example</Label>
            <Input
              placeholder="Example value"
              value={schema.example as string ?? ''}
              onChange={(e) =>
                onUpdate({ example: e.target.value || undefined })
              }
            />
          </div>

          <div className="grid gap-2">
            <Label>Default</Label>
            <Input
              placeholder="Default value"
              value={schema.default as string ?? ''}
              onChange={(e) =>
                onUpdate({ default: e.target.value || undefined })
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SchemaTypeIcon({ type }: { type: SchemaType }) {
  const iconClasses = 'h-4 w-4';

  switch (type) {
    case 'object':
      return (
        <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-500/10 text-blue-500">
          <span className="text-xs font-bold">{'{ }'}</span>
        </div>
      );
    case 'array':
      return (
        <div className="flex h-6 w-6 items-center justify-center rounded bg-green-500/10 text-green-500">
          <span className="text-xs font-bold">{'[ ]'}</span>
        </div>
      );
    case 'enum':
      return (
        <div className="flex h-6 w-6 items-center justify-center rounded bg-amber-500/10 text-amber-500">
          <span className="text-xs font-bold">E</span>
        </div>
      );
    case 'oneOf':
    case 'anyOf':
    case 'allOf':
      return (
        <div className="flex h-6 w-6 items-center justify-center rounded bg-purple-500/10 text-purple-500">
          <span className="text-xs font-bold">|</span>
        </div>
      );
    default:
      return (
        <div className="flex h-6 w-6 items-center justify-center rounded bg-muted text-muted-foreground">
          <span className="text-xs font-bold">T</span>
        </div>
      );
  }
}
