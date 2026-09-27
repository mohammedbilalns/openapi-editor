import { describe, expect, it } from 'vitest';
import { createOpenApiWorkerClient, type WorkerLike } from './worker-client';
import { handleWorkerRequest, type WorkerRequest } from './worker-protocol';
import { serializeToYaml } from './serializer';
import { REALISTIC_SPEC_YAML } from '@/test/fixtures/realistic-spec';
import { expectRefTo, schema } from '@/test/helpers';

/**
 * Stand-in for a real Worker: messages cross the boundary through
 * structuredClone exactly as with postMessage, and replies are delivered
 * asynchronously (optionally in reverse order) by the real protocol handler.
 */
class ClonedMessageWorker implements WorkerLike {
  private listeners: { message: ((e: { data: unknown }) => void)[]; error: ((e: { message?: string }) => void)[] } = { message: [], error: [] };
  private queue: unknown[] = [];
  terminated = false;
  constructor(private options: { reverse?: boolean; batch?: number } = {}) {}

  addEventListener(type: 'message' | 'error', listener: (e: never) => void) {
    this.listeners[type].push(listener as never);
  }
  postMessage(message: unknown) {
    const request = structuredClone(message) as WorkerRequest;
    this.queue.push(structuredClone(handleWorkerRequest(request)));
    if (this.queue.length >= (this.options.batch ?? 1)) this.flush();
  }
  private flush() {
    const replies = this.options.reverse ? this.queue.reverse() : this.queue;
    this.queue = [];
    setTimeout(() => {
      for (const data of replies) for (const l of this.listeners.message) l({ data });
    });
  }
  crash(message: string) {
    for (const l of this.listeners.error) l({ message });
  }
  terminate() {
    this.terminated = true;
  }
}

describe('OpenAPI worker client', () => {
  it('parses in the worker and returns a usable document (Maps and refs survive the clone)', async () => {
    const client = createOpenApiWorkerClient(() => new ClonedMessageWorker());
    const { document, errors } = await client.parseYaml(REALISTIC_SPEC_YAML);
    expect(errors).toEqual([]);
    expect(document!.schemas).toBeInstanceOf(Map);
    expectRefTo(document!, schema(document!, 'NewPet').properties!.get('kind')!.schema, 'PetKind');
    // the cloned document serializes exactly like one parsed in-process
    expect(await client.serializeToYaml(document!)).toBe(serializeToYaml(document!));
  });

  it('routes concurrent replies to the right callers even when they arrive out of order', async () => {
    const client = createOpenApiWorkerClient(() => new ClonedMessageWorker({ reverse: true, batch: 3 }));
    const docA = (await createOpenApiWorkerClient(() => null).parseYaml(REALISTIC_SPEC_YAML)).document!;
    const [bad, yaml, validation] = await Promise.all([
      client.parseYaml('openapi: [unclosed'),
      client.serializeToYaml(docA),
      client.validateDocument(docA),
    ]);
    expect(bad.errors.map((e) => e.code)).toEqual(['YAML_PARSE_ERROR']);
    expect(yaml.startsWith('openapi: 3.0.3\n')).toBe(true);
    expect(validation.valid).toBe(true);
  });

  it('rejects a call whose handler throws, without affecting other calls', async () => {
    const client = createOpenApiWorkerClient(() => new ClonedMessageWorker());
    const broken = { routes: null } as never; // not an ApiDocument
    await expect(client.validateDocument(broken)).rejects.toThrow(/Cannot read properties/);
    expect((await client.parseYaml('openapi: 3.0.0\ninfo: {title: T, version: "1"}\npaths: {}')).document?.info.title).toBe('T');
  });

  it('rejects pending calls when the worker crashes or is terminated', async () => {
    const worker = new ClonedMessageWorker({ batch: 100 }); // never replies on its own
    const client = createOpenApiWorkerClient(() => worker);
    const pending = client.parseYaml('openapi: 3.0.0');
    worker.crash('out of memory');
    await expect(pending).rejects.toThrow('OpenAPI worker failed: out of memory');

    const next = client.parseYaml('openapi: 3.0.0');
    client.terminate();
    await expect(next).rejects.toThrow('terminated');
    expect(worker.terminated).toBe(true);
    await expect(client.parseYaml('x: 1')).rejects.toThrow('terminated');
  });

  it('falls back to in-process execution without Worker support', async () => {
    const client = createOpenApiWorkerClient(() => null);
    const { document } = await client.parseYaml(REALISTIC_SPEC_YAML);
    expect(document?.routes.size).toBe(5);
    await expect(client.validateDocument({ routes: null } as never)).rejects.toThrow(/Cannot read properties/);
  });
});
