'use client';

import { useState } from 'react';
import { Plus, Trash2, Server, Shield, Tag, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useEditorStore } from '@/lib/openapi/store';
import { generateId } from '@/lib/openapi/types';
import { useIsMobile } from '@/hooks/use-mobile';
import { useContainerWidth } from '@/hooks/use-container-width';

export function SettingsPanel() {
  const isMobileScreen = useIsMobile();
  const { ref: containerRef, isCompact: isCompactContainer } = useContainerWidth(500);
  
  // Use compact layout if on mobile OR if the container is narrow (e.g., YAML sidebar open)
  const isMobile = isMobileScreen || isCompactContainer;
  
  const {
    document,
    updateInfo,
    addServer,
    updateServer,
    deleteServer,
    addSecurityScheme,
    updateSecurityScheme,
    deleteSecurityScheme,
    addTag,
    deleteTag,
  } = useEditorStore();

  const [newServerDialogOpen, setNewServerDialogOpen] = useState(false);
  const [newServerUrl, setNewServerUrl] = useState('');
  const [newServerDesc, setNewServerDesc] = useState('');

  const [newSecurityDialogOpen, setNewSecurityDialogOpen] = useState(false);
  const [newSecurityName, setNewSecurityName] = useState('');
  const [newSecurityType, setNewSecurityType] = useState<'apiKey' | 'http' | 'oauth2'>('http');

  const [newTagDialogOpen, setNewTagDialogOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagDesc, setNewTagDesc] = useState('');

  const handleAddServer = () => {
    if (!newServerUrl.trim()) return;
    addServer({
      url: newServerUrl.trim(),
      description: newServerDesc.trim() || undefined,
    });
    setNewServerDialogOpen(false);
    setNewServerUrl('');
    setNewServerDesc('');
  };

  const handleAddSecurityScheme = () => {
    if (!newSecurityName.trim()) return;
    addSecurityScheme({
      id: generateId(),
      name: newSecurityName.trim(),
      type: newSecurityType,
      scheme: newSecurityType === 'http' ? 'bearer' : undefined,
      in: newSecurityType === 'apiKey' ? 'header' : undefined,
      paramName: newSecurityType === 'apiKey' ? 'X-API-Key' : undefined,
    });
    setNewSecurityDialogOpen(false);
    setNewSecurityName('');
    setNewSecurityType('http');
  };

  const handleAddTag = () => {
    if (!newTagName.trim()) return;
    addTag({
      name: newTagName.trim(),
      description: newTagDesc.trim() || undefined,
    });
    setNewTagDialogOpen(false);
    setNewTagName('');
    setNewTagDesc('');
  };

  return (
    <ScrollArea className="h-full">
      <div ref={containerRef} className={`space-y-6 overflow-x-hidden ${isMobile ? 'p-4' : 'p-6'}`}>
        <Accordion type="multiple" defaultValue={['info', 'servers', 'security', 'tags']}>
          {/* API Info Section */}
          <AccordionItem value="info" className="border-2 border-foreground">
            <AccordionTrigger className="px-4 font-bold uppercase hover:bg-muted hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center border-2 border-foreground bg-secondary">
                  <Info className="h-4 w-4" />
                </div>
                API Information
              </div>
            </AccordionTrigger>
            <AccordionContent className="border-t-2 border-foreground">
              <div className="grid gap-4 p-4">
                <div className="grid gap-2">
                  <Label htmlFor="apiTitle" className="font-bold uppercase">Title</Label>
                  <Input
                    id="apiTitle"
                    value={document.info.title}
                    onChange={(e) => updateInfo({ title: e.target.value })}
                    className="border-2 border-foreground bg-background focus-visible:ring-0 focus-visible:border-accent"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="apiVersion">Version</Label>
                  <Input
                    id="apiVersion"
                    value={document.info.version}
                    onChange={(e) => updateInfo({ version: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="apiDescription">Description</Label>
                  <Textarea
                    id="apiDescription"
                    value={document.info.description || ''}
                    onChange={(e) => updateInfo({ description: e.target.value })}
                    className="h-24"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="termsOfService">Terms of Service URL</Label>
                  <Input
                    id="termsOfService"
                    placeholder="https://example.com/terms"
                    value={document.info.termsOfService || ''}
                    onChange={(e) => updateInfo({ termsOfService: e.target.value || undefined })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label className={isMobile ? 'text-base' : ''}>Contact</Label>
                  <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-3'}`}>
                    <Input
                      placeholder="Name"
                      value={document.info.contact?.name || ''}
                      onChange={(e) =>
                        updateInfo({
                          contact: { ...document.info.contact, name: e.target.value || undefined },
                        })
                      }
                      className={isMobile ? 'h-12 text-base' : ''}
                    />
                    <Input
                      placeholder="Email"
                      value={document.info.contact?.email || ''}
                      onChange={(e) =>
                        updateInfo({
                          contact: { ...document.info.contact, email: e.target.value || undefined },
                        })
                      }
                      className={isMobile ? 'h-12 text-base' : ''}
                    />
                    <Input
                      placeholder="URL"
                      value={document.info.contact?.url || ''}
                      onChange={(e) =>
                        updateInfo({
                          contact: { ...document.info.contact, url: e.target.value || undefined },
                        })
                      }
                      className={isMobile ? 'h-12 text-base' : ''}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label className={isMobile ? 'text-base' : ''}>License</Label>
                  <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    <Input
                      placeholder="License Name (e.g., MIT)"
                      value={document.info.license?.name || ''}
                      onChange={(e) =>
                        updateInfo({
                          license: e.target.value
                            ? { name: e.target.value, url: document.info.license?.url }
                            : undefined,
                        })
                      }
                      className={isMobile ? 'h-12 text-base' : ''}
                    />
                    <Input
                      placeholder="License URL"
                      value={document.info.license?.url || ''}
                      onChange={(e) =>
                        updateInfo({
                          license: document.info.license
                            ? { ...document.info.license, url: e.target.value || undefined }
                            : undefined,
                        })
                      }
                      className={isMobile ? 'h-12 text-base' : ''}
                    />
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Servers Section */}
          <AccordionItem value="servers" className="border-2 border-foreground mt-4">
            <AccordionTrigger className="px-4 font-bold uppercase hover:bg-muted hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center border-2 border-foreground bg-accent">
                  <Server className="h-4 w-4" />
                </div>
                Servers
              </div>
            </AccordionTrigger>
            <AccordionContent className="border-t-2 border-foreground p-4">
              <div className="space-y-3">
                {document.servers.length === 0 ? (
                  <div className={`border-2 border-dashed border-muted-foreground/50 text-center ${isMobile ? 'p-8' : 'p-6'}`}>
                    <p className={`font-mono text-muted-foreground ${isMobile ? 'text-base' : 'text-sm'}`}>No servers defined</p>
                  </div>
                ) : (
                  document.servers.map((server, index) => (
                    <Card key={index}>
                      <CardContent className={`${isMobile ? 'p-4 space-y-3' : 'flex items-start gap-2 p-3'}`}>
                        <div className={`${isMobile ? 'space-y-3' : 'flex-1 space-y-2'}`}>
                          <Input
                            value={server.url}
                            onChange={(e) =>
                              updateServer(index, { ...server, url: e.target.value })
                            }
                            className={`font-mono ${isMobile ? 'text-base h-12' : 'text-sm'}`}
                          />
                          <Input
                            placeholder="Description"
                            value={server.description || ''}
                            onChange={(e) =>
                              updateServer(index, {
                                ...server,
                                description: e.target.value || undefined,
                              })
                            }
                            className={isMobile ? 'text-base h-12' : 'text-sm'}
                          />
                        </div>
                        <Button
                          variant="destructive"
                          size={isMobile ? 'default' : 'icon'}
                          onClick={() => deleteServer(index)}
                          className={isMobile ? 'w-full h-12 mt-2' : ''}
                        >
                          <Trash2 className={isMobile ? 'h-5 w-5 mr-2' : 'h-4 w-4'} />
                          {isMobile && 'Delete Server'}
                        </Button>
                      </CardContent>
                    </Card>
                  ))
                )}

                <Dialog open={newServerDialogOpen} onOpenChange={setNewServerDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size={isMobile ? 'lg' : 'sm'} className={`w-full bg-transparent ${isMobile ? 'h-14 text-base' : ''}`}>
                      <Plus className={isMobile ? 'mr-2 h-5 w-5' : 'mr-1 h-4 w-4'} />
                      Add Server
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Server</DialogTitle>
                      <DialogDescription>
                        Add a server URL for your API.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label>URL</Label>
                        <Input
                          placeholder="https://api.example.com/v1"
                          value={newServerUrl}
                          onChange={(e) => setNewServerUrl(e.target.value)}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Description</Label>
                        <Input
                          placeholder="Production server"
                          value={newServerDesc}
                          onChange={(e) => setNewServerDesc(e.target.value)}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setNewServerDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddServer} disabled={!newServerUrl.trim()}>
                        Add
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Security Schemes Section */}
          <AccordionItem value="security" className="border-2 border-foreground mt-4">
            <AccordionTrigger className="px-4 font-bold uppercase hover:bg-muted hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center border-2 border-foreground bg-destructive">
                  <Shield className="h-4 w-4 text-destructive-foreground" />
                </div>
                Security Schemes
              </div>
            </AccordionTrigger>
            <AccordionContent className="border-t-2 border-foreground p-4">
              <div className="space-y-3">
                {document.securitySchemes.size === 0 ? (
                  <div className={`border-2 border-dashed border-muted-foreground/50 text-center ${isMobile ? 'p-8' : 'p-6'}`}>
                    <p className={`font-mono text-muted-foreground ${isMobile ? 'text-base' : 'text-sm'}`}>No security schemes defined</p>
                  </div>
                ) : (
                  Array.from(document.securitySchemes.values()).map((scheme) => (
                    <Card key={scheme.id}>
                      <CardContent className={`${isMobile ? 'p-4 space-y-3' : 'flex items-start gap-2 p-3'}`}>
                        <div className={`${isMobile ? 'space-y-3' : 'flex-1 space-y-2'}`}>
                          <div className={`${isMobile ? 'space-y-3' : 'flex items-center gap-2'}`}>
                            <Input
                              value={scheme.name}
                              onChange={(e) =>
                                updateSecurityScheme(scheme.id, { name: e.target.value })
                              }
                              className={`font-mono ${isMobile ? 'text-base h-12' : 'text-sm'}`}
                            />
                            <Badge variant="secondary" className={isMobile ? 'text-sm py-1 px-3' : ''}>{scheme.type}</Badge>
                          </div>
                          {scheme.type === 'http' && (
                            <Select
                              value={scheme.scheme || 'bearer'}
                              onValueChange={(v) =>
                                updateSecurityScheme(scheme.id, { scheme: v })
                              }
                            >
                              <SelectTrigger className={isMobile ? 'h-12 text-base' : ''}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="bearer" className={isMobile ? 'text-base py-3' : ''}>Bearer</SelectItem>
                                <SelectItem value="basic" className={isMobile ? 'text-base py-3' : ''}>Basic</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                          {scheme.type === 'apiKey' && (
                            <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
                              <Select
                                value={scheme.in || 'header'}
                                onValueChange={(v) =>
                                  updateSecurityScheme(scheme.id, {
                                    in: v as 'header' | 'query' | 'cookie',
                                  })
                                }
                              >
                                <SelectTrigger className={isMobile ? 'h-12 text-base' : ''}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="header" className={isMobile ? 'text-base py-3' : ''}>Header</SelectItem>
                                  <SelectItem value="query" className={isMobile ? 'text-base py-3' : ''}>Query</SelectItem>
                                  <SelectItem value="cookie" className={isMobile ? 'text-base py-3' : ''}>Cookie</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input
                                placeholder="Parameter name"
                                value={scheme.paramName || ''}
                                onChange={(e) =>
                                  updateSecurityScheme(scheme.id, {
                                    paramName: e.target.value,
                                  })
                                }
                                className={isMobile ? 'h-12 text-base' : ''}
                              />
                            </div>
                          )}
                        </div>
                        <Button
                          variant="destructive"
                          size={isMobile ? 'default' : 'icon'}
                          onClick={() => deleteSecurityScheme(scheme.id)}
                          className={isMobile ? 'w-full h-12 mt-2' : ''}
                        >
                          <Trash2 className={isMobile ? 'h-5 w-5 mr-2' : 'h-4 w-4'} />
                          {isMobile && 'Delete Scheme'}
                        </Button>
                      </CardContent>
                    </Card>
                  ))
                )}

                <Dialog open={newSecurityDialogOpen} onOpenChange={setNewSecurityDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size={isMobile ? 'lg' : 'sm'} className={`w-full bg-transparent ${isMobile ? 'h-14 text-base' : ''}`}>
                      <Plus className={isMobile ? 'mr-2 h-5 w-5' : 'mr-1 h-4 w-4'} />
                      Add Security Scheme
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Security Scheme</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label className={isMobile ? 'text-base' : ''}>Name</Label>
                        <Input
                          placeholder="e.g., bearerAuth"
                          value={newSecurityName}
                          onChange={(e) => setNewSecurityName(e.target.value)}
                          className={isMobile ? 'h-12 text-base' : ''}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className={isMobile ? 'text-base' : ''}>Type</Label>
                        <Select
                          value={newSecurityType}
                          onValueChange={(v) => setNewSecurityType(v as any)}
                        >
                          <SelectTrigger className={isMobile ? 'h-12 text-base' : ''}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="http" className={isMobile ? 'text-base py-3' : ''}>HTTP (Bearer/Basic)</SelectItem>
                            <SelectItem value="apiKey" className={isMobile ? 'text-base py-3' : ''}>API Key</SelectItem>
                            <SelectItem value="oauth2" className={isMobile ? 'text-base py-3' : ''}>OAuth 2.0</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setNewSecurityDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddSecurityScheme} disabled={!newSecurityName.trim()}>
                        Add
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Tags Section */}
          <AccordionItem value="tags" className="border-2 border-foreground mt-4">
            <AccordionTrigger className="px-4 font-bold uppercase hover:bg-muted hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center border-2 border-foreground bg-muted">
                  <Tag className="h-4 w-4" />
                </div>
                Tags
              </div>
            </AccordionTrigger>
            <AccordionContent className="border-t-2 border-foreground p-4">
              <div className={`space-y-3 ${isMobile ? 'space-y-4' : ''}`}>
                {document.tags.length === 0 ? (
                  <div className={`border-2 border-dashed border-muted-foreground/50 text-center ${isMobile ? 'p-8' : 'p-6'}`}>
                    <p className={`font-mono text-muted-foreground ${isMobile ? 'text-base' : 'text-sm'}`}>No tags defined</p>
                  </div>
                ) : isMobile ? (
                  <div className="space-y-2">
                    {document.tags.map((tag) => (
                      <div
                        key={tag.name}
                        className="flex items-center justify-between border-2 border-foreground bg-secondary p-3"
                      >
                        <div>
                          <span className="font-bold uppercase text-base">{tag.name}</span>
                          {tag.description && (
                            <p className="text-sm text-muted-foreground mt-1">{tag.description}</p>
                          )}
                        </div>
                        <Button
                          variant="destructive"
                          size="default"
                          onClick={() => deleteTag(tag.name)}
                          className="h-10 px-4"
                        >
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {document.tags.map((tag) => (
                      <Badge
                        key={tag.name}
                        className="cursor-pointer border-2 border-foreground bg-secondary text-foreground font-bold uppercase hover:bg-destructive hover:text-destructive-foreground transition-colors"
                        onClick={() => deleteTag(tag.name)}
                      >
                        {tag.name}
                        <Trash2 className="ml-2 h-3 w-3" />
                      </Badge>
                    ))}
                  </div>
                )}

                <Dialog open={newTagDialogOpen} onOpenChange={setNewTagDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size={isMobile ? 'lg' : 'sm'} className={`w-full bg-transparent ${isMobile ? 'h-14 text-base' : ''}`}>
                      <Plus className={isMobile ? 'mr-2 h-5 w-5' : 'mr-1 h-4 w-4'} />
                      Add Tag
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Tag</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label className={isMobile ? 'text-base' : ''}>Name</Label>
                        <Input
                          placeholder="e.g., users"
                          value={newTagName}
                          onChange={(e) => setNewTagName(e.target.value)}
                          className={isMobile ? 'h-12 text-base' : ''}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className={isMobile ? 'text-base' : ''}>Description</Label>
                        <Input
                          placeholder="User management endpoints"
                          value={newTagDesc}
                          onChange={(e) => setNewTagDesc(e.target.value)}
                          className={isMobile ? 'h-12 text-base' : ''}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setNewTagDialogOpen(false)} className={isMobile ? 'h-12 text-base' : ''}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddTag} disabled={!newTagName.trim()} className={isMobile ? 'h-12 text-base' : ''}>
                        Add
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </ScrollArea>
  );
}
