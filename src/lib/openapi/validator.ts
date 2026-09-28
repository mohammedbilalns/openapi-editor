import {
  ApiDocument,
  SchemaNode,
  Route,
  ValidationError,
  ValidationResult,
  NodeId,
  SchemaOrRef,
} from './types';
import { forEachMappingTarget, forEachRefInRoute, forEachRefInSchema } from './refs';

/*
 * Message style (DESIGN §11): sentence-case statements that end with a period.
 * Names in prose get curly quotes (“Pet”); routes read like the UI shows them
 * (`GET /pets`), and path parameters keep their braces (`{petId}`).
 */

/** `“Pet”`, for a name inside a message. */
const quoted = (name: string) => `“${name}”`;

/** Sentence subject for a schema: `Schema “Pet”`, or `An unnamed schema`. */
const schemaSubject = (schema: SchemaNode) => (schema.name ? `Schema ${quoted(schema.name)}` : 'An unnamed schema');

/** `GET /pets/{petId}`. */
const operationLabel = (route: Route) => `${route.method.toUpperCase()} ${route.path}`;

export function validateDocument(doc: ApiDocument): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Info validation
  validateInfo(doc, errors, warnings);

  // Schema validation
  validateSchemas(doc, errors, warnings);

  // Route validation
  validateRoutes(doc, errors, warnings);

  // Graph validation (references)
  validateReferences(doc, errors, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateInfo(
  doc: ApiDocument,
  errors: ValidationError[],
  warnings: ValidationError[]
) {
  if (!doc.info.title.trim()) {
    errors.push({
      code: 'MISSING_TITLE',
      message: 'The API has no title.',
      severity: 'error',
      location: { path: ['info', 'title'] },
    });
  }

  if (!doc.info.version.trim()) {
    errors.push({
      code: 'MISSING_VERSION',
      message: 'The API has no version.',
      severity: 'error',
      location: { path: ['info', 'version'] },
    });
  }

  if (!doc.info.description) {
    warnings.push({
      code: 'MISSING_DESCRIPTION',
      message: 'The API has no description.',
      severity: 'info',
      location: { path: ['info', 'description'] },
    });
  }

  if (doc.servers.length === 0) {
    warnings.push({
      code: 'NO_SERVERS',
      message: 'No server URLs are defined.',
      severity: 'warning',
      location: { path: ['servers'] },
    });
  }
}

function validateSchemas(
  doc: ApiDocument,
  errors: ValidationError[],
  warnings: ValidationError[]
) {
  const schemaNames = new Set<string>();

  for (const [id, schema] of doc.schemas) {
    // Check for duplicate names
    if (schema.name) {
      if (schemaNames.has(schema.name)) {
        errors.push({
          code: 'DUPLICATE_SCHEMA_NAME',
          message: `Schema name ${quoted(schema.name)} is used more than once.`,
          severity: 'error',
          location: { nodeId: id },
        });
      }
      schemaNames.add(schema.name);

      // Naming convention check
      if (!/^[A-Z][a-zA-Z0-9]*$/.test(schema.name)) {
        warnings.push({
          code: 'SCHEMA_NAMING_CONVENTION',
          message: `Schema name ${quoted(schema.name)} should use PascalCase.`,
          severity: 'info',
          location: { nodeId: id },
        });
      }
    } else {
      // Unnamed schemas can't be $ref'd: export inlines them, and a cycle through one can't be written out
      errors.push({
        code: 'UNNAMED_SCHEMA',
        message: 'A schema has no name.',
        severity: 'error',
        location: { nodeId: id },
      });
    }

    // Validate based on type
    if (schema.type === 'object') {
      validateObjectSchema(schema, doc, errors, warnings);
    } else if (schema.type === 'enum') {
      validateEnumSchema(schema, errors, warnings);
    } else if (schema.type === 'array') {
      validateArraySchema(schema, doc, errors, warnings);
    } else if (['oneOf', 'anyOf', 'allOf'].includes(schema.type)) {
      validateCompositionSchema(schema, doc, errors, warnings);
    }
  }
}

function validateObjectSchema(
  schema: SchemaNode,
  doc: ApiDocument,
  errors: ValidationError[],
  warnings: ValidationError[]
) {
  if (!schema.properties || schema.properties.size === 0) {
    warnings.push({
      code: 'EMPTY_OBJECT',
      message: `${schemaSubject(schema)} has no properties.`,
      severity: 'warning',
      location: { nodeId: schema.id },
    });
  }

  // Check required fields exist as properties
  if (schema.required && schema.properties) {
    for (const requiredField of schema.required) {
      if (!schema.properties.has(requiredField)) {
        errors.push({
          code: 'INVALID_REQUIRED',
          message: `Required field ${quoted(requiredField)} is not one of the properties.`,
          severity: 'error',
          location: { nodeId: schema.id, field: requiredField },
        });
      }
    }
  }
}

function validateEnumSchema(
  schema: SchemaNode,
  errors: ValidationError[],
  warnings: ValidationError[]
) {
  if (!schema.enumValues || schema.enumValues.length === 0) {
    errors.push({
      code: 'EMPTY_ENUM',
      message: `${schemaSubject(schema)} has no enum values.`,
      severity: 'error',
      location: { nodeId: schema.id },
    });
  }

  // Check for duplicate enum values
  if (schema.enumValues) {
    const seen = new Set<string | number | boolean>();
    for (const value of schema.enumValues) {
      if (seen.has(value)) {
        errors.push({
          code: 'DUPLICATE_ENUM_VALUE',
          message: `Enum value ${quoted(String(value))} appears more than once.`,
          severity: 'error',
          location: { nodeId: schema.id },
        });
      }
      seen.add(value);
    }
  }
}

function validateArraySchema(
  schema: SchemaNode,
  doc: ApiDocument,
  errors: ValidationError[],
  warnings: ValidationError[]
) {
  if (!schema.items) {
    errors.push({
      code: 'MISSING_ARRAY_ITEMS',
      message: `${schemaSubject(schema)} is an array with no items schema.`,
      severity: 'error',
      location: { nodeId: schema.id },
    });
  }
}

function validateCompositionSchema(
  schema: SchemaNode,
  doc: ApiDocument,
  errors: ValidationError[],
  warnings: ValidationError[]
) {
  if (!schema.variants || schema.variants.length === 0) {
    errors.push({
      code: 'EMPTY_COMPOSITION',
      message: `${schemaSubject(schema)} has no ${schema.type} variants.`,
      severity: 'error',
      location: { nodeId: schema.id },
    });
  }

  if (schema.variants && schema.variants.length === 1) {
    warnings.push({
      code: 'SINGLE_VARIANT',
      message: `${schemaSubject(schema)} has only one ${schema.type} variant.`,
      severity: 'warning',
      location: { nodeId: schema.id },
    });
  }

  // Check for discriminator on oneOf
  if (schema.type === 'oneOf' && !schema.discriminator && schema.variants && schema.variants.length > 1) {
    warnings.push({
      code: 'MISSING_DISCRIMINATOR',
      message: `${schemaSubject(schema)} has no discriminator to tell its oneOf variants apart.`,
      severity: 'info',
      location: { nodeId: schema.id },
    });
  }
}

function validateRoutes(
  doc: ApiDocument,
  errors: ValidationError[],
  warnings: ValidationError[]
) {
  const operationIds = new Set<string>();
  const pathMethodCombos = new Set<string>();

  for (const [id, route] of doc.routes) {
    // Check for duplicate path+method
    const combo = `${route.method} ${route.path}`;
    const label = operationLabel(route);
    if (pathMethodCombos.has(combo)) {
      errors.push({
        code: 'DUPLICATE_OPERATION',
        message: `${label} is defined more than once.`,
        severity: 'error',
        location: { nodeId: id },
      });
    }
    pathMethodCombos.add(combo);

    // Check for duplicate operationId
    if (route.operationId) {
      if (operationIds.has(route.operationId)) {
        errors.push({
          code: 'DUPLICATE_OPERATION_ID',
          message: `Operation ID ${quoted(route.operationId)} is used by another route.`,
          severity: 'error',
          location: { nodeId: id },
        });
      }
      operationIds.add(route.operationId);

      // Naming convention
      if (!/^[a-z][a-zA-Z0-9]*$/.test(route.operationId)) {
        warnings.push({
          code: 'OPERATION_ID_NAMING',
          message: `Operation ID ${quoted(route.operationId)} should use camelCase.`,
          severity: 'info',
          location: { nodeId: id },
        });
      }
    } else {
      warnings.push({
        code: 'MISSING_OPERATION_ID',
        message: `${label} has no operation ID.`,
        severity: 'warning',
        location: { nodeId: id },
      });
    }

    // Validate path parameters
    const pathParams = route.path.match(/\{([^}]+)\}/g) || [];
    const definedPathParams = route.parameters
      .filter((p) => p.in === 'path')
      .map((p) => `{${p.name}}`);

    for (const param of pathParams) {
      if (!definedPathParams.includes(param)) {
        errors.push({
          code: 'UNDEFINED_PATH_PARAM',
          message: `Path parameter ${param} is not defined.`,
          severity: 'error',
          location: { nodeId: id },
        });
      }
    }

    // Check responses
    if (route.responses.size === 0) {
      errors.push({
        code: 'NO_RESPONSES',
        message: `${label} has no responses.`,
        severity: 'error',
        location: { nodeId: id },
      });
    }

    // Check for success response
    const hasSuccessResponse = Array.from(route.responses.keys()).some(
      (code) => code.startsWith('2')
    );
    if (!hasSuccessResponse) {
      warnings.push({
        code: 'NO_SUCCESS_RESPONSE',
        message: `${label} has no success (2xx) response.`,
        severity: 'warning',
        location: { nodeId: id },
      });
    }

    // Check for error responses
    const hasErrorResponse = Array.from(route.responses.keys()).some(
      (code) => code.startsWith('4') || code.startsWith('5')
    );
    if (!hasErrorResponse) {
      warnings.push({
        code: 'NO_ERROR_RESPONSE',
        message: `${label} has no error (4xx or 5xx) response.`,
        severity: 'info',
        location: { nodeId: id },
      });
    }

    // Validate 200 response has schema for non-DELETE methods
    if (route.method !== 'delete') {
      const successCode = route.responses.has('200') ? '200' : route.responses.has('201') ? '201' : undefined;
      const successResponse = successCode ? route.responses.get(successCode) : undefined;
      if (successResponse && !successResponse.content) {
        warnings.push({
          code: 'SUCCESS_WITHOUT_BODY',
          message: `The ${successCode} response of ${label} has no body schema.`,
          severity: 'warning',
          location: { nodeId: id },
        });
      }
    }
  }
}

function validateReferences(
  doc: ApiDocument,
  errors: ValidationError[],
  warnings: ValidationError[]
) {
  const validSchemaIds = new Set(doc.schemas.keys());

  // Helper to check a single reference
  const checkRef = (schemaOrRef: SchemaOrRef, context: string, nodeId: NodeId) => {
    if (schemaOrRef.kind === 'ref') {
      if (!validSchemaIds.has(schemaOrRef.targetId)) {
        errors.push({
          code: 'BROKEN_REFERENCE',
          message: `Broken reference in ${context}.`,
          severity: 'error',
          location: { nodeId },
        });
      }
    } else if (schemaOrRef.kind === 'inline') {
      // Recursively check inline schemas
      checkSchemaRefs(schemaOrRef.schema, context, nodeId);
    }
  };

  const checkSchemaRefs = (schema: SchemaNode, context: string, nodeId: NodeId) => {
    if (schema.properties) {
      for (const [name, prop] of schema.properties) {
        checkRef(prop.schema, `${context}.${name}`, nodeId);
      }
    }
    if (schema.items) {
      checkRef(schema.items, `${context}[items]`, nodeId);
    }
    if (schema.variants) {
      for (const variant of schema.variants) {
        checkRef(variant, `${context}[variant]`, nodeId);
      }
    }
    if (schema.otherCompositions) {
      for (const [key, list] of Object.entries(schema.otherCompositions)) {
        for (const variant of list ?? []) checkRef(variant, `${context}[${key}]`, nodeId);
      }
    }
    if (schema.additionalProperties) {
      checkRef(schema.additionalProperties, `${context}[additionalProperties]`, nodeId);
    }
    if (schema.not) {
      checkRef(schema.not, `${context}[not]`, nodeId);
    }
    forEachMappingTarget(schema, (targetId) => {
      checkRef({ kind: 'ref', targetId }, `${context}[discriminator mapping]`, nodeId);
    });
  };

  // Check all schemas
  for (const [id, schema] of doc.schemas) {
    checkSchemaRefs(schema, schema.name || 'Anonymous', id);
  }

  // Check routes
  for (const [id, route] of doc.routes) {
    // Check parameters
    for (const param of route.parameters) {
      checkRef(param.schema, `parameter ${quoted(param.name)} of ${operationLabel(route)}`, id);
    }

    // Check request body
    if (route.requestBody?.content) {
      for (const [contentType, media] of route.requestBody.content) {
        checkRef(media.schema, `the request body of ${operationLabel(route)}`, id);
      }
    }

    // Check responses
    for (const [statusCode, response] of route.responses) {
      if (response.content) {
        for (const [contentType, media] of response.content) {
          checkRef(media.schema, `the ${statusCode} response of ${operationLabel(route)}`, id);
        }
      }
    }
  }

  // Check for orphaned schemas
  const usedSchemaIds = new Set<NodeId>();

  // Same traversal as the usage counts (refs.ts), so both agree on what is used
  const markUsed = (targetId: NodeId) => {
    usedSchemaIds.add(targetId);
  };
  for (const route of doc.routes.values()) forEachRefInRoute(route, markUsed);
  // A schema that only refers to itself (a tree node nobody uses) is still unused
  for (const schema of doc.schemas.values()) {
    forEachRefInSchema(schema, (targetId) => {
      if (targetId !== schema.id) markUsed(targetId);
    });
  }

  // Report orphaned schemas
  for (const [id, schema] of doc.schemas) {
    if (!usedSchemaIds.has(id)) {
      warnings.push({
        code: 'ORPHANED_SCHEMA',
        message: `${schemaSubject(schema)} is not used anywhere.`,
        severity: 'info',
        location: { nodeId: id },
      });
    }
  }

  // Circular references: report schemas that are part of a reference cycle
  // (including cycles that pass through inline schemas, e.g. tree nodes).
  for (const id of findSchemasInCycles(doc)) {
    const schema = doc.schemas.get(id)!;
    warnings.push({
      code: 'CIRCULAR_REFERENCE',
      message: `${schemaSubject(schema)} has a circular reference.`,
      severity: 'warning',
      location: { nodeId: id },
    });
  }
}

/**
 * Ids of schemas on a reference cycle (strongly connected components with more
 * than one node, or a node referencing itself), in document order.
 * Iterative Tarjan: O(schemas + refs), no recursion depth limit.
 */
export function findSchemasInCycles(doc: ApiDocument): NodeId[] {
  const edges = new Map<NodeId, NodeId[]>();
  for (const [id, schema] of doc.schemas) {
    const out: NodeId[] = [];
    forEachRefInSchema(schema, (target) => {
      if (doc.schemas.has(target)) out.push(target);
    });
    edges.set(id, out);
  }

  const index = new Map<NodeId, number>();
  const low = new Map<NodeId, number>();
  const onStack = new Set<NodeId>();
  const stack: NodeId[] = [];
  const inCycle = new Set<NodeId>();
  let counter = 0;

  for (const root of edges.keys()) {
    if (index.has(root)) continue;
    const work: Array<{ id: NodeId; next: number }> = [{ id: root, next: 0 }];
    index.set(root, counter);
    low.set(root, counter++);
    stack.push(root);
    onStack.add(root);

    while (work.length > 0) {
      const frame = work[work.length - 1];
      const out = edges.get(frame.id)!;
      if (frame.next < out.length) {
        const target = out[frame.next++];
        if (!index.has(target)) {
          index.set(target, counter);
          low.set(target, counter++);
          stack.push(target);
          onStack.add(target);
          work.push({ id: target, next: 0 });
        } else if (onStack.has(target)) {
          low.set(frame.id, Math.min(low.get(frame.id)!, index.get(target)!));
        }
        continue;
      }
      work.pop();
      if (work.length > 0) {
        const parent = work[work.length - 1].id;
        low.set(parent, Math.min(low.get(parent)!, low.get(frame.id)!));
      }
      if (low.get(frame.id) === index.get(frame.id)) {
        const component: NodeId[] = [];
        let member: NodeId;
        do {
          member = stack.pop()!;
          onStack.delete(member);
          component.push(member);
        } while (member !== frame.id);
        if (component.length > 1 || out.includes(frame.id)) {
          for (const m of component) inCycle.add(m);
        }
      }
    }
  }

  return Array.from(doc.schemas.keys()).filter((id) => inCycle.has(id));
}
