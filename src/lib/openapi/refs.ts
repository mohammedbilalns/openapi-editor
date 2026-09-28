// Reference graph helpers shared by the store, validator and UI selectors.
// Pure functions: no DOM, no store access, safe to run in a Web Worker.
import type { ApiDocument, NodeId, Route, SchemaNode, SchemaOrRef } from './types';

/**
 * Where a reference was found: `schemaId` is the component schema containing
 * it (null when it sits in a route).
 */
export interface RefSite {
  schemaId: NodeId | null;
  routeId: NodeId | null;
}

type Visit = (targetId: NodeId) => void;

/** Visit every ref reachable from `s` through inline schemas (not through refs). */
export function forEachRefInSchemaOrRef(s: SchemaOrRef, visit: Visit): void {
  if (s.kind === 'ref') visit(s.targetId);
  else forEachRefInSchema(s.schema, visit);
}

export function forEachRefInSchema(schema: SchemaNode, visit: Visit): void {
  if (schema.properties) {
    for (const prop of schema.properties.values()) forEachRefInSchemaOrRef(prop.schema, visit);
  }
  if (schema.items) forEachRefInSchemaOrRef(schema.items, visit);
  if (schema.variants) {
    for (const v of schema.variants) forEachRefInSchemaOrRef(v, visit);
  }
  if (schema.additionalProperties) forEachRefInSchemaOrRef(schema.additionalProperties, visit);
  if (schema.not) forEachRefInSchemaOrRef(schema.not, visit);
  forEachMappingTarget(schema, visit);
}

/**
 * Targets of the schema's discriminator mapping values that were resolved at
 * import (and whose text is still in the mapping).
 */
export function forEachMappingTarget(schema: SchemaNode, visit: Visit): void {
  const targets = schema.mappingTargets;
  const mapping = schema.discriminator?.mapping;
  if (!targets || !mapping) return;
  for (const value of Object.values(mapping)) {
    if (typeof value === 'string' && Object.hasOwn(targets, value)) visit(targets[value]);
  }
}

export function forEachRefInRoute(route: Route, visit: Visit): void {
  for (const param of route.parameters) forEachRefInSchemaOrRef(param.schema, visit);
  if (route.requestBody) {
    for (const media of route.requestBody.content.values()) forEachRefInSchemaOrRef(media.schema, visit);
  }
  for (const response of route.responses.values()) {
    if (response.content) {
      for (const media of response.content.values()) forEachRefInSchemaOrRef(media.schema, visit);
    }
    if (response.headers) {
      for (const header of response.headers.values()) forEachRefInSchemaOrRef(header.schema, visit);
    }
  }
}

/** Visit every schema reference in the document, reporting where it was found. */
export function forEachSchemaRef(doc: ApiDocument, visit: (targetId: NodeId, site: RefSite) => void): void {
  for (const route of doc.routes.values()) {
    const site: RefSite = { schemaId: null, routeId: route.id };
    forEachRefInRoute(route, (target) => visit(target, site));
  }
  for (const schema of doc.schemas.values()) {
    const site: RefSite = { schemaId: schema.id, routeId: null };
    forEachRefInSchema(schema, (target) => visit(target, site));
  }
}

/**
 * Number of references to each schema, from routes and from *other* schemas
 * (a schema referencing itself does not count as a usage).
 */
export function computeSchemaUsageCounts(doc: ApiDocument): Map<NodeId, number> {
  const counts = new Map<NodeId, number>();
  forEachSchemaRef(doc, (target, site) => {
    if (site.schemaId === target) return;
    counts.set(target, (counts.get(target) ?? 0) + 1);
  });
  return counts;
}

// Documents are immutable (see store.ts), so the counts can be cached per
// document object; every edit produces a new document and a fresh entry.
const usageCache = new WeakMap<ApiDocument, Map<NodeId, number>>();

/** Memoized computeSchemaUsageCounts: O(document) once per document version, O(1) after. */
export function getSchemaUsageCounts(doc: ApiDocument): ReadonlyMap<NodeId, number> {
  let counts = usageCache.get(doc);
  if (!counts) {
    counts = computeSchemaUsageCounts(doc);
    usageCache.set(doc, counts);
  }
  return counts;
}
