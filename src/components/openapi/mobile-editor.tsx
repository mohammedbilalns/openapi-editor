'use client';

import React, { useState } from 'react';
import {
  Route as RouteIcon,
  Box,
  Settings,
  Code,
  Plus,
  ChevronLeft,
  Trash2,
  Cloud,
  CloudOff,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useEditorStore } from '@/lib/openapi/store';
import { RouteEditor } from './route-editor';
import { SchemaEditor } from './schema-builder';
import { SettingsPanel } from './settings-panel';
import { YamlPreview } from './yaml-preview';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type MobileTab = 'routes' | 'schemas' | 'settings';

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500',
  POST: 'bg-blue-500',
  PUT: 'bg-amber-500',
  PATCH: 'bg-orange-500',
  DELETE: 'bg-red-500',
  HEAD: 'bg-purple-500',
  OPTIONS: 'bg-gray-500',
};

interface MobileEditorProps {
  isSaving: boolean;
  lastSaved: number | null;
  saveError: Error | null;
}

export function MobileEditor({ isSaving, lastSaved, saveError }: MobileEditorProps) {
  const [activeTab, setActiveTab] = useState<MobileTab>('routes');
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedSchemaId, setSelectedSchemaId] = useState<string | null>(null);
  const [yamlOpen, setYamlOpen] = useState(false);
  const [deleteRouteId, setDeleteRouteId] = useState<string | null>(null);
  const [deleteSchemaId, setDeleteSchemaId] = useState<string | null>(null);

  const {
    document,
    addRoute,
    deleteRoute,
    addSchema,
    deleteSchema,
    getSchemaUsageCount,
  } = useEditorStore();

  const routes = Array.from(document.routes.values());
  const schemas = Array.from(document.schemas.values());

  const handleAddRoute = () => {
    const id = addRoute();
    setSelectedRouteId(id);
  };

  const handleAddSchema = () => {
    const id = addSchema();
    setSelectedSchemaId(id);
  };

  const handleDeleteRoute = (id: string) => {
    deleteRoute(id);
    if (selectedRouteId === id) {
      setSelectedRouteId(null);
    }
    setDeleteRouteId(null);
  };

  const handleDeleteSchema = (id: string) => {
    deleteSchema(id);
    if (selectedSchemaId === id) {
      setSelectedSchemaId(null);
    }
    setDeleteSchemaId(null);
  };

  const selectedRoute = selectedRouteId ? document.routes.get(selectedRouteId) : null;
  const selectedSchema = selectedSchemaId ? document.schemas.get(selectedSchemaId) : null;

  // Render detail view if an item is selected
  if (selectedRouteId && selectedRoute) {
    return (
      <div className="flex h-screen flex-col bg-background">
        {/* Detail Header */}
        <div className="shrink-0 flex items-center gap-2 border-b-2 border-foreground p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedRouteId(null)}
            className="neo-btn h-8 px-2"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Badge className={`${METHOD_COLORS[selectedRoute.method]} text-white text-xs`}>
            {selectedRoute.method}
          </Badge>
          <span className="flex-1 truncate font-mono text-sm">{selectedRoute.path}</span>
        </div>
        {/* Detail Content */}
        <div className="min-h-0 flex-1 overflow-hidden">
          <RouteEditor routeId={selectedRouteId} />
        </div>
      </div>
    );
  }

  if (selectedSchemaId && selectedSchema) {
    return (
      <div className="flex h-screen flex-col bg-background">
        {/* Detail Header */}
        <div className="shrink-0 flex items-center gap-2 border-b-2 border-foreground p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedSchemaId(null)}
            className="neo-btn h-8 px-2"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Box className="h-4 w-4" />
          <span className="flex-1 truncate font-mono text-sm">{selectedSchema.name || 'Unnamed'}</span>
        </div>
        {/* Detail Content */}
        <div className="min-h-0 flex-1 overflow-hidden">
          <SchemaEditor schemaId={selectedSchemaId} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between border-b-2 border-foreground px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg">{document.info.title}</span>
          <Badge variant="outline" className="text-xs">
            v{document.info.version}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {/* Save Status */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {isSaving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : lastSaved ? (
              <Cloud className="h-3 w-3 text-green-600 dark:text-green-400" />
            ) : saveError ? (
              <CloudOff className="h-3 w-3 text-destructive" />
            ) : null}
          </div>
          {/* YAML Preview */}
          <Sheet open={yamlOpen} onOpenChange={setYamlOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="neo-btn h-8 px-2">
                <Code className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[80vh] p-0">
              <SheetHeader className="border-b-2 border-foreground px-4 py-3">
                <SheetTitle>YAML Preview</SheetTitle>
              </SheetHeader>
              <div className="h-[calc(80vh-60px)]">
                <YamlPreview />
              </div>
            </SheetContent>
          </Sheet>
          <ThemeToggle />
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'routes' && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-border p-3">
              <span className="font-semibold">Routes ({routes.length})</span>
              <Button size="sm" onClick={handleAddRoute} className="neo-btn h-8">
                <Plus className="mr-1 h-4 w-4" />
                Add
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-2">
                {routes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <RouteIcon className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-sm text-muted-foreground">No routes yet</p>
                    <Button size="sm" onClick={handleAddRoute} className="neo-btn mt-4">
                      <Plus className="mr-1 h-4 w-4" />
                      Add Route
                    </Button>
                  </div>
                ) : (
                  routes.map((route) => (
                    <div
                      key={route.id}
                      className="flex items-center gap-2 rounded-none border-2 border-foreground p-3 neo-shadow-sm bg-card"
                    >
                      <button
                        className="flex flex-1 items-center gap-2 text-left"
                        onClick={() => setSelectedRouteId(route.id)}
                      >
                        <Badge className={`${METHOD_COLORS[route.method]} text-white text-xs shrink-0`}>
                          {route.method}
                        </Badge>
                        <span className="truncate font-mono text-sm">{route.path}</span>
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteRouteId(route.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {activeTab === 'schemas' && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-border p-3">
              <span className="font-semibold">Schemas ({schemas.length})</span>
              <Button size="sm" onClick={handleAddSchema} className="neo-btn h-8">
                <Plus className="mr-1 h-4 w-4" />
                Add
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-2">
                {schemas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Box className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-sm text-muted-foreground">No schemas yet</p>
                    <Button size="sm" onClick={handleAddSchema} className="neo-btn mt-4">
                      <Plus className="mr-1 h-4 w-4" />
                      Add Schema
                    </Button>
                  </div>
                ) : (
                  schemas.map((schema) => (
                    <div
                      key={schema.id}
                      className="flex items-center gap-2 rounded-none border-2 border-foreground p-3 neo-shadow-sm bg-card"
                    >
                      <button
                        className="flex flex-1 items-center gap-2 text-left"
                        onClick={() => setSelectedSchemaId(schema.id)}
                      >
                        <Box className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate font-mono text-sm">{schema.name || 'Unnamed'}</span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {schema.type}
                        </Badge>
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteSchemaId(schema.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {activeTab === 'settings' && (
          <ScrollArea className="h-full">
            <SettingsPanel />
          </ScrollArea>
        )}
      </div>

      {/* Bottom Tab Bar */}
      <div className="shrink-0 flex border-t-2 border-foreground bg-background">
        <button
          className={`flex flex-1 flex-col items-center gap-1 py-3 transition-colors ${
            activeTab === 'routes'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          }`}
          onClick={() => setActiveTab('routes')}
        >
          <RouteIcon className="h-5 w-5" />
          <span className="text-xs font-medium">Routes</span>
        </button>
        <button
          className={`flex flex-1 flex-col items-center gap-1 py-3 transition-colors border-x-2 border-foreground ${
            activeTab === 'schemas'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          }`}
          onClick={() => setActiveTab('schemas')}
        >
          <Box className="h-5 w-5" />
          <span className="text-xs font-medium">Schemas</span>
        </button>
        <button
          className={`flex flex-1 flex-col items-center gap-1 py-3 transition-colors ${
            activeTab === 'settings'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          }`}
          onClick={() => setActiveTab('settings')}
        >
          <Settings className="h-5 w-5" />
          <span className="text-xs font-medium">Settings</span>
        </button>
      </div>

      {/* Delete Route Confirmation */}
      <AlertDialog open={!!deleteRouteId} onOpenChange={() => setDeleteRouteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Route?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the route.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteRouteId && handleDeleteRoute(deleteRouteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Schema Confirmation */}
      <AlertDialog open={!!deleteSchemaId} onOpenChange={() => setDeleteSchemaId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Schema?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteSchemaId && getSchemaUsageCount(deleteSchemaId) > 0
                ? `This schema is used in ${getSchemaUsageCount(deleteSchemaId)} place(s). Deleting it may break references.`
                : 'This action cannot be undone. This will permanently delete the schema.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteSchemaId && handleDeleteSchema(deleteSchemaId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
