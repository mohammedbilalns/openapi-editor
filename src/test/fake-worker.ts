import type { WorkerLike } from '@/lib/openapi/worker-client';
import { handleWorkerRequest, type WorkerRequest } from '@/lib/openapi/worker-protocol';

/**
 * Stand-in for a real Worker: messages cross the boundary through
 * structuredClone exactly as with postMessage, and replies are delivered
 * asynchronously (optionally in reverse order) by the real protocol handler.
 * With a large `batch` it never replies on its own (a worker stuck on a
 * long parse).
 */
export class ClonedMessageWorker implements WorkerLike {
  private listeners: { message: ((e: { data: unknown }) => void)[]; error: ((e: { message?: string }) => void)[] } = { message: [], error: [] };
  private queue: unknown[] = [];
  terminated = false;
  constructor(private options: { reverse?: boolean; batch?: number } = {}) {}

  addEventListener(type: 'message' | 'error', listener: (e: never) => void) {
    this.listeners[type].push(listener as never);
  }
  postMessage(message: unknown) {
    if (this.terminated) return;
    const request = structuredClone(message) as WorkerRequest;
    this.queue.push(structuredClone(handleWorkerRequest(request)));
    if (this.queue.length >= (this.options.batch ?? 1)) this.flush();
  }
  private flush() {
    const replies = this.options.reverse ? this.queue.toReversed() : this.queue;
    this.queue = [];
    setTimeout(() => {
      if (this.terminated) return;
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
