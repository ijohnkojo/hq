import type { BunRequest } from "bun";
import type { Payload, ServerState, TaskInfo, TaskStatus } from "../state";
import { signale } from "../util";
import { badRequest, readParam, readPositiveIntParam } from "./http";
import type { AddTaskReq, UpdateTaskStatusReq } from "./types";

function unknownTaskInfo(workerId: string | null): TaskInfo {
  return {
    workerId,
    runtime: null,
    extra: null,
  };
}

function isTerminalTaskStatus(
  status: TaskStatus["status"],
): status is "success" | "error" | "lost" {
  return status === "success" || status === "error" || status === "lost";
}

export function buildTaskRoutes(state: ServerState) {
  let taskId = 0;
  const [heavy, tasks] = state;

  function claimTask(workerId: string, id: number): Payload | null {
    const task = tasks.available.get(id);
    if (task === undefined) {
      return null;
    }

    const [taskBuf, heavyKey] = task;
    signale.info(`Task ${id} is evicted from the queue`);
    tasks.available.delete(id);

    const runningTasks = tasks.running.get(workerId);
    if (runningTasks) {
      runningTasks.push(id);
    } else {
      tasks.running.set(workerId, [id]);
    }

    signale.info(`Task ${id} is set to run on worker ${workerId}`);
    tasks.status.set(id, {
      status: "running",
      info: unknownTaskInfo(workerId),
    });

    if (heavyKey) {
      const heavyBuf = heavy.bufs.get(heavyKey);
      if (heavyBuf) {
        heavy.refCounts.set(heavyKey, (heavy.refCounts.get(heavyKey) || 0) - 1);
        if (heavy.refCounts.get(heavyKey) === 0) {
          signale.debug(
            `Deleting heavy key ${heavyKey} (${Buffer.from(heavyBuf).length} bytes), ref count at 0`,
          );
          heavy.bufs.delete(heavyKey);
        }
        return [taskBuf, heavyBuf];
      }
    }
    return [taskBuf, null];
  }

  function addTask(json: AddTaskReq): number {
    const payload = [json.task, json.heavyKey] as Payload;

    let payloadSize = Buffer.from(json.task).length;
    let logMsg = `Task ${taskId} received`;

    if (json.heavyKey) {
      payloadSize += Buffer.from(json.heavyKey).length;
      logMsg += ` with heavy key ${json.heavyKey}`;
      heavy.refCounts.set(
        json.heavyKey,
        (heavy.refCounts.get(json.heavyKey) || 0) + 1,
      );
    }

    signale.info(logMsg + ` (${payloadSize} bytes)`);

    tasks.available.set(taskId, payload);
    signale.info(`Task ${taskId} is now queued`);
    tasks.status.set(taskId, { status: "queued", info: unknownTaskInfo(null) });
    const currentTaskId = taskId;
    taskId++;
    return currentTaskId;
  }

  return {
    "/tasks": {
      POST: async (req: BunRequest) => {
        const jsons = (await req.json()) as AddTaskReq[];
        const taskIds: number[] = [];
        for (const json of jsons) {
          taskIds.push(addTask(json));
        }
        return Response.json({ taskIds });
      },
    },
    "/tasks/fetch/:workerId/:n": async (req: BunRequest) => {
      const workerId = readParam(req, "workerId");
      if (workerId instanceof Response) {
        return workerId;
      }

      const requestedCount = readPositiveIntParam(req, "n");
      if (requestedCount instanceof Response) {
        return requestedCount;
      }

      const payloads: Payload[] = [];
      const taskIds: number[] = [];
      const availableCount = Math.min(requestedCount, tasks.available.size);

      for (let i = 0; i < availableCount; i++) {
        const id = tasks.available.keys().next().value as number | undefined;
        if (id === undefined) {
          return badRequest("No tasks available");
        }

        const payload = claimTask(workerId, id);
        if (payload === null) {
          return badRequest(`Task ${id} not found`);
        }

        payloads.push(payload);
        taskIds.push(id);
      }

      return Response.json({ taskIds, payloads });
    },
    "/tasks/status/:taskId": {
      GET: async (req: BunRequest) => {
        const id = readPositiveIntParam(req, "taskId");
        if (id instanceof Response) {
          return id;
        }
        const taskStatus = tasks.status.get(id);
        if (taskStatus) {
          return Response.json({
            status: taskStatus.status,
            info: taskStatus.info,
          });
        }
        return badRequest(`Task ${id} doesn't exist, can't query its status`);
      },
      POST: async (req: BunRequest) => {
        const id = readPositiveIntParam(req, "taskId");
        if (id instanceof Response) {
          return id;
        }

        const taskStatusUpdate = (await req.json()) as UpdateTaskStatusReq;
        const { workerId, taskStatus } = taskStatusUpdate;

        if (!isTerminalTaskStatus(taskStatus.status)) {
          return badRequest(
            `Task ${id} can't be updated to be '${taskStatus.status}', only 'success', 'error' or 'lost' allowed`,
          );
        }

        const runningTasks = tasks.running.get(workerId);
        if (runningTasks) {
          const index = runningTasks.indexOf(id, 0);
          if (index > -1) {
            runningTasks.splice(index, 1);
          }
        } else {
          return badRequest(`Worker ${workerId} is not running`);
        }

        signale.info(
          `Task ${id} is updated from 'running' to '${taskStatus.status}'`,
        );
        tasks.status.set(id, taskStatus);
        return new Response("Ok");
      },
    },
  };
}
