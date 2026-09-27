// Web Worker entry: runs parse / serialize / validate off the main thread.
// Load it through createOpenApiWorkerClient() (worker-client.ts).
import { handleWorkerRequest, type WorkerRequest } from './worker-protocol';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: unknown) => void;
};

scope.onmessage = (event) => {
  scope.postMessage(handleWorkerRequest(event.data));
};
