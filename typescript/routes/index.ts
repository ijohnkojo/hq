import type { ServerState } from "../state";
import { notFound } from "./http";
import { buildHeavyRoutes } from "./heavy";
import { buildStatusRoutes } from "./status";
import { buildTaskRoutes } from "./tasks";

export function createRoutes(state: ServerState) {
  return {
    ...buildStatusRoutes(state),
    ...buildTaskRoutes(state),
    ...buildHeavyRoutes(state),
    "/tasks/*": notFound(),
    "/*": notFound(),
  };
}
