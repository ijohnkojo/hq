import type { BunRequest, RedisClient } from "bun";
import { signale } from "../util";
import { badRequest } from "./http";

export function buildStatusRoutes(redisClient: RedisClient) {
  return {
    "/status": new Response("OK"),
    "/status/:workerId": async (req: BunRequest) => {
      const workerId = req.params.workerId;
      if (workerId === undefined) {
        return badRequest("Invalid workerId");
      }

      signale.info(`Received heartbeat from worker ${workerId}`);

      // update last worker ping in redis
      const now = Date.now();
      await redisClient.hset("workers:health", workerId, now.toString());
      return new Response("OK");
    },
  };
}
