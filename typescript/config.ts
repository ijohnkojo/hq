import type { TLSOptions } from "bun";
import { signale } from "./util";

// recursively make any property of an object readonly at the type level
type Immutable<T> = {
  readonly [K in keyof T]: Immutable<T[K]>;
};

type Config = {
  server: {
    name: string;
    port: number;
    workerTimeoutMs: number;
    tls: TLSOptions | undefined;
  };
  logging: {
    level: string;
  };
  redis: {
    url: string;
  };
};

export const config: Immutable<Config> = {
  server: {
    // global name of this server (for logging)
    name: "hq-server",
    // port this server listens to
    port: Number(process.env.HQ_SERVER_PORT ?? 3000),
    // timeout for worker heartbeats
    workerTimeoutMs: Number(process.env.HQ_WORKER_TIMEOUT ?? 30_000),
    // parse TLS files if provided
    tls: await (async () => {
      const key = process.env.HQ_SERVER_KEY_FILE;
      const cert = process.env.HQ_SERVER_CERT_FILE;

      if (!key || !cert) return undefined;

      const keyFile = Bun.file(key);
      const certFile = Bun.file(cert);

      if (!(await keyFile.exists()) || !(await certFile.exists())) {
        return undefined;
      }

      signale.info(`Found TLS files at ${key} (key) and ${cert} (cert)`);

      // Bun's TLSOptions
      return { key: keyFile, cert: certFile };
    })(),
  },
  logging: {
    level: process.env.HQ_LOG_LEVEL ?? "info",
  },
  redis: {
    url: process.env.HQ_REDIS_URL ?? "redis://localhost:6379",
  },
};
