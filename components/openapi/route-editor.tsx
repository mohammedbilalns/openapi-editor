'use client';

import React from "react"

import { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Link2,
  ChevronDown,
  ChevronRight,
  Lock,
  Unlock,
  ChevronsUpDown,
  Check,
  Settings,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useEditorStore } from '@/lib/openapi/store';
import {
  Route,
  HttpMethod,
  ParameterDef,
  ResponseDef,
  RequestBody,
  SchemaNode,
  SchemaOrRef,
  NodeId,
  createRoute,
  createSchema,
  generateId,
} from '@/lib/openapi/types';
import { cn } from '@/lib/utils';
import { HTTP_STATUS_CODES, getStatusCodeColor, getCategoryLabel, getGroupedStatusCodes } from '@/lib/openapi/http-status-codes';
import { SchemaCombobox } from './schema-combobox';

const HTTP_METHODS: { value: HttpMethod; label: string; color: string }[] = [
  { value: 'get', label: 'GET', color: 'bg-green-500' },
  { value: 'post', label: 'POST', color: 'bg-blue-500' },
  { value: 'put', label: 'PUT', color: 'bg-amber-500' },
  { value: 'patch', label: 'PATCH', color: 'bg-orange-500' },
  { value: 'delete', label: 'DELETE', color: 'bg-red-500' },
  { value: 'options', label: 'OPTIONS', color: 'bg-gray-500' },
  { value: 'head', label: 'HEAD', color: 'bg-purple-500' },
];

const PARAMETER_LOCATIONS = [
  { value: 'path', label: 'Path' },
  { value: 'query', label: 'Query' },
  { value: 'header', label: 'Header' },
  { value: 'cookie', label: 'Cookie' },
] as const;



interface RouteListProps {
  onSelect: (id: NodeId) => void;
}

export function RouteList({ onSelect }: RouteListProps) {
  const { document, selectedRouteId, selectRoute, addRoute, deleteRoute } =
    useEditorStore();
  const [newRouteDialogOpen, setNewRouteDialogOpen] = useState(false);
  const [newRoutePath, setNewRoutePath] = useState('');
  const [newRouteMethod, setNewRouteMethod] = useState<HttpMethod>('get');
  const [newRouteTags, setNewRouteTags] = useState<string[]>([]);

  const routes = Array.from(document.routes.values());
  const availableTags = document.tags.map(t => t.name);

  // Group routes by tags first, then by path within each tag
  // Routes without tags go into "Untagged" group
  const groupedByTag = routes.reduce((acc, route) => {
    const routeTags = route.tags.length > 0 ? route.tags : ['Untagged'];
    for (const tag of routeTags) {
      if (!acc[tag]) {
        acc[tag] = [];
      }
      // Avoid duplicates if route has multiple tags (it will appear under each tag)
      if (!acc[tag].some(r => r.id === route.id)) {
        acc[tag].push(route);
      }
    }
    return acc;
  }, {} as Record<string, Route[]>);

  // Sort tags: defined tags first (in order), then "Untagged" last
  const sortedTags = [
    ...availableTags.filter(tag => groupedByTag[tag]),
    ...Object.keys(groupedByTag).filter(tag => !availableTags.includes(tag) && tag !== 'Untagged'),
    ...(groupedByTag['Untagged'] ? ['Untagged'] : []),
  ];

  const handleCreateRoute = () => {
    if (!newRoutePath.trim()) return;
    
    let path = newRoutePath.trim();
    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    const route = createRoute(path, newRouteMethod);
    
    // Set selected tags
    route.tags = newRouteTags;
    
    // Auto-extract path parameters
    const pathParams = path.match(/\{([^}]+)\}/g);
    if (pathParams) {
      route.parameters = pathParams.map((param) => {
        const name = param.slice(1, -1);
        return {
          id: generateId(),
          name,
          in: 'path' as const,
          required: true,
          schema: { kind: 'inline' as const, schema: createSchema('string') },
        };
      });
    }

    addRoute(route);
    setNewRouteDialogOpen(false);
    setNewRoutePath('');
    setNewRouteMethod('get');
    setNewRouteTags([]);
  };

  const handleDeleteRoute = (id: NodeId, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteRoute(id);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b-4 border-foreground p-4">
        <h2 className="text-lg font-bold uppercase tracking-tight text-foreground">Routes</h2>
        <Dialog open={newRouteDialogOpen} onOpenChange={setNewRouteDialogOpen}>
          <DialogTrigger asChild>
            <Button className="neo-btn-accent">
              <Plus className="mr-1 h-4 w-4" />
              New
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Route</DialogTitle>
              <DialogDescription>
                Define a new API endpoint. Path parameters are auto-detected.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="routePath">Path</Label>
                <Input
                  id="routePath"
                  placeholder="e.g., /users/{userId}/orders"
                  value={newRoutePath}
                  onChange={(e) => setNewRoutePath(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="routeMethod">Method</Label>
                <Select
                  value={newRouteMethod}
                  onValueChange={(v) => setNewRouteMethod(v as HttpMethod)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HTTP_METHODS.map((method) => (
                      <SelectItem key={method.value} value={method.value}>
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              'h-2 w-2 rounded-full',
                              method.color
                            )}
                          />
                          {method.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Tags</Label>
                {availableTags.length > 0 ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between border-2 border-foreground bg-background font-normal"
                      >
                        {newRouteTags.length > 0
                          ? `${newRouteTags.length} tag${newRouteTags.length > 1 ? 's' : ''} selected`
                          : 'Select tags...'}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0 border-2 border-foreground">
                      <Command>
                        <CommandInput placeholder="Search tags..." />
                        <CommandList>
                          <CommandEmpty>No tags found.</CommandEmpty>
                          <CommandGroup>
                            {availableTags.map((tag) => (
                              <CommandItem
                                key={tag}
                                value={tag}
                                onSelect={() => {
                                  if (newRouteTags.includes(tag)) {
                                    setNewRouteTags(newRouteTags.filter(t => t !== tag));
                                  } else {
                                    setNewRouteTags([...newRouteTags, tag]);
                                  }
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    newRouteTags.includes(tag) ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                {tag}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <div className="flex items-center gap-2 border-2 border-dashed border-muted-foreground/50 p-3">
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground font-mono">No tags defined. Add tags in Settings tab.</p>
                  </div>
                )}
                {newRouteTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {newRouteTags.map((tag) => (
                      <Badge
                        key={tag}
                        className="border-2 border-foreground bg-accent text-foreground font-bold uppercase text-xs"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewRouteDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateRoute} disabled={!newRoutePath.trim()}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className="flex-1 overflow-x-hidden">
        <div className="space-y-1 p-2 overflow-hidden">
          {routes.length === 0 ? (
            <div className="m-2 border-2 border-dashed border-muted-foreground/50 p-8 text-center">
              <p className="font-mono text-sm text-muted-foreground">No routes defined yet.</p>
              <p className="font-mono text-sm text-muted-foreground">Click "New" to create one.</p>
            </div>
          ) : (
            sortedTags.map((tag) => (
              <Collapsible key={tag} defaultOpen className="mb-2">
                <CollapsibleTrigger className="flex w-full items-center gap-2 border-2 border-foreground bg-muted px-3 py-2 hover:bg-muted/80 min-w-0">
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform [[data-state=closed]_&]:-rotate-90" />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex-1 truncate text-left font-bold uppercase text-sm">
                        {tag}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>{tag}</p>
                    </TooltipContent>
                  </Tooltip>
                  <Badge className="shrink-0 border-2 border-foreground bg-background font-mono text-xs">
                    {groupedByTag[tag].length}
                  </Badge>
                </CollapsibleTrigger>
<CollapsibleContent className="overflow-hidden">
                    {groupedByTag[tag].map((route) => {
                    const method = HTTP_METHODS.find((m) => m.value === route.method);
                    return (
                      <div
                        key={route.id}
                        className={cn(
                          'group flex cursor-pointer items-center gap-3 border-2 border-transparent px-3 py-3 transition-all hover:border-foreground hover:bg-muted min-w-0',
                          selectedRouteId === route.id && 'border-foreground bg-secondary neo-shadow-sm'
                        )}
                        onClick={() => {
                          selectRoute(route.id);
                          onSelect(route.id);
                        }}
                      >
                        <Badge
                          className={cn(
                            'w-16 shrink-0 justify-center border-2 border-foreground text-xs font-bold uppercase',
                            method?.color,
                            'text-foreground'
                          )}
                        >
                          {route.method.toUpperCase()}
                        </Badge>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex-1 truncate font-mono text-sm font-bold text-foreground min-w-0">
                              {route.path}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            <p className="font-mono">{route.path}</p>
                          </TooltipContent>
                        </Tooltip>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 border-2 border-transparent opacity-0 group-hover:opacity-100 hover:border-destructive hover:bg-destructive/10"
                          onClick={(e) => handleDeleteRoute(route.id, e)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

interface RouteEditorProps {
  routeId: NodeId;
}

export function RouteEditor({ routeId }: RouteEditorProps) {
  const {
    document,
    updateRoute,
    addParameter,
    updateParameter,
    deleteParameter,
    setRequestBody,
    addResponse,
    updateResponse,
    deleteResponse,
  } = useEditorStore();
  const route = document.routes.get(routeId);
  const allSchemas = Array.from(document.schemas.values()).filter((s) => s.name);

  const [parametersOpen, setParametersOpen] = useState(true);
  const [requestBodyOpen, setRequestBodyOpen] = useState(true);
  const [responsesOpen, setResponsesOpen] = useState(true);

  if (!route) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Select a route to edit
      </div>
    );
  }

  const method = HTTP_METHODS.find((m) => m.value === route.method);

  const pathParams = route.parameters.filter((p) => p.in === 'path');
  const queryParams = route.parameters.filter((p) => p.in === 'query');
  const headerParams = route.parameters.filter((p) => p.in === 'header');

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col">
      {/* Header */}
      <div className="border-b-4 border-foreground p-6">
        <div className="flex items-center gap-4">
          <Badge
            className={cn(
              'w-24 justify-center border-2 border-foreground py-2 text-sm font-bold uppercase neo-shadow-sm',
              method?.color,
              'text-foreground'
            )}
          >
            {route.method.toUpperCase()}
          </Badge>
          <Input
            value={route.path}
            onChange={(e) => updateRoute(routeId, { path: e.target.value })}
            className="flex-1 border-2 border-foreground bg-background font-mono text-lg font-bold focus-visible:ring-0 focus-visible:border-accent"
          />
        </div>
        <div className="mt-4 grid gap-4">
          <Input
            placeholder="Summary (short description)"
            value={route.summary || ''}
            onChange={(e) => updateRoute(routeId, { summary: e.target.value })}
            className="border-2 border-foreground bg-background focus-visible:ring-0 focus-visible:border-accent"
          />
          <Textarea
            placeholder="Description (detailed)"
            value={route.description || ''}
            onChange={(e) => updateRoute(routeId, { description: e.target.value })}
            className="h-20 resize-none border-2 border-foreground bg-background font-mono focus-visible:ring-0 focus-visible:border-accent"
          />
          <div className="flex gap-4">
            <div className="flex-1">
              <Label className="font-bold uppercase">Operation ID</Label>
              <Input
                placeholder="e.g., getUserById"
                value={route.operationId || ''}
                onChange={(e) => updateRoute(routeId, { operationId: e.target.value })}
                className="mt-2 border-2 border-foreground bg-background font-mono focus-visible:ring-0 focus-visible:border-accent"
              />
            </div>
            <div className="flex items-end gap-2 pb-2">
              <Checkbox
                id="deprecated"
                checked={route.deprecated || false}
                onCheckedChange={(c) => updateRoute(routeId, { deprecated: c === true })}
                className="border-2 border-foreground data-[state=checked]:bg-destructive data-[state=checked]:border-destructive"
              />
              <Label htmlFor="deprecated" className="font-bold uppercase">Deprecated</Label>
            </div>
          </div>
          {/* Tags Section */}
          <div className="mt-4">
            <Label className="font-bold uppercase">Tags</Label>
            <div className="mt-2">
              {document.tags.length === 0 ? (
                <div className="flex items-center gap-2 border-2 border-dashed border-muted-foreground/50 p-3">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground font-mono">No tags defined. Add tags in Settings tab.</p>
                </div>
              ) : (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between border-2 border-foreground bg-background font-normal"
                    >
                      {route.tags.length > 0
                        ? `${route.tags.length} tag${route.tags.length > 1 ? 's' : ''} selected`
                        : 'Select tags...'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0 border-2 border-foreground">
                    <Command>
                      <CommandInput placeholder="Search tags..." />
                      <CommandList>
                        <CommandEmpty>No tags found.</CommandEmpty>
                        <CommandGroup>
                          {document.tags.map((tag) => (
                            <CommandItem
                              key={tag.name}
                              value={tag.name}
                              onSelect={() => {
                                const newTags = route.tags.includes(tag.name)
                                  ? route.tags.filter(t => t !== tag.name)
                                  : [...route.tags, tag.name];
                                updateRoute(routeId, { tags: newTags });
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  route.tags.includes(tag.name) ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                              {tag.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
              {route.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {route.tags.map((tag) => (
                    <Badge
                      key={tag}
                      className="border-2 border-foreground bg-accent text-foreground font-bold uppercase text-xs"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="space-y-4">
          {/* Parameters Section */}
          <Collapsible open={parametersOpen} onOpenChange={setParametersOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between">
                <span className="font-medium">Parameters</span>
                {parametersOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-2">
              {/* Path Parameters */}
              {pathParams.length > 0 && (
                <ParameterGroup
                  title="Path Parameters"
                  parameters={pathParams}
                  allSchemas={allSchemas}
                  onUpdate={(id, updates) => updateParameter(routeId, id, updates)}
                  onDelete={(id) => deleteParameter(routeId, id)}
                />
              )}

              {/* Query Parameters */}
              <ParameterGroup
                title="Query Parameters"
                parameters={queryParams}
                allSchemas={allSchemas}
                onAdd={() =>
                  addParameter(routeId, {
                    id: generateId(),
                    name: 'param',
                    in: 'query',
                    required: false,
                    schema: { kind: 'inline', schema: createSchema('string') },
                  })
                }
                onUpdate={(id, updates) => updateParameter(routeId, id, updates)}
                onDelete={(id) => deleteParameter(routeId, id)}
              />

              {/* Header Parameters */}
              <ParameterGroup
                title="Headers"
                parameters={headerParams}
                allSchemas={allSchemas}
                onAdd={() =>
                  addParameter(routeId, {
                    id: generateId(),
                    name: 'X-Custom-Header',
                    in: 'header',
                    required: false,
                    schema: { kind: 'inline', schema: createSchema('string') },
                  })
                }
                onUpdate={(id, updates) => updateParameter(routeId, id, updates)}
                onDelete={(id) => deleteParameter(routeId, id)}
              />
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* Request Body Section */}
          {['post', 'put', 'patch'].includes(route.method) && (
            <>
              <Collapsible open={requestBodyOpen} onOpenChange={setRequestBodyOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between">
                    <span className="font-medium">Request Body</span>
                    {requestBodyOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <RequestBodyEditor
                    requestBody={route.requestBody}
                    allSchemas={allSchemas}
                    onUpdate={(body) => setRequestBody(routeId, body)}
                  />
                </CollapsibleContent>
              </Collapsible>
              <Separator />
            </>
          )}

          {/* Responses Section */}
          <Collapsible open={responsesOpen} onOpenChange={setResponsesOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between">
                <span className="font-medium">Responses</span>
                {responsesOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <ResponsesEditor
                responses={route.responses}
                allSchemas={allSchemas}
                onAdd={(statusCode, response) => addResponse(routeId, statusCode, response)}
                onUpdate={(statusCode, updates) =>
                  updateResponse(routeId, statusCode, updates)
                }
                onDelete={(statusCode) => deleteResponse(routeId, statusCode)}
              />
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
      </div>
    </ScrollArea>
  );
}

// Sub-components

interface ParameterGroupProps {
  title: string;
  parameters: ParameterDef[];
  allSchemas: SchemaNode[];
  onAdd?: () => void;
  onUpdate: (id: NodeId, updates: Partial<ParameterDef>) => void;
  onDelete: (id: NodeId) => void;
}

function ParameterGroup({
  title,
  parameters,
  allSchemas,
  onAdd,
  onUpdate,
  onDelete,
}: ParameterGroupProps) {
  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{title}</CardTitle>
          {onAdd && (
            <Button size="sm" variant="outline" onClick={onAdd}>
              <Plus className="mr-1 h-3 w-3" />
              Add
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {parameters.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            No parameters
          </div>
        ) : (
          parameters.map((param) => (
            <ParameterRow
              key={param.id}
              param={param}
              allSchemas={allSchemas}
              onUpdate={(updates) => onUpdate(param.id, updates)}
              onDelete={() => onDelete(param.id)}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

interface ParameterRowProps {
  param: ParameterDef;
  allSchemas: SchemaNode[];
  onUpdate: (updates: Partial<ParameterDef>) => void;
  onDelete: () => void;
}

function ParameterRow({ param, allSchemas, onUpdate, onDelete }: ParameterRowProps) {
  const { document } = useEditorStore();
  const isPath = param.in === 'path';

  const getTypeLabel = (): string => {
    if (param.schema.kind === 'ref') {
      const refSchema = document.schemas.get(param.schema.targetId);
      return refSchema?.name || 'Unknown';
    }
    return param.schema.schema.type;
  };

  return (
    <div className="group flex items-center gap-2 rounded-md border bg-card p-2">
      <Input
        value={param.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        className="h-8 w-28 flex-shrink-0 font-mono text-sm"
        disabled={isPath}
      />
      <Select
        value={getTypeLabel()}
        onValueChange={(v) => {
          if (v === 'ref') {
            // Handle reference selection
          } else {
            onUpdate({
              schema: { kind: 'inline', schema: createSchema(v as any) },
            });
          }
        }}
      >
        <SelectTrigger className="h-8 w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="string">string</SelectItem>
          <SelectItem value="integer">integer</SelectItem>
          <SelectItem value="number">number</SelectItem>
          <SelectItem value="boolean">boolean</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1">
        <Checkbox
          id={`required-${param.id}`}
          checked={param.required}
          onCheckedChange={(c) => onUpdate({ required: c === true })}
          disabled={isPath}
        />
        <Label htmlFor={`required-${param.id}`} className="text-xs text-muted-foreground">
          req
        </Label>
      </div>
      <Input
        placeholder="Description"
        value={param.description || ''}
        onChange={(e) => onUpdate({ description: e.target.value })}
        className="h-8 flex-1 text-sm"
      />
      {!isPath && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 group-hover:opacity-100"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      )}
    </div>
  );
}

interface RequestBodyEditorProps {
  requestBody?: RequestBody;
  allSchemas: SchemaNode[];
  onUpdate: (body: RequestBody | undefined) => void;
}

function RequestBodyEditor({ requestBody, allSchemas, onUpdate }: RequestBodyEditorProps) {
  const { document } = useEditorStore();
  const [useRef, setUseRef] = useState(false);
  const [selectedSchemaId, setSelectedSchemaId] = useState<NodeId | null>(null);

  useEffect(() => {
    if (requestBody?.content) {
      const jsonContent = requestBody.content.get('application/json');
      if (jsonContent?.schema.kind === 'ref') {
        setUseRef(true);
        setSelectedSchemaId(jsonContent.schema.targetId);
      }
    }
  }, [requestBody]);

  const handleToggle = (enabled: boolean) => {
    if (enabled) {
      onUpdate({
        id: generateId(),
        required: true,
        content: new Map([
          [
            'application/json',
            {
              schema: { kind: 'inline', schema: createSchema('object') },
            },
          ],
        ]),
      });
    } else {
      onUpdate(undefined);
    }
  };

  const handleSchemaSelect = (schemaId: NodeId) => {
    setSelectedSchemaId(schemaId);
    setUseRef(true);
    onUpdate({
      id: requestBody?.id || generateId(),
      required: requestBody?.required ?? true,
      content: new Map([
        [
          'application/json',
          {
            schema: { kind: 'ref', targetId: schemaId },
          },
        ],
      ]),
    });
  };

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <Label>Request Body</Label>
          <Checkbox
            checked={!!requestBody}
            onCheckedChange={(c) => handleToggle(c === true)}
          />
        </div>

        {requestBody && (
          <div className="mt-4 space-y-3">
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">Content-Type</Label>
              <Select defaultValue="application/json">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="application/json">application/json</SelectItem>
                  <SelectItem value="multipart/form-data">multipart/form-data</SelectItem>
                  <SelectItem value="application/x-www-form-urlencoded">
                    application/x-www-form-urlencoded
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">Schema</Label>
              <SchemaCombobox
                value={selectedSchemaId || 'inline'}
                onValueChange={(v) => {
                  if (v === 'inline') {
                    setUseRef(false);
                    setSelectedSchemaId(null);
                    onUpdate({
                      ...requestBody,
                      content: new Map([
                        [
                          'application/json',
                          {
                            schema: { kind: 'inline', schema: createSchema('object') },
                          },
                        ],
                      ]),
                    });
                  } else {
                    handleSchemaSelect(v);
                  }
                }}
                schemas={allSchemas}
                includeInline
                placeholder="Select schema..."
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="bodyRequired"
                checked={requestBody.required}
                onCheckedChange={(c) =>
                  onUpdate({ ...requestBody, required: c === true })
                }
              />
              <Label htmlFor="bodyRequired">Required</Label>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ResponsesEditorProps {
  responses: Map<string, ResponseDef>;
  allSchemas: SchemaNode[];
  onAdd: (statusCode: string, response: ResponseDef) => void;
  onUpdate: (statusCode: string, updates: Partial<ResponseDef>) => void;
  onDelete: (statusCode: string) => void;
}

function ResponsesEditor({
  responses,
  allSchemas,
  onAdd,
  onUpdate,
  onDelete,
}: ResponsesEditorProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [newStatusCode, setNewStatusCode] = useState('200');

  const responseEntries = Array.from(responses.entries());
  const existingCodes = responseEntries.map(([code]) => code);
  const groupedCodes = getGroupedStatusCodes();

  const handleAddResponse = () => {
    const statusInfo = HTTP_STATUS_CODES.find((s) => s.value === newStatusCode);
    onAdd(newStatusCode, {
      id: generateId(),
      description: statusInfo?.label.split(' ').slice(1).join(' ') || 'Response',
    });
    setAddDialogOpen(false);
    setNewStatusCode('200');
  };

  const selectedStatusLabel = HTTP_STATUS_CODES.find((s) => s.value === newStatusCode)?.label || newStatusCode;

  return (
    <div className="space-y-2">
      {responseEntries.map(([statusCode, response]) => (
        <ResponseRow
          key={statusCode}
          statusCode={statusCode}
          response={response}
          allSchemas={allSchemas}
          onUpdate={(updates) => onUpdate(statusCode, updates)}
          onDelete={() => onDelete(statusCode)}
        />
      ))}

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full bg-transparent">
            <Plus className="mr-1 h-4 w-4" />
            Add Response
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Response</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label>Status Code</Label>
            <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={comboboxOpen}
                  className="mt-2 w-full justify-between bg-transparent"
                >
                  <span className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", getStatusCodeColor(newStatusCode))} />
                    {selectedStatusLabel}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[350px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search status codes..." />
                  <CommandList>
                    <CommandEmpty>No status code found.</CommandEmpty>
                    {(Object.keys(groupedCodes) as Array<keyof typeof groupedCodes>).map((category) => (
                      <CommandGroup key={category} heading={getCategoryLabel(category)}>
                        {groupedCodes[category]
                          .filter((status) => !existingCodes.includes(status.value))
                          .map((status) => (
                            <CommandItem
                              key={status.value}
                              value={status.label}
                              onSelect={() => {
                                setNewStatusCode(status.value);
                                setComboboxOpen(false);
                              }}
                            >
                              <span className={cn("mr-2 h-2 w-2 rounded-full", getStatusCodeColor(status.value))} />
                              {status.label}
                              {newStatusCode === status.value && (
                                <Check className="ml-auto h-4 w-4" />
                              )}
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddResponse}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ResponseRowProps {
  statusCode: string;
  response: ResponseDef;
  allSchemas: SchemaNode[];
  onUpdate: (updates: Partial<ResponseDef>) => void;
  onDelete: () => void;
}

function ResponseRow({
  statusCode,
  response,
  allSchemas,
  onUpdate,
  onDelete,
}: ResponseRowProps) {
  const { document } = useEditorStore();
  const [expanded, setExpanded] = useState(false);

  const getCurrentSchema = (): NodeId | null => {
    const jsonContent = response.content?.get('application/json');
    if (jsonContent?.schema.kind === 'ref') {
      return jsonContent.schema.targetId;
    }
    return null;
  };

  const handleSchemaChange = (schemaId: string) => {
    if (schemaId === 'none') {
      onUpdate({ content: undefined });
    } else {
      onUpdate({
        content: new Map([
          [
            'application/json',
            {
              schema: { kind: 'ref', targetId: schemaId },
            },
          ],
        ]),
      });
    }
  };

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <Badge className={cn('text-white', getStatusCodeColor(statusCode))}>
            {statusCode}
          </Badge>
          <Input
            value={response.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="Description"
            className="h-8 flex-1"
          />
          <SchemaCombobox
            value={getCurrentSchema() || 'none'}
            onValueChange={handleSchemaChange}
            schemas={allSchemas}
            includeNone
            noneLabel="No body"
            triggerClassName="h-8 w-40"
          />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
