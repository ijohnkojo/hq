// imports
import { Signale } from "signale";
import { config } from "./config";

// see more levels at https://klaudiosinani.com/signale/
export const signale = new Signale({
  logLevel: config.logging.level,
});

signale.config({
  displayFilename: false,
  displayTimestamp: true,
  displayDate: true,
});

// function that starts a callback periodically every 'delay' ms
export async function periodicCallback(
  callback: () => Promise<void> | void,
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
