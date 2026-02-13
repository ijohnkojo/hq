// Types:
// payload is a tuple type of [taskBuf, heavyBuf]
export type Payload = [string, string | null];

// possible task status
export type TaskStatus = "success" | "running" | "error" | "queued" | "lost";

// possible worker status
export type WorkerStatus = "online" | "offline";

import { RedisClient } from "bun";
import { config } from "./config";
import { signale } from "./util";

export async function initializeRedisClient() {
  const redisClient = new RedisClient(config.redis.url);
  await redisClient.connect();
  // the initial taskId counter, only set if it doesn't exist
  await redisClient.setnx("taskId", "0");
  signale.success(`Redis client initialized, connected to ${config.redis.url}`);
  return redisClient;
}
