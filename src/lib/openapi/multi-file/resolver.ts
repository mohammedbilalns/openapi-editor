import type { WorkspaceAdapter } from '../../workspace';
import {
  isHttpMethod,
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

import {
  decodeJsonPointerToken,
  encodeJsonPointerToken,
  resolveJsonPointer,
} from './pointer';
import {
  deriveSchemaName,
  resolveRefPath,
  resolveRelativePath,
  type ResolvedRef,
} from './path-utils';

export {
  decodeJsonPointerToken,
  encodeJsonPointerToken,
  resolveJsonPointer,
  deriveSchemaName,
  resolveRefPath,
  resolveRelativePath,
  type ResolvedRef,
};

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

  // Security scheme name -> NodeId mapping
  const securitySchemeNameToId = new Map<string, NodeId>();
  for (const [id, scheme] of doc.securitySchemes) {
    securitySchemeNameToId.set(scheme.name, id);
  }

  // Set of ref strings that have been successfully resolved
  const resolvedRefStrings = new Set<string>();

  // Cache parsed data per file to avoid redundant reads/parses
  const parsedFileCache = new Map<string, unknown>();
  // Cache schema IDs by ref string (${filePath}#${fragment || ''})
  const refToSchemaId = new Map<string, NodeId>();

  async function getOrLoadFileData(filePath: string): Promise<unknown> {
    if (parsedFileCache.has(filePath)) {
      return parsedFileCache.get(filePath);
    }
    const fileText = await adapter.readFile(filePath);
    loadedFiles.add(filePath);
    const parsedData = parseText(fileText);
    parsedFileCache.set(filePath, parsedData);
    return parsedData;
  }

  // Helper to load and link an external schema file or fragment
  async function loadExternalSchema(
    rawRef: string,
    parentFile: string,
    preferredName?: string,
    existingId?: NodeId,
  ): Promise<NodeId | null> {
    const { filePath, fragment } = resolveRefPath(parentFile, rawRef);
    const cacheKey = fragment ? `${filePath}#${fragment}` : filePath;

    if (refToSchemaId.has(cacheKey)) {
      return refToSchemaId.get(cacheKey)!;
    }
    if (!fragment && refToSchemaId.has(filePath)) {
      return refToSchemaId.get(filePath)!;
    }

    let parsedData: unknown;
    try {
      parsedData = await getOrLoadFileData(filePath);
    } catch (error) {
      errors.push({
        code: 'EXTERNAL_FILE_NOT_FOUND',
        message: `Could not load external schema file "${filePath}": ${error instanceof Error ? error.message : String(error)}`,
        severity: 'warning',
        location: {},
      });
      return null;
    }

    let targetData: unknown = parsedData;
    if (fragment) {
      targetData = resolveJsonPointer(parsedData, fragment);
      if (targetData === undefined) {
        errors.push({
          code: 'EXTERNAL_FRAGMENT_NOT_FOUND',
          message: `Could not resolve schema fragment "#${fragment}" in file "${filePath}".`,
          severity: 'warning',
          location: {},
        });
        return null;
      }
    }

    let schemaName = preferredName;
    if (!schemaName && fragment) {
      const lastToken = fragment.split('/').filter(Boolean).pop();
      if (lastToken) {
        schemaName = decodeJsonPointerToken(lastToken);
      }
    }
    if (!schemaName) {
      schemaName = deriveSchemaName(filePath);
    }

    const { schema: loadedSchema, errors: parseErrors } = parseStandaloneSchema(
      targetData,
      schemaName,
      existingId,
      schemaNameToId,
    );
    errors.push(...parseErrors);

    loadedSchema.origin = {
      filePath,
      isStandaloneFile: true,
      jsonPointer: fragment ? (fragment.startsWith('/') ? fragment : `/${fragment}`) : undefined,
    };

    doc.schemas.set(loadedSchema.id, loadedSchema);
    refToSchemaId.set(cacheKey, loadedSchema.id);
    if (!fragment) {
      refToSchemaId.set(filePath, loadedSchema.id);
    }
    if (loadedSchema.name) {
      schemaNameToId.set(loadedSchema.name, loadedSchema.id);
    }

    // Check for nested external references inside this loaded schema
    await resolveNestedSchemaRefs(loadedSchema, filePath);

    return loadedSchema.id;
  }

  // Helper to load external path items
  async function loadExternalPathItem(
    pathKey: string,
    rawRef: string,
    parentFile: string,
  ): Promise<void> {
    const { filePath, fragment } = resolveRefPath(parentFile, rawRef);

    let parsedData: unknown;
    try {
      parsedData = await getOrLoadFileData(filePath);
    } catch (error) {
      errors.push({
        code: 'EXTERNAL_FILE_NOT_FOUND',
        message: `Could not load external path file "${filePath}": ${error instanceof Error ? error.message : String(error)}`,
        severity: 'warning',
        location: {},
      });
      return;
    }

    let targetData: unknown;
    if (fragment) {
      targetData = resolveJsonPointer(parsedData, fragment);
    }
    if (!targetData && parsedData && typeof parsedData === 'object') {
      const obj = parsedData as Record<string, unknown>;
      if (pathKey in obj) {
        targetData = obj[pathKey];
      } else {
        const hasHttpMethods = Object.keys(obj).some((k) => isHttpMethod(k.toLowerCase()));
        if (hasHttpMethods) {
          targetData = obj;
        } else {
          targetData = resolveJsonPointer(parsedData, pathKey);
        }
      }
    }

    if (!targetData) {
      errors.push({
        code: 'EXTERNAL_PATH_NOT_FOUND',
        message: `Could not find path item for "${pathKey}" in "${filePath}"${fragment ? ` (fragment: #${fragment})` : ''}.`,
        severity: 'warning',
        location: {},
      });
      return;
    }

    const { routes, errors: pathErrors } = parseStandalonePathItem(
      pathKey,
      targetData,
      schemaNameToId,
      securitySchemeNameToId,
    );
    errors.push(...pathErrors);

    for (const route of routes) {
      route.origin = {
        filePath,
        isStandaloneFile: true,
        jsonPointer: fragment
          ? (fragment.startsWith('/') ? fragment : `/${fragment}`)
          : (parsedData && typeof parsedData === 'object' && pathKey in (parsedData as Record<string, unknown>))
            ? `/${encodeJsonPointerToken(pathKey)}`
            : undefined,
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

  // Checks if a SchemaOrRef is an unresolved external or internal ref and resolves it
  async function checkAndResolveSchemaOrRef(
    schemaOrRef: SchemaOrRef,
    parentFile: string,
  ): Promise<SchemaOrRef | null> {
    if (schemaOrRef.kind === 'inline') {
      const inline = schemaOrRef.schema;
      const rawRef = inline.extraKeywords?.$ref;
      if (typeof rawRef === 'string') {
        if (rawRef.startsWith('#/components/schemas/')) {
          const name = rawRef.slice('#/components/schemas/'.length);
          const targetId = schemaNameToId.get(name);
          if (targetId) {
            resolvedRefStrings.add(rawRef);
            return { kind: 'ref', targetId };
          }
        } else if (!rawRef.startsWith('#/')) {
          const targetId = await loadExternalSchema(rawRef, parentFile);
          if (targetId) {
            resolvedRefStrings.add(rawRef);
            return { kind: 'ref', targetId };
          }
        }
      }
      // Continue walking nested inline schema
      await resolveNestedSchemaRefs(inline, parentFile);
    }
    return null;
  }

  // 1. Resolve external schemas declared in components.schemas
  for (const [id, schema] of Array.from(doc.schemas.entries())) {
    const rawRef = schema.extraKeywords?.$ref;
    if (typeof rawRef === 'string' && !rawRef.startsWith('#/')) {
      await loadExternalSchema(rawRef, entryFile, schema.name, id);
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
              const existingId = schemaNameToId.get(name);
              await loadExternalSchema(refStr, entryFile, name, existingId);
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
              await loadExternalPathItem(pathKey, pathRef, entryFile);
            }
          }
        }
      }
    }
  } catch {
    // rawRoot inspection is best-effort
  }

  // Filter out spurious PATH_WITHOUT_OPERATIONS warnings for paths that now have loaded operations
  const loadedPaths = new Set<string>();
  for (const route of doc.routes.values()) {
    loadedPaths.add(route.path);
  }

  const finalErrors = errors.filter((err) => {
    if (err.code === 'PATH_WITHOUT_OPERATIONS') {
      const match = err.message.match(/^Path (\S+) has no operations/);
      if (match && loadedPaths.has(match[1])) {
        return false;
      }
    }
    if (err.code === 'UNRESOLVED_REF') {
      const match = err.message.match(/^Unresolved reference: (\S+)/);
      if (match && resolvedRefStrings.has(match[1])) {
        return false;
      }
    }
    return true;
  });

  return {
    document: doc,
    loadedFiles,
    errors: finalErrors,
  };
}
