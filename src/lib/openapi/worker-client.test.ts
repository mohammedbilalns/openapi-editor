import { describe, expect, it } from 'vitest';
import { createOpenApiWorkerClient, WorkerCancelledError, WorkerTimeoutError } from './worker-client';
import { serializeToYaml } from './serializer';
import { REALISTIC_SPEC_YAML } from '@/test/fixtures/realistic-spec';
import { expectRefTo, schema } from '@/test/helpers';
import { ClonedMessageWorker } from '@/test/fake-worker';

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

  it('times out a call the worker never answers, then starts a fresh worker for the next call', async () => {
    const workers = [new ClonedMessageWorker({ batch: 100 }), new ClonedMessageWorker()];
    let created = 0;
    const client = createOpenApiWorkerClient(() => workers[created++], { timeoutMs: 30 });
    const stuck = client.parseYaml('openapi: 3.0.0');
    const queued = client.validateDocument({ routes: null } as never);
    await expect(stuck).rejects.toBeInstanceOf(WorkerTimeoutError);
    await expect(queued).rejects.toBeInstanceOf(WorkerCancelledError); // lost with the stuck worker
    expect(workers[0].terminated).toBe(true);

    const { document } = await client.parseYaml("openapi: 3.0.0\ninfo: {title: T, version: '1'}\npaths: {}");
    expect(document?.info.title).toBe('T');
    expect(created).toBe(2);
  });

  it('cancelPending terminates a busy worker and rejects its calls; later calls use a new one', async () => {
    const workers = [new ClonedMessageWorker({ batch: 100 }), new ClonedMessageWorker()];
    let created = 0;
    const client = createOpenApiWorkerClient(() => workers[created++]);
    client.cancelPending(); // idle: nothing to cancel, the worker is kept
    expect(workers[0].terminated).toBe(false);

    const busy = client.parseYaml('openapi: 3.0.0');
    client.cancelPending();
    await expect(busy).rejects.toBeInstanceOf(WorkerCancelledError);
    expect(workers[0].terminated).toBe(true);
    expect((await client.parseYaml("openapi: 3.0.0\ninfo: {title: U, version: '1'}\npaths: {}")).document?.info.title).toBe('U');
  });
});
