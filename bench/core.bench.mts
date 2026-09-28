/**
 * Core benchmark: parse / serialize / validate / store / storage on generated specs.
 *
 *   pnpm bench                          # medium + large
 *   pnpm bench -- --size=large          # one preset (medium | large | xlarge)
 *   pnpm bench -- --json=out.json       # also write raw numbers
 *   pnpm bench -- --lib=path/to/lib     # benchmark another copy of lib/ (e.g. an older revision)
 *
 * Runs through `node --expose-gc --import tsx` so heap numbers are meaningful.
 * Every figure is the median of several runs after one warm-up run.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import * as YAML from 'yaml';
import type { ApiDocument } from '../src/lib/openapi/types';
import { SIZES, generateSpec, generateSpecYaml, type SpecSize } from '../src/test/fixtures/generate-spec';

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.slice(2).split('=');
    return [k, v ?? 'true'];
  })
);

const libRoot = resolve(args.lib ?? resolve(import.meta.dirname, '../src/lib'));
const load = (path: string) => import(pathToFileURL(resolve(libRoot, path)).href);
/* eslint-disable @typescript-eslint/no-explicit-any */
const parser: any = await load('openapi/parser.ts');
const serializer: any = await load('openapi/serializer.ts');
const validator: any = await load('openapi/validator.ts');
const storeModule: any = await load('openapi/store.ts');
const storageSerializer: any = await load('storage/serializer.ts');
const repositoryModule: any = await load('storage/repository.ts');
/* eslint-enable @typescript-eslint/no-explicit-any */

const gc = (globalThis as { gc?: () => void }).gc;
const heapMB = () => {
  gc?.();
  gc?.();
  return process.memoryUsage().heapUsed / 1024 / 1024;
};

function median(xs: number[]) {
  const s = xs.toSorted((a, b) => a - b);
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

async function timeAsync(runs: number, fn: (i: number) => Promise<unknown>): Promise<number> {
  await fn(-1);
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    await fn(i);
    samples.push(performance.now() - t0);
  }
  return median(samples);
}

type Row = { size: string; metric: string; value: number; unit: string };
const rows: Row[] = [];
const record = (size: string, metric: string, value: number, unit = 'ms') => {
  rows.push({ size, metric, value, unit });
  console.log(`  ${metric.padEnd(52)} ${value.toFixed(unit === 'ms' ? 2 : 1).padStart(10)} ${unit}`);
};

async function benchSize(name: string, size: SpecSize) {
  console.log(`\n== ${name} (${size.paths} paths, ${size.schemas} schemas) ==`);
  const spec = generateSpec(size);
  const yaml = generateSpecYaml(size);
  const json = JSON.stringify(spec);
  const heavy = name === 'medium' ? 7 : 3;
  record(name, 'fixture YAML size', yaml.length / 1024 / 1024, 'MB');
  record(name, 'operations', spec['x-generated-operations'] as number, 'count');

  // --- parse ---
  const parsed = time(heavy, () => parser.parseYaml(yaml));
  const doc = parsed.last.document as ApiDocument;
  if (!doc) throw new Error('parse failed: ' + JSON.stringify(parsed.last.errors.slice(0, 3)));
  record(name, 'parse YAML text -> ApiDocument', parsed.ms);
  record(name, 'parse JSON text -> ApiDocument', time(heavy, () => parser.parseYaml(json)).ms);
  record(name, '  (reference: yaml package, yaml.parse alone)', time(heavy, () => YAML.parse(yaml)).ms);

  // --- serialize ---
  record(name, 'serializeDocument (model -> plain object)', time(heavy, () => serializer.serializeDocument(doc)).ms);
  // cold: fresh node identities every run, so no cache can help
  const clones = Array.from({ length: heavy + 1 }, () => structuredClone(doc));
  record(name, 'serializeToYaml, cold (first render / export)', time(heavy, (i) => serializer.serializeToYaml(clones[i + 1])).ms);
  clones.length = 0;

  // --- validate ---
  record(name, 'validateDocument', time(heavy, () => validator.validateDocument(doc)).ms);

  // --- storage: serializer + IndexedDB repository (fake-indexeddb) ---
  const project = { metadata: { id: 'p', name: 'p', createdAt: 0, updatedAt: 0 }, document: doc };
  const ser = time(heavy, () => storageSerializer.serializeProject(project));
  record(name, 'storage serializeProject (format 1 record)', ser.ms);
  record(name, '  structuredClone of that record (IDB put copy)', time(heavy, () => structuredClone(ser.last)).ms);
  record(name, 'structuredClone(ApiDocument) (postMessage copy)', time(heavy, () => structuredClone(doc)).ms);

  // first save into an empty database (fresh repository and database per run)
  const firstSaves: number[] = [];
  let repo: { saveProject(p: unknown): Promise<void>; getProject(id: string): Promise<unknown> } | null = null;
  for (let i = 0; i < 3; i++) {
    globalThis.indexedDB = new IDBFactory();
    repo = new repositoryModule.IndexedDBRepository();
    const s0 = performance.now();
    await repo!.saveProject(project);
    firstSaves.push(performance.now() - s0);
  }
  record(name, 'repository.saveProject, first save (fake-indexeddb)', median(firstSaves));
  record(name, 'repository.getProject (load)', await timeAsync(3, () => repo!.getProject('p')));

  // --- store ---
  const store = storeModule.useEditorStore;
  store.getState().initializeDocument(doc);
  const routeIds = Array.from(doc.routes.keys()) as string[];
  const schemaIds = Array.from(doc.schemas.keys()) as string[];
  const objectSchema = Array.from(doc.schemas.values()).find((s) => s.type === 'object' && s.properties && s.properties.size > 1)!;
  const fieldName = Array.from(objectSchema.properties!.keys())[1];

  const heapBefore = heapMB();
  const EDITS = 50;
  const editSamples: number[] = [];
  for (let i = 0; i < EDITS; i++) {
    const t0 = performance.now();
    store.getState().updateRoute(routeIds[(i * 97) % routeIds.length], { summary: `edited ${i}` });
    editSamples.push(performance.now() - t0);
  }
  record(name, 'store updateRoute (1 keystroke), median', median(editSamples));
  const heapAfter = heapMB();
  record(name, `store heap growth after ${EDITS} edits`, heapAfter - heapBefore, 'MB');

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

  // YAML preview refresh after one edit (the old serializer always does a full run)
  serializer.serializeToYaml(store.getState().document);
  const previewSamples: number[] = [];
  for (let i = 0; i < 7; i++) {
    store.getState().updateRoute(routeIds[(i * 13) % routeIds.length], { description: `p${i}` });
    const t0 = performance.now();
    serializer.serializeToYaml(store.getState().document);
    previewSamples.push(performance.now() - t0);
  }
  record(name, 'serializeToYaml after editing 1 route (preview)', median(previewSamples));

  // autosave after one edit: repository already holds the document from the first save
  store.getState().initializeDocument(doc);
  const saveSamples: number[] = [];
  for (let i = 0; i < 5; i++) {
    store.getState().updateRoute(routeIds[(i * 31) % routeIds.length], { summary: `s${i}` });
    const t0 = performance.now();
    await repo!.saveProject({ metadata: project.metadata, document: store.getState().document });
    saveSamples.push(performance.now() - t0);
  }
  record(name, 'repository.saveProject after 1 route edit', median(saveSamples));

  const firstUsage: number[] = [];
  for (let i = 0; i < 5; i++) {
    store.getState().updateRoute(routeIds[i], { summary: `u${i}` });
    const t0 = performance.now();
    store.getState().getSchemaUsageCount(schemaIds[i]);
    firstUsage.push(performance.now() - t0);
  }
  record(name, 'getSchemaUsageCount, first call after an edit', median(firstUsage));
  const t0 = performance.now();
  for (const id of schemaIds) store.getState().getSchemaUsageCount(id);
  record(name, 'getSchemaUsageCount for every schema (list render)', performance.now() - t0);
}

console.log(`lib: ${libRoot}`);
const which = args.size ? [args.size as keyof typeof SIZES] : (['medium', 'large'] as const);
for (const key of which) await benchSize(key, SIZES[key]);

if (args.json) {
  writeFileSync(args.json, JSON.stringify(rows, null, 2));
  console.log(`\nwrote ${args.json}`);
}
