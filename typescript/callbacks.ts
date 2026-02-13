import type { RedisClient } from "bun";
import { signale } from "./util";

// Check that each worker sends at least one heartbeat every `delay` ms.
// If not, mark all currently running tasks owned by that worker as "lost".
export function workersAreAlive(redisClient: RedisClient, delay: number) {
  return async () => {
    const now = Date.now();
    const workersHealth = await redisClient.hgetall("workers:health");

    for (const [workerId, lastPing] of Object.entries(workersHealth)) {
      const diff = now - Number(lastPing);
      if (diff <= delay) {
        continue;
      }

      const runningKey = `workers:running:${workerId}`;
      const taskIds = await redisClient.smembers(runningKey);

      let lostCount = 0;
      for (const taskId of taskIds) {
        const taskKey = `tasks:${taskId}`;
        const [status, owner] = (await redisClient.hmget(taskKey, [
          "status",
          "worker",
        ])) as [string, string];

        if (status === "running" && owner === workerId) {
          await Promise.all([
            redisClient.hset(taskKey, "status", "lost"),
            redisClient.srem(runningKey, taskId),
          ]);
          lostCount += 1;
        } else {
          await redisClient.srem(runningKey, taskId);
        }
      }

      // Remove stale heartbeat to avoid repeated handling of the same timeout.
      await redisClient.hdel("workers:health", workerId);

      signale.warn(
        `Worker ${workerId} timed out after ${diff}ms (threshold ${delay}ms), marked ${lostCount} task(s) as lost`,
      );
    }
  };
}
