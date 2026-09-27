import {
  ApiDocument,
  SchemaNode,
  Route,
  ValidationError,
  ValidationResult,
  NodeId,
  SchemaOrRef,
} from './types';

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
      message: 'API title is required',
      severity: 'error',
      location: { path: ['info', 'title'] },
    });
  }

  if (!doc.info.version.trim()) {
    errors.push({
      code: 'MISSING_VERSION',
      message: 'API version is required',
      severity: 'error',
      location: { path: ['info', 'version'] },
    });
  }

  if (!doc.info.description) {
    warnings.push({
      code: 'MISSING_DESCRIPTION',
      message: 'Consider adding an API description',
      severity: 'info',
      location: { path: ['info', 'description'] },
    });
  }

  if (doc.servers.length === 0) {
    warnings.push({
      code: 'NO_SERVERS',
      message: 'No server URLs defined',
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
          message: `Duplicate schema name: ${schema.name}`,
          severity: 'error',
          location: { nodeId: id },
        });
      }
      schemaNames.add(schema.name);

      // Naming convention check
      if (!/^[A-Z][a-zA-Z0-9]*$/.test(schema.name)) {
        warnings.push({
          code: 'SCHEMA_NAMING_CONVENTION',
          message: `Schema name "${schema.name}" should use PascalCase`,
          severity: 'info',
          location: { nodeId: id },
        });
      }
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
      message: `Object schema "${schema.name || 'Anonymous'}" has no properties`,
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
          message: `Required field "${requiredField}" is not defined in properties`,
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
      message: `Enum schema "${schema.name || 'Anonymous'}" has no values`,
      severity: 'error',
      location: { nodeId: schema.id },
    });
  }

  // Check for duplicate enum values
  if (schema.enumValues) {
    const seen = new Set<string>();
    for (const value of schema.enumValues) {
      if (seen.has(value)) {
        errors.push({
          code: 'DUPLICATE_ENUM_VALUE',
          message: `Duplicate enum value: ${value}`,
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
      message: `Array schema "${schema.name || 'Anonymous'}" is missing items definition`,
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
      message: `${schema.type} schema "${schema.name || 'Anonymous'}" has no variants`,
      severity: 'error',
      location: { nodeId: schema.id },
    });
  }

  if (schema.variants && schema.variants.length === 1) {
    warnings.push({
      code: 'SINGLE_VARIANT',
      message: `${schema.type} schema "${schema.name || 'Anonymous'}" has only one variant`,
      severity: 'warning',
      location: { nodeId: schema.id },
    });
  }

  // Check for discriminator on oneOf
  if (schema.type === 'oneOf' && !schema.discriminator && schema.variants && schema.variants.length > 1) {
    warnings.push({
      code: 'MISSING_DISCRIMINATOR',
      message: `oneOf schema "${schema.name || 'Anonymous'}" should have a discriminator`,
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
    if (pathMethodCombos.has(combo)) {
      errors.push({
        code: 'DUPLICATE_OPERATION',
        message: `Duplicate operation: ${combo}`,
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
          message: `Duplicate operationId: ${route.operationId}`,
          severity: 'error',
          location: { nodeId: id },
        });
      }
      operationIds.add(route.operationId);

      // Naming convention
      if (!/^[a-z][a-zA-Z0-9]*$/.test(route.operationId)) {
        warnings.push({
          code: 'OPERATION_ID_NAMING',
          message: `operationId "${route.operationId}" should use camelCase`,
          severity: 'info',
          location: { nodeId: id },
        });
      }
    } else {
      warnings.push({
        code: 'MISSING_OPERATION_ID',
        message: `Route ${combo} is missing operationId`,
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
          message: `Path parameter ${param} is not defined`,
          severity: 'error',
          location: { nodeId: id },
        });
      }
    }

    // Check responses
    if (route.responses.size === 0) {
      errors.push({
        code: 'NO_RESPONSES',
        message: `Route ${combo} has no responses defined`,
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
        message: `Route ${combo} has no success (2xx) response`,
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
        message: `Route ${combo} has no error (4xx/5xx) response`,
        severity: 'info',
        location: { nodeId: id },
      });
    }

    // Validate 200 response has schema for non-DELETE methods
    if (route.method !== 'delete') {
      const successResponse = route.responses.get('200') || route.responses.get('201');
      if (successResponse && !successResponse.content) {
        warnings.push({
          code: 'SUCCESS_WITHOUT_BODY',
          message: `${combo} success response has no body schema`,
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
          message: `Broken reference in ${context}`,
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
  };

  // Check all schemas
  for (const [id, schema] of doc.schemas) {
    checkSchemaRefs(schema, schema.name || 'Anonymous', id);
  }

  // Check routes
  for (const [id, route] of doc.routes) {
    // Check parameters
    for (const param of route.parameters) {
      checkRef(param.schema, `${route.method} ${route.path} param ${param.name}`, id);
    }

    // Check request body
    if (route.requestBody?.content) {
      for (const [contentType, media] of route.requestBody.content) {
        checkRef(media.schema, `${route.method} ${route.path} request body`, id);
      }
    }

    // Check responses
    for (const [statusCode, response] of route.responses) {
      if (response.content) {
        for (const [contentType, media] of response.content) {
          checkRef(media.schema, `${route.method} ${route.path} response ${statusCode}`, id);
        }
      }
    }
  }

  // Check for orphaned schemas
  const usedSchemaIds = new Set<NodeId>();

  const markUsed = (schemaOrRef: SchemaOrRef) => {
    if (schemaOrRef.kind === 'ref') {
      usedSchemaIds.add(schemaOrRef.targetId);
    } else if (schemaOrRef.kind === 'inline') {
      markUsedInSchema(schemaOrRef.schema);
    }
  };

  const markUsedInSchema = (schema: SchemaNode) => {
    if (schema.properties) {
      for (const prop of schema.properties.values()) {
        markUsed(prop.schema);
      }
    }
    if (schema.items) markUsed(schema.items);
    if (schema.variants) schema.variants.forEach(markUsed);
  };

  // Mark schemas used by routes
  for (const route of doc.routes.values()) {
    for (const param of route.parameters) {
      markUsed(param.schema);
    }
    if (route.requestBody?.content) {
      for (const media of route.requestBody.content.values()) {
        markUsed(media.schema);
      }
    }
    for (const response of route.responses.values()) {
      if (response.content) {
        for (const media of response.content.values()) {
          markUsed(media.schema);
        }
      }
    }
  }

  // Mark schemas used by other schemas
  for (const schema of doc.schemas.values()) {
    markUsedInSchema(schema);
  }

  // Report orphaned schemas
  for (const [id, schema] of doc.schemas) {
    if (!usedSchemaIds.has(id)) {
      warnings.push({
        code: 'ORPHANED_SCHEMA',
        message: `Schema "${schema.name || 'Anonymous'}" is not used anywhere`,
        severity: 'info',
        location: { nodeId: id },
      });
    }
  }

  // Check for circular references (simplified - just detect direct cycles)
  for (const [id, schema] of doc.schemas) {
    const visited = new Set<NodeId>();
    const stack = new Set<NodeId>();

    const hasCycle = (schemaId: NodeId): boolean => {
      if (stack.has(schemaId)) return true;
      if (visited.has(schemaId)) return false;

      visited.add(schemaId);
      stack.add(schemaId);

      const s = doc.schemas.get(schemaId);
      if (s) {
        const refs = collectRefs(s);
        for (const ref of refs) {
          if (hasCycle(ref)) return true;
        }
      }

      stack.delete(schemaId);
      return false;
    };

    if (hasCycle(id)) {
      warnings.push({
        code: 'CIRCULAR_REFERENCE',
        message: `Schema "${schema.name || 'Anonymous'}" has a circular reference`,
        severity: 'warning',
        location: { nodeId: id },
      });
    }
  }
}

function collectRefs(schema: SchemaNode): NodeId[] {
  const refs: NodeId[] = [];

  const collect = (schemaOrRef: SchemaOrRef) => {
    if (schemaOrRef.kind === 'ref') {
      refs.push(schemaOrRef.targetId);
    }
  };

  if (schema.properties) {
    for (const prop of schema.properties.values()) {
      collect(prop.schema);
    }
  }
  if (schema.items) collect(schema.items);
  if (schema.variants) schema.variants.forEach(collect);

  return refs;
}
