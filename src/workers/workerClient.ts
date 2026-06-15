import type { WorkerRequest, WorkerResponse } from "../solver/solverProtocol";
import { isWorkerResponse } from "../solver/solverProtocol";

export type SolverWorkerClient = Readonly<{
  post: (request: WorkerRequest) => void;
  dispose: () => void;
}>;

export function createSolverWorkerClient(onMessage: (response: WorkerResponse) => void): SolverWorkerClient {
  const worker = new Worker(new URL("./solver.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<unknown>) => {
    if (isWorkerResponse(event.data)) {
      onMessage(event.data);
    }
  };
  worker.onerror = (event) => {
    onMessage({ type: "ERROR", code: "worker-error", message: event.message });
  };
  return {
    post: (request) => worker.postMessage(request),
    dispose: () => worker.terminate(),
  };
}
