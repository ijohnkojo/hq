import { RedisClient, type BunRequest } from "bun";
import type { Payload, TaskStatus } from "../state";
import { signale } from "../util";
import { badRequest } from "./http";
import type {
  AddTaskReq,
  QueryTaskStatusReq,
  UpdateTaskStatusReq,
} from "./types";

function isTerminalTaskStatus(
  status: TaskStatus,
): status is "success" | "error" | "lost" {
  return status === "success" || status === "error" || status === "lost";
}

type TaskHash = {
  taskBuf: string;
  heavyKey: string;
  queue: string;
  status: TaskStatus;
  worker: string;
  info: string;
};

export function buildTaskRoutes(redisClient: RedisClient) {
  async function claimTask(workerId: string, id: string): Promise<Payload> {
    const taskKey = `tasks:${id}`;
    const [taskBuf, heavyKey] = (await redisClient.hmget(taskKey, [
      "taskBuf",
      "heavyKey",
    ])) as [string, string];
    signale.info(`Task ${id} is evicted from the queue`);

    // update task status to running and store the workerId where it is processed
    await Promise.all([
      redisClient.hset(taskKey, "status", "running", "worker", workerId),
      redisClient.sadd(`workers:running:${workerId}`, id),
    ]);

    signale.info(`Task ${id} is set to run on worker ${workerId}`);

    if (heavyKey) {
      const heavyRedisKey = `heavy:${heavyKey}`;
      const [heavyBuf] = await redisClient.hmget(heavyRedisKey, ["buf"]);
      if (heavyBuf) {
        // atomic decrement to avoid lost updates across server instances
        const newRefCountRaw = await redisClient.hincrby(
          heavyRedisKey,
          "refCount",
          -1,
        );
        const newRefCount = Number(newRefCountRaw);
        if (newRefCount <= 0) {
          signale.debug(
            `Deleting heavy key ${heavyKey} (${Buffer.from(heavyBuf).length} bytes), ref count at 0`,
          );
          await redisClient.del(heavyRedisKey);
        }
        return [taskBuf, heavyBuf];
      }
    }
    return [taskBuf, null];
  }

  async function addTask(json: AddTaskReq): Promise<number> {
    const taskId = String(await redisClient.incr("taskId"));
    const queueName = json.queue.trim();

    let payloadSize = Buffer.from(json.task).length;
    let logMsg = `Task ${taskId} received`;

    if (json.heavyKey) {
      payloadSize += Buffer.from(json.heavyKey).length;
      logMsg += ` with heavy key ${json.heavyKey}`;

      // then increment
      await redisClient.hincrby(`heavy:${json.heavyKey}`, "refCount", 1);
    }

    signale.info(logMsg + ` (${payloadSize} bytes)`);

    // tasks:queue is the message queue
    // tasks:{taskId} is the state of a task
    const taskKey = `tasks:${taskId}`;
    // write task state before enqueueing to prevent consumers seeing missing task bodies
    const taskHash = {
      taskBuf: json.task,
      heavyKey: json.heavyKey ?? "",
      queue: queueName,
      status: "queued",
      worker: "",
      info: "",
    } satisfies TaskHash;
    await redisClient.hset(taskKey, taskHash);
    await redisClient.lpush(`tasks:queue:${queueName}`, taskId);

    signale.info(`Task ${taskId} is now queued`);
    return Number(taskId);
  }

  return {
    "/tasks": {
      POST: async (req: BunRequest) => {
        const jsons = (await req.json()) as AddTaskReq[];
        const taskIds: number[] = [];
        for (const json of jsons) {
          if (
            typeof json.queue !== "string" ||
            json.queue.trim().length === 0
          ) {
            return badRequest("Invalid queue: must be a non-empty string");
          }
          taskIds.push(await addTask(json));
        }
        return Response.json({ taskIds });
      },
    },
    "/tasks/fetch/:workerId/:queue/:n": async (req: BunRequest) => {
      const workerId = req.params.workerId;
      if (workerId === undefined || workerId.trim().length === 0) {
        return badRequest("Invalid workerId");
      }

      const queueName = req.params.queue;
      if (typeof queueName !== "string" || queueName.trim().length === 0) {
        return badRequest("Invalid queue");
      }

      const requestedCount = Number(req.params.n);
      if (!Number.isInteger(requestedCount) || requestedCount < 0) {
        return badRequest(`Invalid 'n', got ${requestedCount}`);
      }

      const payloads: Payload[] = [];
      const taskIds: string[] = [];

      for (let i = 0; i < requestedCount; i++) {
        const id = await redisClient.rpop(`tasks:queue:${queueName}`);
        if (id === null) {
          break;
        }

        const payload = await claimTask(workerId, id);
        payloads.push(payload);
        taskIds.push(id);
      }

      return Response.json({ taskIds, payloads });
    },
    "/tasks/status": {
      POST: async (req: BunRequest) => {
        const json = (await req.json()) as QueryTaskStatusReq;
        if (!Array.isArray(json.taskIds)) {
          return badRequest("Invalid request body: 'taskIds' must be an array");
        }

        const taskIds = json.taskIds.map(Number);
        for (const taskId of taskIds) {
          if (!Number.isInteger(taskId) || taskId < 0) {
            return badRequest(`Invalid 'taskId' in batch, got ${taskId}`);
          }
        }

        const rows = await Promise.all(
          taskIds.map((taskId) =>
            redisClient.hmget(`tasks:${taskId}`, [
              "status",
              "worker",
              "queue",
              "info",
            ]),
          ),
        );

        const tasks = rows.map((row, index) => {
          const taskId = taskIds[index] as number;
          const [taskStatus, workerId, queueName, taskInfoRaw] = row as [
            string,
            string,
            string,
            string | null,
          ];

          let taskInfo: Record<string, unknown> | null = null;
          if (taskInfoRaw) {
            try {
              taskInfo = JSON.parse(taskInfoRaw) as Record<string, unknown>;
            } catch {
              taskInfo = null;
            }
          }

          if (!taskStatus) {
            return {
              taskId,
              status: null,
              workerId: null,
              queue: null,
              info: null,
            };
          }

          return {
            taskId,
            status: taskStatus,
            workerId: workerId === "" ? null : workerId,
            queue: queueName === "" ? null : queueName,
            info: taskInfo,
          };
        });

        return Response.json({ tasks });
      },
    },
    "/tasks/status/:taskId": {
      POST: async (req: BunRequest) => {
        const taskId = Number(req.params.taskId);
        if (!Number.isInteger(taskId) || taskId < 0) {
          return badRequest(`Invalid 'taskId', got ${taskId}`);
        }

        const taskStatusUpdate = (await req.json()) as UpdateTaskStatusReq;
        const { workerId, taskStatus, taskInfo } = taskStatusUpdate;
        if (typeof workerId !== "string" || workerId.trim().length === 0) {
          return badRequest("Invalid workerId");
        }

        if (!isTerminalTaskStatus(taskStatus)) {
          return badRequest(
            `Task ${taskId} can't be updated to be '${taskStatus}', only 'success', 'error' or 'lost' allowed`,
          );
        }

        const taskKey = `tasks:${taskId}`;
        const [currentStatus, currentWorker] = (await redisClient.hmget(
          taskKey,
          ["status", "worker"],
        )) as [string, string];

        if (!currentStatus) {
          return badRequest(
            `Task ${taskId} doesn't exist, can't update its status`,
          );
        }

        if (currentWorker !== workerId) {
          return badRequest(
            `Task ${taskId} is owned by worker '${currentWorker}', got '${workerId}'`,
          );
        }

        if (currentStatus !== "running") {
          return badRequest(
            `Task ${taskId} is '${currentStatus}', only running tasks can transition to terminal status`,
          );
        }
        await Promise.all([
          redisClient.hset(taskKey, "status", taskStatus),
          redisClient.hset(taskKey, "info", JSON.stringify(taskInfo ?? null)),
          redisClient.srem(`workers:running:${workerId}`, String(taskId)),
        ]);

        return new Response("Ok");
      },
    },
  };
}
