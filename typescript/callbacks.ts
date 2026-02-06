import type { ServerState, TaskStatus } from "./state";
import { signale } from "./util";

// check that no worker got lost by making sure there was
// atleast one heatbeat every HQ_WORKER_TIMEOUT milliseconds
export function workersAreAlive(state: ServerState, delay: number) {
  return () => {
    const [_, tasks, workers] = state;
    const now = Date.now();
    for (let [workerId, lastPing] of workers.status) {
      const diff = now - lastPing;
      if (diff > delay) {
        var logMsg = `Worker ${workerId} hasn't send a heartbeat within ${delay}ms (last ping was ${Math.floor(diff / 1000)}s ago)`;
        const workerTasks = tasks.running.get(workerId);
        // delete them from running and mark them as lost
        tasks.running.delete(workerId);
        workers.status.delete(workerId);
        if (workerTasks && workerTasks.length > 0) {
          logMsg += `, it lost tasks: ${workerTasks} (now marked as lost)`;
          for (const taskId of workerTasks) {
            const { status, info } = tasks.status.get(taskId) as TaskStatus;
            tasks.status.set(taskId, { status: "lost", info: info });
          }
        }
        signale.warn(logMsg);
      } else {
        signale.info(`Worker ${workerId} is alive`);
      }
    }
  };
}
