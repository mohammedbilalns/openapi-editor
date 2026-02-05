'use client';

import React, { useState } from 'react';
import {
  FileJson,
  Route as RouteIcon,
  Box,
  Settings,
  Code,
  Undo2,
  Redo2,
  Download,
  Upload,
  PanelLeftOpen,
  Cloud,
  CloudOff,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
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
import { useEditorStore, type TabType } from '@/lib/openapi/store';
import { RouteEditor } from './route-editor';
import { SchemaEditor } from './schema-builder';
import { SettingsPanel } from './settings-panel';
import { YamlPreview } from './yaml-preview';
import { ImportDialog } from './import-dialog';
import { ThemeToggle } from '@/components/theme-toggle';
import { serializeToYaml } from '@/lib/openapi/serializer';

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500',
  POST: 'bg-blue-500',
  PUT: 'bg-amber-500',
  PATCH: 'bg-orange-500',
  DELETE: 'bg-red-500',
  HEAD: 'bg-purple-500',
  OPTIONS: 'bg-gray-500',
};

interface TabletEditorProps {
  isSaving: boolean;
  lastSaved: number | null;
  saveError: Error | null;
}

export function TabletEditor({ isSaving, lastSaved, saveError }: TabletEditorProps) {
  const [leftSheetOpen, setLeftSheetOpen] = useState(false);
  const [yamlSheetOpen, setYamlSheetOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteRouteId, setDeleteRouteId] = useState<string | null>(null);
  const [deleteSchemaId, setDeleteSchemaId] = useState<string | null>(null);

  const {
    document,
    activeTab,
    setActiveTab,
    selectedSchemaId,
    selectedRouteId,
    selectRoute,
    selectSchema,
    undo,
    redo,
    canUndo,
    canRedo,
    addRoute,
    addSchema,
    deleteRoute,
    deleteSchema,
    getSchemaUsageCount,
  } = useEditorStore();

  const routes = Array.from(document.routes.values());
  const schemas = Array.from(document.schemas.values());

  const handleExport = () => {
    const yaml = serializeToYaml(document);
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${document.info.title.toLowerCase().replace(/\s+/g, '-')}.yaml`;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleAddRoute = () => {
    const id = addRoute();
    selectRoute(id);
    setLeftSheetOpen(false);
  };

  const handleAddSchema = () => {
    const id = addSchema();
    selectSchema(id);
    setLeftSheetOpen(false);
  };

  const handleSelectRoute = (id: string) => {
    selectRoute(id);
    setLeftSheetOpen(false);
  };

  const handleSelectSchema = (id: string) => {
    selectSchema(id);
    setLeftSheetOpen(false);
  };

  const handleDeleteRoute = (id: string) => {
    deleteRoute(id);
    setDeleteRouteId(null);
  };

  const handleDeleteSchema = (id: string) => {
    deleteSchema(id);
    setDeleteSchemaId(null);
  };

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col bg-background">
        {/* Header */}
        <header className="flex h-14 items-center justify-between border-b-4 border-foreground px-4">
          <div className="flex items-center gap-3">
            {/* Open Sidebar Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLeftSheetOpen(true)}
              className="neo-btn h-8 px-2"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </Button>
            <FileJson className="h-6 w-6" />
            <span className="font-bold text-lg">{document.info.title}</span>
            <Badge variant="outline">v{document.info.version}</Badge>
            <div className="h-6 w-0.5 bg-foreground" />
            {/* Save Status */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {isSaving ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : lastSaved ? (
                <>
                  <Cloud className="h-3 w-3 text-green-600 dark:text-green-400" />
                  <span>Saved</span>
                </>
              ) : saveError ? (
                <>
                  <CloudOff className="h-3 w-3 text-destructive" />
                  <span>Error</span>
                </>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={undo}
                  disabled={!canUndo}
                  className="neo-btn h-8 w-8 p-0"
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Undo</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={redo}
                  disabled={!canRedo}
                  className="neo-btn h-8 w-8 p-0"
                >
                  <Redo2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Redo</TooltipContent>
            </Tooltip>
            <div className="h-6 w-0.5 bg-foreground" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setImportOpen(true)}
              className="neo-btn h-8 px-3"
            >
              <Upload className="mr-1 h-4 w-4" />
              Import
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExport}
              className="neo-btn h-8 px-3"
            >
              <Download className="mr-1 h-4 w-4" />
              Export
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setYamlSheetOpen(true)}
              className="neo-btn h-8 px-3"
            >
              <Code className="mr-1 h-4 w-4" />
              YAML
            </Button>
            <ThemeToggle />
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'routes' && selectedRouteId && (
            <RouteEditor routeId={selectedRouteId} />
          )}
          {activeTab === 'schemas' && selectedSchemaId && (
            <SchemaEditor schemaId={selectedSchemaId} />
          )}
          {activeTab === 'settings' && <SettingsPanel />}
          {((activeTab === 'routes' && !selectedRouteId) ||
            (activeTab === 'schemas' && !selectedSchemaId)) && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="text-muted-foreground mb-4">
                  {activeTab === 'routes' 
                    ? 'Select a route from the sidebar or create a new one' 
                    : 'Select a schema from the sidebar or create a new one'}
                </p>
                <Button onClick={() => setLeftSheetOpen(true)} className="neo-btn">
                  <PanelLeftOpen className="mr-2 h-4 w-4" />
                  Open Sidebar
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Left Sidebar Sheet */}
        <Sheet open={leftSheetOpen} onOpenChange={setLeftSheetOpen}>
          <SheetContent side="left" className="w-[320px] p-0">
            <SheetHeader className="border-b-2 border-foreground p-4">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col h-[calc(100vh-65px)]">
              {/* Tabs */}
              <div className="border-b-2 border-foreground p-2">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
                  <TabsList className="grid w-full grid-cols-3 rounded-none border-2 border-foreground">
                    <TabsTrigger value="routes" className="rounded-none data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      <RouteIcon className="mr-1 h-4 w-4" />
                      Routes
                    </TabsTrigger>
                    <TabsTrigger value="schemas" className="rounded-none data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      <Box className="mr-1 h-4 w-4" />
                      Schemas
                    </TabsTrigger>
                    <TabsTrigger value="settings" className="rounded-none data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      <Settings className="mr-1 h-4 w-4" />
                      Settings
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Content */}
              <ScrollArea className="flex-1">
                {activeTab === 'routes' && (
                  <div className="p-2 space-y-2">
                    <Button
                      onClick={handleAddRoute}
                      className="w-full neo-btn justify-start"
                      size="sm"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Route
                    </Button>
                    {routes.map((route) => (
                      <div
                        key={route.id}
                        className={`flex items-center gap-2 border-2 border-foreground p-2 cursor-pointer transition-colors ${
                          selectedRouteId === route.id
                            ? 'bg-primary/10'
                            : 'hover:bg-muted'
                        }`}
                      >
                        <button
                          className="flex flex-1 items-center gap-2 text-left min-w-0"
                          onClick={() => handleSelectRoute(route.id)}
                        >
                          <Badge className={`${METHOD_COLORS[route.method]} text-white text-xs shrink-0`}>
                            {route.method}
                          </Badge>
                          <span className="truncate font-mono text-sm">{route.path}</span>
                        </button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 shrink-0 text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteRouteId(route.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'schemas' && (
                  <div className="p-2 space-y-2">
                    <Button
                      onClick={handleAddSchema}
                      className="w-full neo-btn justify-start"
                      size="sm"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Schema
                    </Button>
                    {schemas.map((schema) => (
                      <div
                        key={schema.id}
                        className={`flex items-center gap-2 border-2 border-foreground p-2 cursor-pointer transition-colors ${
                          selectedSchemaId === schema.id
                            ? 'bg-primary/10'
                            : 'hover:bg-muted'
                        }`}
                      >
                        <button
                          className="flex flex-1 items-center gap-2 text-left min-w-0"
                          onClick={() => handleSelectSchema(schema.id)}
                        >
                          <Box className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate font-mono text-sm">
                            {schema.name || 'Unnamed'}
                          </span>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {schema.type}
                          </Badge>
                        </button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 shrink-0 text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteSchemaId(schema.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'settings' && (
                  <div className="p-2 text-sm text-muted-foreground">
                    Settings panel is shown in main view
                  </div>
                )}
              </ScrollArea>
            </div>
          </SheetContent>
        </Sheet>

        {/* YAML Preview Sheet */}
        <Sheet open={yamlSheetOpen} onOpenChange={setYamlSheetOpen}>
          <SheetContent side="right" className="w-[400px] p-0">
            <SheetHeader className="border-b-2 border-foreground p-4">
              <SheetTitle>YAML Preview</SheetTitle>
            </SheetHeader>
            <div className="h-[calc(100vh-65px)]">
              <YamlPreview />
            </div>
          </SheetContent>
        </Sheet>

        {/* Import Dialog */}
        <ImportDialog open={importOpen} onOpenChange={setImportOpen} />

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
    </TooltipProvider>
  );
}
