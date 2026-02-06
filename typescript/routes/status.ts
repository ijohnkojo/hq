import type { BunRequest } from "bun";
import type { ServerState } from "../state";
import { signale } from "../util";
import { readParam } from "./http";

export function buildStatusRoutes(state: ServerState) {
  const [, , workers] = state;

  return {
    "/status": new Response("OK"),
    "/status/:workerId": async (req: BunRequest) => {
      const workerId = readParam(req, "workerId");
      if (workerId instanceof Response) {
        return workerId;
      }

      signale.info(`Received heartbeat from worker ${workerId}`);
      workers.status.set(workerId, Date.now());
      return new Response("OK");
    },
  };
}
