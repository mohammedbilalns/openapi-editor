import type { WorkspaceAdapter } from '../../workspace';
import {
  parseStandalonePathItem,
  parseStandaloneSchema,
  parseText,
  parseYaml,
} from '../parser';
import type {
  ApiDocument,
  NodeId,
  Route,
  SchemaNode,
  SchemaOrRef,
  ValidationError,
} from '../types';

export interface MultiFileResolutionResult {
  document: ApiDocument;
  loadedFiles: Set<string>;
  errors: ValidationError[];
}

/**
 * Resolves relative file path `targetPath` against the directory containing `fromFilePath`.
 * Strips any trailing `#...` fragment before resolving.
 */
export function resolveRelativePath(fromFilePath: string, targetPath: string): string {
  const [cleanTarget] = targetPath.split('#');
  const fromDir = fromFilePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
  const segments = [
    ...(fromDir ? fromDir.split('/') : []),
    ...cleanTarget.replace(/\\/g, '/').split('/'),
  ];
  const resolved: string[] = [];
  for (const seg of segments) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') {
      resolved.pop();
    } else {
      resolved.push(seg);
    }
  }
  return resolved.join('/');
}

function deriveSchemaName(filePath: string): string {
  const filename = filePath.split('/').pop() ?? 'Schema';
  const basename = filename.replace(/\.(yaml|yml|json)$/i, '');
  // Capitalize first letter: user -> User, user-profile -> UserProfile
  return basename
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * Recursively resolves an OpenAPI specification starting from `entryFile`.
 * Follows external $ref references to separate schema and path files.
 */
export async function resolveMultiFileSpec(
  adapter: WorkspaceAdapter,
  entryFile: string,
): Promise<MultiFileResolutionResult> {
  const loadedFiles = new Set<string>();
  const errors: ValidationError[] = [];

  let rootContent: string;
  try {
    rootContent = await adapter.readFile(entryFile);
    loadedFiles.add(entryFile);
  } catch (error) {
    return {
      document: null as unknown as ApiDocument,
      loadedFiles,
      errors: [
        {
          code: 'ENTRY_FILE_NOT_FOUND',
          message: `Could not read entry file ${entryFile}: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'error',
          location: {},
        },
      ],
    };
  }

  const parseResult = parseYaml(rootContent);
  if (!parseResult.document) {
    return {
      document: null as unknown as ApiDocument,
      loadedFiles,
      errors: parseResult.errors,
    };
  }

  const doc = parseResult.document;
  errors.push(...parseResult.errors);

  // Schema name -> NodeId mapping
  const schemaNameToId = new Map<string, NodeId>();
  for (const [id, s] of doc.schemas) {
    if (s.name) schemaNameToId.set(s.name, id);
    // Mark root origin
    if (!s.origin) {
      s.origin = { filePath: entryFile, isStandaloneFile: false };
    }
  }

  for (const route of doc.routes.values()) {
    if (!route.origin) {
      route.origin = { filePath: entryFile, isStandaloneFile: false };
    }
  }

  // File path -> Schema NodeId cache to avoid loading the same external file multiple times
  const fileToSchemaId = new Map<string, NodeId>();

  // 1. Resolve external schemas declared in components.schemas
  for (const [id, schema] of Array.from(doc.schemas.entries())) {
    const rawRef = schema.extraKeywords?.$ref;
    if (typeof rawRef === 'string' && !rawRef.startsWith('#/')) {
      const resolvedPath = resolveRelativePath(entryFile, rawRef);
      await loadExternalSchema(resolvedPath, schema.name, id);
    }
  }

  // 2. Resolve external schemas and paths declared in root raw object
  try {
    const rawRoot = parseText(rootContent);
    if (rawRoot && typeof rawRoot === 'object') {
      const rootObj = rawRoot as Record<string, unknown>;
      const rawComponents = rootObj.components as Record<string, unknown> | undefined;
      const rawSchemas = rawComponents?.schemas as Record<string, unknown> | undefined;
      if (rawSchemas && typeof rawSchemas === 'object') {
        for (const [name, schemaVal] of Object.entries(rawSchemas)) {
          if (schemaVal && typeof schemaVal === 'object' && '$ref' in schemaVal) {
            const refStr = (schemaVal as { $ref: unknown }).$ref;
            if (typeof refStr === 'string' && !refStr.startsWith('#/')) {
              const resolvedPath = resolveRelativePath(entryFile, refStr);
              const existingId = schemaNameToId.get(name);
              await loadExternalSchema(resolvedPath, name, existingId);
            }
          }
        }
      }

      const rawPaths = rootObj.paths as Record<string, unknown> | undefined;
      if (rawPaths && typeof rawPaths === 'object') {
        for (const [pathKey, pathVal] of Object.entries(rawPaths)) {
          if (pathVal && typeof pathVal === 'object' && '$ref' in pathVal) {
            const pathRef = (pathVal as { $ref: unknown }).$ref;
            if (typeof pathRef === 'string' && !pathRef.startsWith('#/')) {
              const resolvedPath = resolveRelativePath(entryFile, pathRef);
              await loadExternalPathItem(pathKey, resolvedPath);
            }
          }
        }
      }
    }
  } catch {
    // rawRoot inspection is best-effort
  }

  // Helper to load and link an external schema file
  async function loadExternalSchema(
    filePath: string,
    preferredName?: string,
    existingId?: NodeId,
  ): Promise<NodeId | null> {
    if (fileToSchemaId.has(filePath)) {
      return fileToSchemaId.get(filePath)!;
    }

    let fileText: string;
    try {
      fileText = await adapter.readFile(filePath);
      loadedFiles.add(filePath);
    } catch (error) {
      errors.push({
        code: 'EXTERNAL_FILE_NOT_FOUND',
        message: `Could not load external schema file "${filePath}": ${error instanceof Error ? error.message : String(error)}`,
        severity: 'warning',
        location: {},
      });
      return null;
    }

    let parsedData: unknown;
    try {
      parsedData = parseText(fileText);
    } catch (error) {
      errors.push({
        code: 'EXTERNAL_FILE_PARSE_ERROR',
        message: `Failed to parse YAML in "${filePath}": ${error instanceof Error ? error.message : String(error)}`,
        severity: 'warning',
        location: {},
      });
      return null;
    }

    const schemaName = preferredName ?? deriveSchemaName(filePath);
    const { schema: loadedSchema, errors: parseErrors } = parseStandaloneSchema(
      parsedData,
      schemaName,
      existingId,
      schemaNameToId,
    );
    errors.push(...parseErrors);

    loadedSchema.origin = {
      filePath,
      isStandaloneFile: true,
    };

    doc.schemas.set(loadedSchema.id, loadedSchema);
    fileToSchemaId.set(filePath, loadedSchema.id);
    if (loadedSchema.name) {
      schemaNameToId.set(loadedSchema.name, loadedSchema.id);
    }

    // Check for nested external references inside this loaded schema
    await resolveNestedSchemaRefs(loadedSchema, filePath);

    return loadedSchema.id;
  }

  // Helper to load external path items
  async function loadExternalPathItem(path: string, filePath: string): Promise<void> {
    let fileText: string;
    try {
      fileText = await adapter.readFile(filePath);
      loadedFiles.add(filePath);
    } catch (error) {
      errors.push({
        code: 'EXTERNAL_FILE_NOT_FOUND',
        message: `Could not load external path file "${filePath}": ${error instanceof Error ? error.message : String(error)}`,
        severity: 'warning',
        location: {},
      });
      return;
    }

    let parsedData: unknown;
    try {
      parsedData = parseText(fileText);
    } catch (error) {
      errors.push({
        code: 'EXTERNAL_FILE_PARSE_ERROR',
        message: `Failed to parse YAML in "${filePath}": ${error instanceof Error ? error.message : String(error)}`,
        severity: 'warning',
        location: {},
      });
      return;
    }

    const { routes, errors: pathErrors } = parseStandalonePathItem(path, parsedData, schemaNameToId);
    errors.push(...pathErrors);

    for (const route of routes) {
      route.origin = {
        filePath,
        isStandaloneFile: true,
      };
      doc.routes.set(route.id, route);
      await resolveNestedRouteRefs(route, filePath);
    }
  }

  // Walk and resolve external refs nested inside schemas
  async function resolveNestedSchemaRefs(schema: SchemaNode, parentFile: string): Promise<void> {
    if (schema.properties) {
      for (const [propName, prop] of schema.properties.entries()) {
        const resolvedRef = await checkAndResolveSchemaOrRef(prop.schema, parentFile);
        if (resolvedRef) {
          schema.properties.set(propName, { ...prop, schema: resolvedRef });
        }
      }
    }
    if (schema.items) {
      const resolvedRef = await checkAndResolveSchemaOrRef(schema.items, parentFile);
      if (resolvedRef) schema.items = resolvedRef;
    }
    if (schema.variants) {
      for (let i = 0; i < schema.variants.length; i++) {
        const resolvedRef = await checkAndResolveSchemaOrRef(schema.variants[i], parentFile);
        if (resolvedRef) schema.variants[i] = resolvedRef;
      }
    }
  }

  // Walk and resolve external refs nested inside routes
  async function resolveNestedRouteRefs(route: Route, parentFile: string): Promise<void> {
    for (let i = 0; i < route.parameters.length; i++) {
      const resolvedRef = await checkAndResolveSchemaOrRef(route.parameters[i].schema, parentFile);
      if (resolvedRef) route.parameters[i].schema = resolvedRef;
    }
    if (route.requestBody) {
      for (const [mediaType, media] of route.requestBody.content.entries()) {
        const resolvedRef = await checkAndResolveSchemaOrRef(media.schema, parentFile);
        if (resolvedRef) {
          route.requestBody.content.set(mediaType, { ...media, schema: resolvedRef });
        }
      }
    }
    for (const resp of route.responses.values()) {
      if (resp.content) {
        for (const [mediaType, media] of resp.content.entries()) {
          const resolvedRef = await checkAndResolveSchemaOrRef(media.schema, parentFile);
          if (resolvedRef) {
            resp.content.set(mediaType, { ...media, schema: resolvedRef });
          }
        }
      }
    }
  }

  // Checks if a SchemaOrRef is an unresolved external file ref and resolves it
  async function checkAndResolveSchemaOrRef(
    schemaOrRef: SchemaOrRef,
    parentFile: string,
  ): Promise<SchemaOrRef | null> {
    if (schemaOrRef.kind === 'inline') {
      const inline = schemaOrRef.schema;
      const rawRef = inline.extraKeywords?.$ref;
      if (typeof rawRef === 'string' && !rawRef.startsWith('#/')) {
        const nestedPath = resolveRelativePath(parentFile, rawRef);
        const targetId = await loadExternalSchema(nestedPath);
        if (targetId) {
          return { kind: 'ref', targetId };
        }
      }
      // Continue walking nested inline schema
      await resolveNestedSchemaRefs(inline, parentFile);
    }
    return null;
  }

  return {
    document: doc,
    loadedFiles,
    errors,
  };
}
