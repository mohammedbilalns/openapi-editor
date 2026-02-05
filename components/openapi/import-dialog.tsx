'use client';

import React from "react"

import { useState, useRef } from 'react';
import { Upload, AlertCircle, FileText, CheckCircle2, Link, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEditorStore } from '@/lib/openapi/store';
import { parseYaml } from '@/lib/openapi/parser';
import { ValidationError } from '@/lib/openapi/types';
import { cn } from '@/lib/utils';
import { fetchOpenApiFromUrl } from '@/app/actions/fetch-openapi';

interface ImportDialogProps {
  trigger?: React.ReactNode;
}

export function ImportDialog({ trigger }: ImportDialogProps) {
  const { setDocument } = useEditorStore();
  const [open, setOpen] = useState(false);
  const [yamlContent, setYamlContent] = useState('');
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [importSuccess, setImportSuccess] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setYamlContent(content);
      setErrors([]);
      setImportSuccess(false);
    };
    reader.readAsText(file);
  };

  const handleFetchUrl = async () => {
    if (!urlInput.trim()) return;

    setIsLoadingUrl(true);
    setErrors([]);
    setImportSuccess(false);

    try {
      const result = await fetchOpenApiFromUrl(urlInput);
      
      if (result.error) {
        setErrors([
          {
            code: 'FETCH_ERROR',
            message: result.error,
            severity: 'error',
            location: {},
          },
        ]);
      } else if (result.content) {
        setYamlContent(result.content);
      }
    } catch (error) {
      setErrors([
        {
          code: 'FETCH_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch URL',
          severity: 'error',
          location: {},
        },
      ]);
    } finally {
      setIsLoadingUrl(false);
    }
  };

  const handleImport = () => {
    const result = parseYaml(yamlContent);

    if (result.errors.length > 0) {
      const criticalErrors = result.errors.filter((e) => e.severity === 'error');
      if (criticalErrors.length > 0 && !result.document) {
        setErrors(result.errors);
        return;
      }
    }

    if (result.document) {
      setDocument(result.document);
      setErrors(result.errors);
      setImportSuccess(true);

      // Auto-close on success with no errors
      if (result.errors.length === 0) {
        setTimeout(() => {
          setOpen(false);
          resetState();
        }, 1000);
      }
    }
  };

  const resetState = () => {
    setYamlContent('');
    setErrors([]);
    setImportSuccess(false);
    setUrlInput('');
    setIsLoadingUrl(false);
  };

  const handleClose = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      resetState();
    }
  };

  const hasErrors = errors.filter((e) => e.severity === 'error').length > 0;
  const hasWarnings = errors.filter((e) => e.severity === 'warning').length > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Upload className="mr-1 h-4 w-4" />
            Import
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl border-4 border-foreground neo-shadow-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold uppercase tracking-tight">Import OpenAPI Specification</DialogTitle>
          <DialogDescription className="font-mono text-sm">
            Import an existing OpenAPI 3.x YAML or JSON specification.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="paste" className="w-full">
          <div className="border-2 border-foreground bg-muted p-1">
            <TabsList className="grid w-full grid-cols-3 gap-1 bg-transparent p-0">
              <TabsTrigger 
                value="paste"
                className="border-2 border-transparent bg-transparent font-bold uppercase data-[state=active]:border-foreground data-[state=active]:bg-secondary data-[state=active]:neo-shadow-sm"
              >
                Paste YAML
              </TabsTrigger>
              <TabsTrigger 
                value="file"
                className="border-2 border-transparent bg-transparent font-bold uppercase data-[state=active]:border-foreground data-[state=active]:bg-secondary data-[state=active]:neo-shadow-sm"
              >
                Upload File
              </TabsTrigger>
              <TabsTrigger 
                value="url"
                className="border-2 border-transparent bg-transparent font-bold uppercase data-[state=active]:border-foreground data-[state=active]:bg-secondary data-[state=active]:neo-shadow-sm"
              >
                From URL
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="paste" className="mt-4">
            <Textarea
              placeholder="Paste your OpenAPI YAML here..."
              value={yamlContent}
              onChange={(e) => {
                setYamlContent(e.target.value);
                setErrors([]);
                setImportSuccess(false);
              }}
              className="h-64 border-2 border-foreground bg-background font-mono text-sm focus-visible:ring-0 focus-visible:border-accent"
            />
          </TabsContent>

          <TabsContent value="file" className="mt-4">
            <div
              className={cn(
                'flex h-64 cursor-pointer flex-col items-center justify-center border-4 border-dashed border-muted-foreground/50 transition-all',
                'hover:border-foreground hover:bg-muted/50'
              )}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".yaml,.yml,.json"
                onChange={handleFileUpload}
                className="hidden"
              />
              <FileText className="mb-3 h-12 w-12 text-muted-foreground" />
              <p className="font-bold uppercase text-muted-foreground">
                Click to upload or drag and drop
              </p>
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                YAML, YML, or JSON files
              </p>
            </div>
            {yamlContent && (
              <p className="mt-3 font-mono text-sm text-muted-foreground">
                File loaded ({yamlContent.length} characters)
              </p>
            )}
          </TabsContent>

          <TabsContent value="url" className="mt-4">
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Link className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="url"
                    placeholder="https://example.com/openapi.yaml"
                    value={urlInput}
                    onChange={(e) => {
                      setUrlInput(e.target.value);
                      setErrors([]);
                      setImportSuccess(false);
                    }}
                    className="h-12 w-full border-2 border-foreground bg-background pl-10 pr-3 font-mono text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-accent"
                  />
                </div>
                <Button
                  onClick={handleFetchUrl}
                  disabled={!urlInput.trim() || isLoadingUrl}
                  className="h-12 neo-btn-secondary"
                >
                  {isLoadingUrl ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Fetch'
                  )}
                </Button>
              </div>
              <div
                className={cn(
                  'flex h-48 flex-col items-center justify-center border-2 border-foreground bg-muted/30',
                  yamlContent && 'bg-secondary/30'
                )}
              >
                {yamlContent ? (
                  <div className="text-center">
                    <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-accent" />
                    <p className="font-mono text-sm text-muted-foreground">
                      Content loaded ({yamlContent.length} characters)
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <Link className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                    <p className="font-bold uppercase text-muted-foreground">
                      Enter a URL and click Fetch
                    </p>
                    <p className="mt-2 font-mono text-xs text-muted-foreground">
                      Supports YAML or JSON OpenAPI specs
                    </p>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Success Message */}
        {importSuccess && (
          <Alert className="border-green-500 bg-green-500/10">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <AlertTitle className="text-green-500">Import Successful</AlertTitle>
            <AlertDescription className="text-green-600">
              Your OpenAPI specification has been imported.
            </AlertDescription>
          </Alert>
        )}

        {/* Errors and Warnings */}
        {errors.length > 0 && (
          <ScrollArea className="max-h-48">
            <div className="space-y-2">
              {errors.map((error, index) => (
                <Alert
                  key={index}
                  variant={error.severity === 'error' ? 'destructive' : 'default'}
                  className={cn(
                    error.severity === 'warning' && 'border-amber-500 bg-amber-500/10'
                  )}
                >
                  <AlertCircle
                    className={cn(
                      'h-4 w-4',
                      error.severity === 'error' && 'text-destructive',
                      error.severity === 'warning' && 'text-amber-500'
                    )}
                  />
                  <AlertTitle
                    className={cn(
                      error.severity === 'warning' && 'text-amber-500'
                    )}
                  >
                    {error.code}
                  </AlertTitle>
                  <AlertDescription>{error.message}</AlertDescription>
                </Alert>
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="gap-3">
          <Button onClick={() => handleClose(false)} className="neo-btn-outline">
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!yamlContent.trim() || (hasErrors && !importSuccess)}
            className="neo-btn-accent"
          >
            {importSuccess ? 'Done' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
