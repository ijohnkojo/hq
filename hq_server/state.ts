// Types:
// payload is a tuple type of [taskBuf, heavyBuf]
export type Payload = [string, string | null];

// possible task status
export type TaskStatus = "success" | "running" | "error" | "queued" | "lost";

import { RedisClient } from "bun";
import { config } from "./config";
import { signale } from "./util";

// an async function that initializes the redis client
export async function initializeRedisClient() {
  const redisClient = new RedisClient(config.redis.url); // creates the redis client
  await redisClient.connect(); // connects to the redis server
  // the initial taskId counter, only set if it doesn't exist
  await redisClient.setnx("taskId", "0"); // sets the initial taskId counter
  signale.success(`Redis client initialized, connected to ${config.redis.url}`); // logs the success message with the url of the redis server
  return redisClient; // returns the redis client to be used in the server
}
