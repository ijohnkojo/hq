import { notFound } from "./http";
import { buildHeavyRoutes } from "./heavy";
import { buildStatusRoutes } from "./status";
import { buildTaskRoutes } from "./tasks";
import type { RedisClient } from "bun";

export function createRoutes(redisClient: RedisClient) {
  return {
    ...buildStatusRoutes(redisClient),
    ...buildTaskRoutes(redisClient),
    ...buildHeavyRoutes(redisClient),
    "/tasks/*": notFound(),
    "/*": notFound(),
  };
}
