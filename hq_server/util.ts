// imports
import { Signale } from "signale";


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
