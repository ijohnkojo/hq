// imports
import type { TLSOptions } from "bun";
import { createRoutes } from "./routes";
import { workersAreAlive } from "./callbacks";
import { config } from "./config";
import { signale, periodicCallback } from "./util";
import { initializeRedisClient } from "./state";

// an async function that initializes the server
async function initializeServer() {
  signale.start(`${config.server.name} starting...`);

  const redisClient = await initializeRedisClient(); // initializes the redis client

  // initialize state and routes
  const routes = createRoutes(redisClient);

  // creates the server
  const server = Bun.serve({
    port: config.server.port,
    // `routes` requires Bun v1.2.3+
    routes: routes,
    // if HQ_SERVER_KEY_FILE and HQ_SERVER_CERT_FILE are set we can use tls
    tls: config.server.tls as TLSOptions | undefined,
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
