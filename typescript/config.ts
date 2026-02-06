type Config = {
  server: {
    name: string;
    port: number;
    workerTimeoutMs: number;
  };
  logging: {
    level: string;
  };
};

export const config: Config = {
  server: {
    name: "hq-server",
    port: Number(process.env.HQ_SERVER_PORT ?? 3000),
    workerTimeoutMs: Number(process.env.HQ_WORKER_TIMEOUT ?? 30_000),
  },
  logging: {
    level: process.env.HQ_LOG_LEVEL ?? "info",
  },
};
