// Web Worker entry: runs parse / serialize / validate off the main thread.
// Load it through createOpenApiWorkerClient() (worker-client.ts).
import { handleWorkerRequest, type WorkerRequest } from './worker-protocol';

const scope = self as unknown as {
  addEventListener: (type: 'message', listener: (event: MessageEvent<WorkerRequest>) => void) => void;
  postMessage: (message: unknown) => void;
};

scope.addEventListener('message', (event) => {
  scope.postMessage(handleWorkerRequest(event.data));
});
