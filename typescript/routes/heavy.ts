import type { BunRequest, RedisClient } from "bun";
import { signale } from "../util";
import { badRequest } from "./http";
import type { AddHeavyReq } from "./types";

export function buildHeavyRoutes(redisClient: RedisClient) {
  return {
    "/heavy": {
      POST: async (req: BunRequest) => {
        const json = (await req.json()) as AddHeavyReq;

        if (!json.heavyKey) {
          return badRequest(
            `Heavy task key required, can't be empty, got ${json.heavyKey}`,
          );
        }

        signale.info(
          `Received heavy task ${json.heavyKey} (${Buffer.from(json.task).length} bytes)`,
        );
        const heavyRedisKey = `heavy:${json.heavyKey}`;

        // only set payload once; repeated calls with same key must match existing payload
        const created = Number(
          await redisClient.hsetnx(heavyRedisKey, "buf", json.task),
        );
        if (created === 1) {
          await redisClient.hset(heavyRedisKey, "refCount", "0");
        } else {
          const [existingBuf, refCount] = await Promise.all([
            redisClient.hget(heavyRedisKey, "buf"),
            redisClient.hget(heavyRedisKey, "refCount"),
          ]);
          if (existingBuf !== json.task) {
            return badRequest(
              `Heavy key '${json.heavyKey}' already exists with a different payload`,
            );
          }
          // ensure refCount field exists even on legacy/inconsistent entries
          if (refCount === null) {
            await redisClient.hset(heavyRedisKey, "refCount", "0");
          }
        }
        return Response.json({ heavyKey: json.heavyKey });
      },
    },
  };
}
