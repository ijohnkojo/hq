import type { BunRequest } from "bun";
import type { ServerState } from "../state";
import { signale } from "../util";
import { badRequest } from "./http";
import type { AddHeavyReq } from "./types";

export function buildHeavyRoutes(state: ServerState) {
  const [heavy] = state;

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
        heavy.bufs.set(json.heavyKey, json.task);
        return Response.json({ heavyKey: json.heavyKey });
      },
    },
  };
}
