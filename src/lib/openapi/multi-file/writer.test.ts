import { describe, expect, it } from 'vitest';
import { WebWorkspaceAdapter } from '../../workspace';
import { resolveMultiFileSpec } from './resolver';
import { saveMultiFileProject, serializeMultiFileDocument } from './writer';

describe('serializeMultiFileDocument & saveMultiFileProject', () => {
  it('serializes standalone schemas and path items to separate files and preserves refs in entry file', async () => {
    const adapter = new WebWorkspaceAdapter({
      'openapi.yaml': `
openapi: 3.0.3
info:
  title: Multi-File Store
  version: 1.0.0
paths:
  /users:
    $ref: './paths/users.yaml'
components:
  schemas:
    User:
      $ref: './schemas/user.yaml'
`,
      'schemas/user.yaml': `
type: object
description: User Model
properties:
  id:
    type: string
`,
      'paths/users.yaml': `
get:
  summary: Get Users
  responses:
    '200':
      description: OK
`,
    });

    // 1. Resolve multi-file project
    const { document: doc } = await resolveMultiFileSpec(adapter, 'openapi.yaml');
    expect(doc).not.toBeNull();

    // 2. Serialize multi-file document
    const serializedFiles = serializeMultiFileDocument(doc, 'openapi.yaml');
    expect(serializedFiles.has('schemas/user.yaml')).toBe(true);
    expect(serializedFiles.has('paths/users.yaml')).toBe(true);
    expect(serializedFiles.has('openapi.yaml')).toBe(true);

    // Standalone schema content contains the schema definition
    const userSchemaYaml = serializedFiles.get('schemas/user.yaml') ?? '';
    expect(userSchemaYaml).toContain('type: object');
    expect(userSchemaYaml).toContain('description: User Model');

    // Standalone path item content contains the operations
    const usersPathYaml = serializedFiles.get('paths/users.yaml') ?? '';
    expect(usersPathYaml).toContain('summary: Get Users');

    // Root entry file keeps external $refs
    const rootYaml = serializedFiles.get('openapi.yaml') ?? '';
    expect(rootYaml).toContain('$ref: ./schemas/user.yaml');
    expect(rootYaml).toContain('$ref: ./paths/users.yaml');
  });

  it('performs targeted per-file save when dirtyFiles is specified', async () => {
    const adapter = new WebWorkspaceAdapter({
      'openapi.yaml': `
openapi: 3.0.3
info:
  title: Multi-File Store
  version: 1.0.0
paths: {}
components:
  schemas:
    User:
      $ref: './schemas/user.yaml'
`,
      'schemas/user.yaml': `
type: object
description: Original
`,
    });

    const { document: doc } = await resolveMultiFileSpec(adapter, 'openapi.yaml');
    const userSchema = Array.from(doc.schemas.values()).find((s) => s.name === 'User')!;
    userSchema.description = 'Updated User Description';

    // Only save schemas/user.yaml
    const { writtenFiles } = await saveMultiFileProject(
      adapter,
      doc,
      'openapi.yaml',
      new Set(['schemas/user.yaml']),
    );

    expect(writtenFiles).toEqual(['schemas/user.yaml']);
    expect(await adapter.readFile('schemas/user.yaml')).toContain('Updated User Description');
  });

  it('completes a full edit-save-reload round-trip correctly', async () => {
    const adapter = new WebWorkspaceAdapter({
      'openapi.yaml': `
openapi: 3.0.3
info:
  title: Roundtrip API
  version: 1.0.0
paths: {}
components:
  schemas:
    User:
      $ref: './schemas/user.yaml'
`,
      'schemas/user.yaml': `
type: object
properties:
  name:
    type: string
`,
    });

    // Step 1: Load
    const loaded = await resolveMultiFileSpec(adapter, 'openapi.yaml');
    const user = Array.from(loaded.document.schemas.values()).find((s) => s.name === 'User')!;

    // Step 2: Edit
    user.description = 'Added description in editor';

    // Step 3: Save
    await saveMultiFileProject(adapter, loaded.document, 'openapi.yaml');

    // Step 4: Re-load
    const reloaded = await resolveMultiFileSpec(adapter, 'openapi.yaml');
    const reloadedUser = Array.from(reloaded.document.schemas.values()).find((s) => s.name === 'User')!;
    expect(reloadedUser.description).toBe('Added description in editor');
  });

  it('serializes multi-path files and preserves JSON format and pointer refs', async () => {
    const adapter = new WebWorkspaceAdapter({
      'openapi.json': JSON.stringify({
        openapi: '3.0.0',
        info: { title: 'Multi Path JSON API', version: '1.0.0' },
        paths: {
          '/auth/login': { $ref: './paths/auth.json#/~1auth~1login' },
          '/auth/refresh': { $ref: './paths/auth.json#/~1auth~1refresh' },
        },
      }),
      'paths/auth.json': JSON.stringify({
        '/auth/login': {
          post: { summary: 'Login Original' },
        },
        '/auth/refresh': {
          post: { summary: 'Refresh Original' },
        },
      }),
    });

    const { document: doc } = await resolveMultiFileSpec(adapter, 'openapi.json');
    const loginRoute = Array.from(doc.routes.values()).find((r) => r.path === '/auth/login')!;
    loginRoute.summary = 'Login Updated';

    const serialized = serializeMultiFileDocument(doc, 'openapi.json');
    expect(serialized.has('openapi.json')).toBe(true);
    expect(serialized.has('paths/auth.json')).toBe(true);

    const authContent = serialized.get('paths/auth.json')!;
    const parsedAuth = JSON.parse(authContent) as Record<string, { post: { summary: string } }>;
    expect(parsedAuth['/auth/login'].post.summary).toBe('Login Updated');
    expect(parsedAuth['/auth/refresh'].post.summary).toBe('Refresh Original');

    const rootContent = serialized.get('openapi.json')!;
    const parsedRoot = JSON.parse(rootContent) as { paths: Record<string, { $ref: string }> };
    expect(parsedRoot.paths['/auth/login'].$ref).toBe('./paths/auth.json#/~1auth~1login');
    expect(parsedRoot.paths['/auth/refresh'].$ref).toBe('./paths/auth.json#/~1auth~1refresh');
  });
});
