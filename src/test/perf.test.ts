/// <reference types="node" />
/**
 * Performance regression guard on the generated ~14 MB spec.
 *
 * Budgets are deliberately generous (several times the measured values on a
 * laptop) so the test only fails on algorithmic regressions, e.g. going back
 * to the `yaml` package (~9 s parse), deep-cloning the document per edit
 * (~20 ms and ~3 MB per keystroke) or re-emitting all YAML per edit (~1 s).
 * Skip with SKIP_PERF_TESTS=1 (e.g. on slow shared CI runners).
 */
import { describe, expect, it } from 'vitest';
import { parseYaml } from '@/lib/openapi/parser';
import { serializeToYaml } from '@/lib/openapi/serializer';
import { useEditorStore } from '@/lib/openapi/store';
import { SIZES, generateSpecYaml } from '@/test/fixtures/generate-spec';

const suite = process.env.SKIP_PERF_TESTS ? describe.skip : describe;

function measure<T>(fn: () => T): { ms: number; value: T } {
  const t0 = performance.now();
  const value = fn();
  return { ms: performance.now() - t0, value };
}

suite('performance guard (large generated spec)', () => {
  it('parses, serializes and edits a ~14 MB spec within budget', () => {
    const yaml = generateSpecYaml(SIZES.large);
    expect(yaml.length).toBeGreaterThan(10 * 1024 * 1024);

    const parsed = measure(() => parseYaml(yaml));
    const doc = parsed.value.document!;
    expect(doc.routes.size).toBeGreaterThan(5000);
    expect(parsed.ms).toBeLessThan(4000);

    const cold = measure(() => serializeToYaml(doc));
    expect(cold.ms).toBeLessThan(4000);
    expect(cold.value.length).toBeGreaterThan(10 * 1024 * 1024);

    const store = useEditorStore.getState();
    store.initializeDocument(doc);
    useEditorStore.setState({ historyCoalesceMs: 0 });
    const ids = Array.from(doc.routes.keys());
    let slowestEdit = 0;
    for (let i = 0; i < 30; i++) {
      const edit = measure(() => useEditorStore.getState().updateRoute(ids[i * 101], { summary: `edit ${i}` }));
      slowestEdit = Math.max(slowestEdit, edit.ms);
    }
    expect(slowestEdit).toBeLessThan(50);

    const preview = measure(() => serializeToYaml(useEditorStore.getState().document));
    expect(preview.ms).toBeLessThan(400);
    expect(preview.value).toContain('summary: edit 29');

    const usage = measure(() => {
      const s = useEditorStore.getState();
      for (const id of doc.schemas.keys()) s.getSchemaUsageCount(id);
    });
    expect(usage.ms).toBeLessThan(500);
  }, 120_000);
});
