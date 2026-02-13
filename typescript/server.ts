// imports
import { createRoutes } from "./routes";
import { workersAreAlive } from "./callbacks";
import { config } from "./config";
import { signale, periodicCallback } from "./util";
import { initializeRedisClient } from "./state";

async function initializeServer() {
  signale.start(`${config.server.name} starting...`);

  const redisClient = await initializeRedisClient();

  // initialize state and routes
  const routes = createRoutes(redisClient);

  const server = Bun.serve({
    port: config.server.port,
    // `routes` requires Bun v1.2.3+
    routes: routes,
  });

  signale.success(`${config.server.name} running at ${server.url}`);

  // periodic callback to check worker health
  periodicCallback(
    workersAreAlive(redisClient, config.server.workerTimeoutMs),
    config.server.workerTimeoutMs,
  );
}

// Start the server
initializeServer().catch((error: unknown) => {
  signale.fatal(`Failed to start ${config.server.name}: ${String(error)}`);
  process.exit(1);
});
