import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getWorkspaceAdapter, setWorkspaceAdapter } from './index';
import { WebWorkspaceAdapter } from './web-adapter';

describe('WebWorkspaceAdapter', () => {
  it('reads and writes in-memory files with path normalization', async () => {
    const adapter = new WebWorkspaceAdapter({
      'schemas/user.yaml': 'type: object',
    });

    expect(await adapter.readFile('schemas/user.yaml')).toBe('type: object');
    expect(await adapter.readFile('./schemas/user.yaml')).toBe('type: object');
    expect(await adapter.readFile('/schemas/user.yaml')).toBe('type: object');

    await adapter.writeFile('./paths/users.yaml', 'get:\n  summary: List');
    expect(await adapter.readFile('paths/users.yaml')).toBe('get:\n  summary: List');
  });

  it('throws an error for non-existent files', async () => {
    const adapter = new WebWorkspaceAdapter();
    await expect(adapter.readFile('missing.yaml')).rejects.toThrow('File not found');
  });

  it('lists directory contents with prefix matching', async () => {
    const adapter = new WebWorkspaceAdapter({
      'openapi.yaml': 'openapi: 3.0.0',
      'schemas/user.yaml': 'type: object',
      'schemas/order.yaml': 'type: object',
      'paths/users.yaml': 'get: {}',
    });

    const rootFiles = await adapter.readDir();
    expect(rootFiles).toContain('openapi.yaml');
    expect(rootFiles).toContain('schemas/user.yaml');

    const schemaFiles = await adapter.readDir('schemas');
    expect(schemaFiles).toEqual(['schemas/user.yaml', 'schemas/order.yaml']);
  });

  it('manages current project metadata', async () => {
    const adapter = new WebWorkspaceAdapter();
    expect(await adapter.openProject()).toBeNull();

    adapter.setCurrentProject({
      rootPath: 'virtual-root',
      entryFile: 'openapi.yaml',
      name: 'Test Project',
    });

    const project = await adapter.openProject();
    expect(project).toEqual({
      rootPath: 'virtual-root',
      entryFile: 'openapi.yaml',
      name: 'Test Project',
    });
  });
});

describe('Workspace factory', () => {
  afterEach(() => {
    setWorkspaceAdapter(null);
  });

  it('provides default WebWorkspaceAdapter in browser mode', () => {
    const adapter = getWorkspaceAdapter();
    expect(adapter.isNative).toBe(false);
  });

  it('allows overriding adapter instance', () => {
    const custom = new WebWorkspaceAdapter();
    setWorkspaceAdapter(custom);
    expect(getWorkspaceAdapter()).toBe(custom);
  });
});
