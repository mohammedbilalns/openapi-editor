import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '@/lib/openapi/store';
import { setWorkspaceAdapter } from './index';
import { useWorkspaceStore } from './state';
import { WebWorkspaceAdapter } from './web-adapter';

describe('useWorkspaceStore', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().closeProject();
  });

  afterEach(() => {
    setWorkspaceAdapter(null);
  });

  it('opens a multi-file project and loads the resolved document into the store', async () => {
    const adapter = new WebWorkspaceAdapter(
      {
        'openapi.yaml': `
openapi: 3.0.3
info:
  title: State Test API
  version: 1.0.0
paths: {}
components:
  schemas:
    Pet:
      $ref: './schemas/pet.yaml'
`,
        'schemas/pet.yaml': `
type: object
properties:
  id:
    type: integer
`,
      },
      {
        rootPath: '/projects/petstore',
        entryFile: 'openapi.yaml',
        name: 'petstore',
      },
    );

    setWorkspaceAdapter(adapter);

    const success = await useWorkspaceStore.getState().openProject();
    expect(success).toBe(true);

    const state = useWorkspaceStore.getState();
    expect(state.activeProject?.name).toBe('petstore');
    expect(state.loadedFiles).toContain('openapi.yaml');
    expect(state.loadedFiles).toContain('schemas/pet.yaml');

    // Store document has the loaded schema
    const doc = useEditorStore.getState().document;
    expect(doc.info.title).toBe('State Test API');
    const petSchema = Array.from(doc.schemas.values()).find((s) => s.name === 'Pet');
    expect(petSchema).toBeDefined();
    expect(petSchema?.origin?.filePath).toBe('schemas/pet.yaml');
  });

  it('handles cancellation gracefully', async () => {
    const adapter = new WebWorkspaceAdapter(); // openProject returns null
    setWorkspaceAdapter(adapter);

    const success = await useWorkspaceStore.getState().openProject();
    expect(success).toBe(false);
    expect(useWorkspaceStore.getState().activeProject).toBeNull();
  });

  it('saves modified project to disk', async () => {
    const adapter = new WebWorkspaceAdapter(
      {
        'openapi.yaml': `
openapi: 3.0.3
info:
  title: Save Test
  version: 1.0.0
paths: {}
components:
  schemas:
    Item:
      $ref: './schemas/item.yaml'
`,
        'schemas/item.yaml': `
type: object
properties:
  name:
    type: string
`,
      },
      {
        rootPath: '/projects/items',
        entryFile: 'openapi.yaml',
        name: 'items',
      },
    );

    setWorkspaceAdapter(adapter);
    await useWorkspaceStore.getState().openProject();

    // Edit schema
    const doc = useEditorStore.getState().document;
    const item = Array.from(doc.schemas.values()).find((s) => s.name === 'Item')!;
    item.description = 'Saved Item';

    const saved = await useWorkspaceStore.getState().saveToDisk();
    expect(saved).toBe(true);

    const onDiskContent = await adapter.readFile('schemas/item.yaml');
    expect(onDiskContent).toContain('Saved Item');
  });
});
