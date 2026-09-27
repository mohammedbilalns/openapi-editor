/**
 * Core benchmark: parse / serialize / validate / store / storage on generated specs.
 *
 *   pnpm bench                      # medium + large
 *   pnpm bench -- --size=medium     # one preset
 *   pnpm bench -- --json=out.json   # also write raw numbers
 *
 * Runs through `node --expose-gc --import tsx` so heap numbers are meaningful.
 * Every figure is the median of several runs (after one warm-up run).
 */
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { parseYaml } from '../src/lib/openapi/parser';
import { serializeDocument, serializeToYaml } from '../src/lib/openapi/serializer';
import { validateDocument } from '../src/lib/openapi/validator';
import { useEditorStore } from '../src/lib/openapi/store';
import { serializeProject, deserializeProject } from '../src/lib/storage/serializer';
import type { ApiDocument } from '../src/lib/openapi/types';
import { SIZES, generateSpec, type SpecSize } from '../src/test/fixtures/generate-spec';
import * as YAML from 'yaml';

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.slice(2).split('=');
    return [k, v ?? 'true'];
  })
);

const gc = (globalThis as { gc?: () => void }).gc;
const heapMB = () => {
  gc?.();
  gc?.();
  return process.memoryUsage().heapUsed / 1024 / 1024;
};

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function time<T>(runs: number, fn: (i: number) => T): { ms: number; last: T } {
  let last = fn(-1); // warm-up
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    last = fn(i);
    samples.push(performance.now() - t0);
  }
  return { ms: median(samples), last };
}

type Row = { size: string; metric: string; value: number; unit: string };
const rows: Row[] = [];
const record = (size: string, metric: string, value: number, unit = 'ms') => {
  rows.push({ size, metric, value, unit });
  console.log(`  ${metric.padEnd(48)} ${value.toFixed(unit === 'ms' ? 2 : 1).padStart(10)} ${unit}`);
};

function benchSize(name: string, size: SpecSize) {
  console.log(`\n== ${name} (${size.paths} paths, ${size.schemas} schemas) ==`);
  const spec = generateSpec(size);
  const yaml = YAML.stringify(spec, { lineWidth: 0, aliasDuplicateObjects: false });
  const json = JSON.stringify(spec);
  const heavy = name === 'large' ? 3 : 7;
  record(name, 'fixture YAML size', yaml.length / 1024 / 1024, 'MB');
  record(name, 'operations', spec['x-generated-operations'] as number, 'count');

  // --- parse ---
  const parsed = time(heavy, () => parseYaml(yaml));
  const doc = parsed.last.document as ApiDocument;
  if (!doc) throw new Error('parse failed: ' + JSON.stringify(parsed.last.errors.slice(0, 3)));
  record(name, 'parse YAML -> ApiDocument', parsed.ms);
  record(name, 'parse JSON text -> ApiDocument', time(heavy, () => parseYaml(json)).ms);
  record(name, '  (yaml.parse alone)', time(heavy, () => YAML.parse(yaml)).ms);

  // --- serialize ---
  record(name, 'serializeDocument (model -> plain object)', time(heavy, () => serializeDocument(doc)).ms);
  record(name, 'serializeToYaml (model -> YAML text)', time(heavy, () => serializeToYaml(doc)).ms);

  // --- validate ---
  record(name, 'validateDocument', time(heavy, () => validateDocument(doc)).ms);

  // --- storage ---
  const project = { metadata: { id: 'p', name: 'p', createdAt: 0, updatedAt: 0 }, document: doc };
  const ser = time(heavy, () => serializeProject(project));
  record(name, 'storage serializeProject', ser.ms);
  record(name, 'storage structuredClone (IndexedDB put cost)', time(heavy, () => structuredClone(ser.last)).ms);
  record(name, 'storage deserializeProject', time(heavy, () => deserializeProject(ser.last)).ms);
  record(name, 'structuredClone(ApiDocument) (worker transfer)', time(heavy, () => structuredClone(doc)).ms);

  // --- store ---
  const store = useEditorStore;
  store.getState().initializeDocument(doc);
  const routeIds = Array.from(doc.routes.keys());
  const schemaIds = Array.from(doc.schemas.keys());
  const objectSchema = Array.from(doc.schemas.values()).find((s) => s.type === 'object' && s.properties && s.properties.size > 1)!;
  const fieldName = Array.from(objectSchema.properties!.keys())[1];

  const heapBefore = heapMB();
  const EDITS = 50;
  const editSamples: number[] = [];
  for (let i = 0; i < EDITS; i++) {
    const t0 = performance.now();
    store.getState().updateRoute(routeIds[i % routeIds.length], { summary: `edited ${i}` });
    editSamples.push(performance.now() - t0);
  }
  record(name, 'store updateRoute (1 keystroke), median', median(editSamples));
  const heapAfter = heapMB();
  record(name, `store heap growth after ${EDITS} edits`, heapAfter - heapBefore, 'MB');
  record(name, 'store history entries retained', store.getState().history.length, 'count');

  const fieldSamples: number[] = [];
  for (let i = 0; i < 20; i++) {
    const t0 = performance.now();
    store.getState().updateField(objectSchema.id, fieldName, { description: `d${i}` });
    fieldSamples.push(performance.now() - t0);
  }
  record(name, 'store updateField (1 keystroke), median', median(fieldSamples));

  const undoSamples: number[] = [];
  for (let i = 0; i < 10; i++) {
    const t0 = performance.now();
    store.getState().undo();
    undoSamples.push(performance.now() - t0);
  }
  record(name, 'store undo, median', median(undoSamples));
  const redoSamples: number[] = [];
  for (let i = 0; i < 10; i++) {
    const t0 = performance.now();
    store.getState().redo();
    redoSamples.push(performance.now() - t0);
  }
  record(name, 'store redo, median', median(redoSamples));

  const usageOne = time(21, (i) => store.getState().getSchemaUsageCount(schemaIds[Math.max(i, 0) % schemaIds.length]));
  record(name, 'getSchemaUsageCount (1 schema)', usageOne.ms);
  const t0 = performance.now();
  for (const id of schemaIds) store.getState().getSchemaUsageCount(id);
  record(name, 'getSchemaUsageCount (every schema, list render)', performance.now() - t0);
}

const which = args.size ? [args.size as keyof typeof SIZES] : (['medium', 'large'] as const);
for (const key of which) benchSize(key, SIZES[key]);

if (args.json) {
  writeFileSync(args.json, JSON.stringify(rows, null, 2));
  console.log(`\nwrote ${args.json}`);
}
