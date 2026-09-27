import { describe, expect, it } from 'vitest';
import { deserializeDocument, deserializeProject, serializeDocument, serializeProject } from './serializer';
import type { StoredProject } from './types';
import { REALISTIC_SPEC_YAML } from '@/test/fixtures/realistic-spec';
import { parseOk } from '@/test/helpers';

const project = (): StoredProject => ({
  metadata: { id: 'p1', name: 'Pets', createdAt: 1, updatedAt: 2 },
  document: parseOk(REALISTIC_SPEC_YAML).doc,
});

describe('storage serializer', () => {
  it('replaces the document Maps with ordered [id, value] entry arrays', () => {
    const { document } = project();
    const out = serializeDocument(document);
    expect(Array.isArray(out.routes) && Array.isArray(out.schemas) && Array.isArray(out.securitySchemes)).toBe(true);
    expect(out.routes.map(([id]) => id)).toEqual(Array.from(document.routes.keys()));
    expect(out.schemas.map(([id]) => id)).toEqual(Array.from(document.schemas.keys()));
    expect(out.schemas.map(([, s]) => s.name)).toEqual(Array.from(document.schemas.values()).map((s) => s.name));
    const route = out.routes[0][1];
    expect(Array.isArray(route.responses)).toBe(true);
    const withProps = out.schemas.find(([, s]) => s.name === 'NewPet')![1];
    expect(withProps.properties!.map(([k]) => k)).toEqual(['name', 'kind', 'status', 'birthday', 'weight', 'vaccinated', 'owner']);
  });

  it('round-trips a project through structured clone (what IndexedDB does)', () => {
    const p = project();
    const restored = deserializeProject(structuredClone(serializeProject(p)));
    expect(restored.metadata).toEqual(p.metadata);
    expect(restored.document).toEqual(p.document);
    // Maps come back as real Maps with the same key order
    expect(restored.document.routes).toBeInstanceOf(Map);
    expect(Array.from(restored.document.schemas.keys())).toEqual(Array.from(p.document.schemas.keys()));
    const r = Array.from(restored.document.routes.values()).find((x) => x.operationId === 'createPet')!;
    expect(r.requestBody!.content).toBeInstanceOf(Map);
    expect(r.responses.get('201')!.content).toBeInstanceOf(Map);
  });

  it('deserializeDocument(serializeDocument(doc)) is lossless without cloning', () => {
    const { document } = project();
    expect(deserializeDocument(serializeDocument(document))).toEqual(document);
  });
});
