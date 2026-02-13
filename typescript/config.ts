type Config = {
  server: {
    name: string;
    port: number;
    workerTimeoutMs: number;
  };
  logging: {
    level: string;
  };
  redis: {
    url: string;
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
  redis: {
    url: process.env.HQ_REDIS_URL ?? "redis://localhost:6379",
  },
};
