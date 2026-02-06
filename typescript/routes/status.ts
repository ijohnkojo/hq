import type { BunRequest } from "bun";
import type { ServerState } from "../state";
import { signale } from "../util";
import { badRequest } from "./http";

export function buildStatusRoutes(state: ServerState) {
  const [, , workers] = state;

  return {
    "/status": new Response("OK"),
    "/status/:workerId": async (req: BunRequest) => {
      const workerId = req.params.workerId;
      if (workerId === undefined) {
        return badRequest("Invalid workerId");
      }

      signale.info(`Received heartbeat from worker ${workerId}`);
      workers.status.set(workerId, Date.now());
      return new Response("OK");
    },
  };
}
