// Types:
// payload is a tuple type of [taskBuf, heavyBuf]
export type Payload = [string, string | null];

// task info
export type TaskInfo = {
  workerId: string | null; // the worker that runs the task
  runtime: number | null; // in ms
  extra: string | null; // extra info, e.g. path to log file / error (something a worker needs to specify)
};

export type TaskStatus = {
  status: "success" | "running" | "error" | "queued" | "lost";
  info: TaskInfo;
};

type HeavyState = {
  // Map that stores heavy buffers (multiple tasks may have a pointer to one heavy buffer)
  bufs: Map<string, string>;
  // Map that ref counts heavy buffers to properly evict them
  refCounts: Map<string, number>;
};

type TaskState = {
  // Map that tracks available tasks (to be run)
  available: Map<number, Payload>;
  // Map that tracks running tasks
  running: Map<string, number[]>;
  // Map that tracks task statuses
  status: Map<number, TaskStatus>;
};

type WorkerState = {
  // Map that tracks worker statuses
  status: Map<string, number>;
};

export type ServerState = [HeavyState, TaskState, WorkerState];

export function createServerState(): ServerState {
  return [
    // HeavyState
    {
      bufs: new Map<string, string>(),
      refCounts: new Map<string, number>(),
    },
    // TaskState
    {
      available: new Map<number, Payload>(),
      running: new Map<string, number[]>(),
      status: new Map<number, TaskStatus>(),
    },
    // WorkerState
    {
      status: new Map<string, number>(),
    },
  ];
}
