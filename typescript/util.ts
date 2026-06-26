// imports
import { Signale } from "signale";

// Read the log level directly from the environment instead of importing `config`.
// `config.ts` imports `signale` from this module, and its top-level `await` (TLS
// file loading) calls `signale` during init; importing `config` here would create
// a circular dependency that crashes when TLS is enabled. `config.logging.level`
// resolves to exactly this expression, so behavior is unchanged.
// see more levels at https://klaudiosinani.com/signale/
export const signale = new Signale({
  logLevel: process.env.HQ_LOG_LEVEL ?? "info",
});

signale.config({
  displayFilename: false,
  displayTimestamp: true,
  displayDate: true,
});

export function checkNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// function that starts a callback periodically every 'delay' ms
export async function periodicCallback(
  callback: () => Promise<void>,
  delay: number,
) {
  const sleep = (delay: number) => {
    return new Promise((done, _) => setTimeout(done, delay));
  };

  while (true) {
    await callback();
    await sleep(delay);
  }
}
