'use client';

import React, { useEffect } from "react"

import { useState } from 'react';
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
  FileCode,
  Cloud,
  CloudOff,
  Loader2,
} from 'lucide-react';
import { usePersistence, useLoadProject } from '@/hooks/use-persistence';
import { useDeviceType } from '@/hooks/use-mobile';
import { MobileEditor } from './mobile-editor';
import { TabletEditor } from './tablet-editor';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useEditorStore } from '@/lib/openapi/store';
import { SchemaList, SchemaEditor } from './schema-builder';
import { RouteList, RouteEditor } from './route-editor';
import { YamlPreview } from './yaml-preview';
import { SettingsPanel } from './settings-panel';
import { ImportDialog } from './import-dialog';
import { NodeId } from '@/lib/openapi/types';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';

export function OpenApiEditor() {
  const deviceType = useDeviceType();
  
  const {
    document,
    documentVersion,
    activeTab,
    setActiveTab,
    selectedSchemaId,
    selectedRouteId,
    yamlPreviewOpen,
    setYamlPreviewOpen,
    undo,
    redo,
    canUndo,
    canRedo,
    initializeDocument,
  } = useEditorStore();

  const [showYaml, setShowYaml] = useState(false);
  
  // Load project from IndexedDB on mount
  const { document: loadedDocument, isLoading: isLoadingProject } = useLoadProject();
  
  // Initialize store with loaded document
  useEffect(() => {
    if (loadedDocument) {
      initializeDocument(loadedDocument);
    }
  }, [loadedDocument, initializeDocument]);
  
  // Auto-save to IndexedDB
  const { isSaving, lastSaved, error: saveError } = usePersistence(document, documentVersion);

  // Show loading state while loading from IndexedDB
  if (isLoadingProject) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading project...</span>
        </div>
      </div>
    );
  }

  // Render mobile editor for phones
  if (deviceType === 'mobile') {
    return <MobileEditor isSaving={isSaving} lastSaved={lastSaved} saveError={saveError} />;
  }

  // Render tablet editor for tablets
  if (deviceType === 'tablet') {
    return <TabletEditor isSaving={isSaving} lastSaved={lastSaved} saveError={saveError} />;
  }

  // Desktop layout
  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col bg-background">
        {/* Top Toolbar */}
        <header className="flex h-16 items-center justify-between border-b-4 border-foreground px-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-secondary neo-shadow-sm">
                <FileJson className="h-5 w-5 text-foreground" />
              </div>
              <span className="text-xl font-bold uppercase tracking-tight text-foreground">OpenAPI Editor</span>
            </div>
            <div className="h-8 w-1 bg-foreground" />
            <span className="font-mono text-sm text-muted-foreground">
              {document.info.title} v{document.info.version}
            </span>
            <div className="h-8 w-1 bg-foreground" />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
                  <span>Error saving</span>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={undo}
                  disabled={!canUndo()}
                  className="border-2 border-foreground bg-background hover:bg-muted hover:neo-shadow-sm disabled:opacity-40"
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Undo</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={redo}
                  disabled={!canRedo()}
                  className="border-2 border-foreground bg-background hover:bg-muted hover:neo-shadow-sm disabled:opacity-40"
                >
                  <Redo2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Redo</TooltipContent>
            </Tooltip>

            <div className="h-8 w-1 bg-foreground" />

            <ImportDialog
              trigger={
                <Button className="neo-btn-secondary">
                  <Upload className="mr-2 h-4 w-4" />
                  Import
                </Button>
              }
            />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className={cn(
                    "border-2 border-foreground font-bold uppercase transition-all",
                    showYaml 
                      ? "bg-accent text-foreground neo-shadow-sm" 
                      : "bg-background text-foreground hover:bg-muted"
                  )}
                  onClick={() => setShowYaml(!showYaml)}
                >
                  <Code className="mr-2 h-4 w-4" />
                  YAML
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle YAML Preview</TooltipContent>
            </Tooltip>

            <div className="h-8 w-1 bg-foreground" />

            <ThemeToggle />
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          <ResizablePanelGroup direction="horizontal">
            {/* Left Sidebar - Navigation */}
            <ResizablePanel defaultSize={25} minSize={20} maxSize={35} className="overflow-hidden">
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as 'routes' | 'schemas' | 'settings')}
                className="flex h-full flex-col"
              >
                <div className="m-3 flex gap-1 border-2 border-foreground bg-muted p-1">
                  <TabsList className="grid w-full grid-cols-3 gap-1 bg-transparent p-0">
                    <TabsTrigger 
                      value="routes" 
                      className="gap-2 border-2 border-transparent bg-transparent font-bold uppercase data-[state=active]:border-foreground data-[state=active]:bg-secondary data-[state=active]:neo-shadow-sm"
                    >
                      <RouteIcon className="h-4 w-4" />
                      <span className="hidden sm:inline">Routes</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="schemas" 
                      className="gap-2 border-2 border-transparent bg-transparent font-bold uppercase data-[state=active]:border-foreground data-[state=active]:bg-secondary data-[state=active]:neo-shadow-sm"
                    >
                      <Box className="h-4 w-4" />
                      <span className="hidden sm:inline">Schemas</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="settings" 
                      className="gap-2 border-2 border-transparent bg-transparent font-bold uppercase data-[state=active]:border-foreground data-[state=active]:bg-secondary data-[state=active]:neo-shadow-sm"
                    >
                      <Settings className="h-4 w-4" />
                      <span className="hidden sm:inline">Settings</span>
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="routes" className="mt-0 flex-1 overflow-hidden">
                  <RouteList onSelect={(id) => {}} />
                </TabsContent>
                <TabsContent value="schemas" className="mt-0 flex-1 overflow-hidden">
                  <SchemaList onSelect={(id) => {}} />
                </TabsContent>
                <TabsContent value="settings" className="mt-0 flex-1 overflow-hidden">
                  <div className="p-2 text-sm text-muted-foreground">
                    Settings sidebar
                  </div>
                </TabsContent>
              </Tabs>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Center Panel - Editor */}
            <ResizablePanel defaultSize={showYaml ? 45 : 75} minSize={30}>
              <div className="h-full overflow-hidden">
                {activeTab === 'routes' && selectedRouteId && (
                  <RouteEditor routeId={selectedRouteId} />
                )}
                {activeTab === 'routes' && !selectedRouteId && (
                  <EmptyState
                    icon={<RouteIcon className="h-12 w-12" />}
                    title="No Route Selected"
                    description="Select a route from the list or create a new one to start editing."
                  />
                )}
                {activeTab === 'schemas' && selectedSchemaId && (
                  <SchemaEditor schemaId={selectedSchemaId} />
                )}
                {activeTab === 'schemas' && !selectedSchemaId && (
                  <EmptyState
                    icon={<Box className="h-12 w-12" />}
                    title="No Schema Selected"
                    description="Select a schema from the list or create a new one to start editing."
                  />
                )}
                {activeTab === 'settings' && <SettingsPanel />}
              </div>
            </ResizablePanel>

            {/* Right Panel - YAML Preview */}
            {showYaml && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={30} minSize={20}>
                  <YamlPreview />
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </div>
      </div>
    </TooltipProvider>
  );
}

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <div className="mb-6 flex h-24 w-24 items-center justify-center border-4 border-dashed border-muted-foreground/50">
        <div className="text-muted-foreground">{icon}</div>
      </div>
      <h3 className="text-xl font-bold uppercase tracking-tight text-foreground">{title}</h3>
      <p className="mt-2 max-w-sm text-center font-mono text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
