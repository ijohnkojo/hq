import type { TaskStatus } from "../state";

export type AddTaskReq = {
  task: string;
  heavyKey: string | null;
};

export type AddHeavyReq = {
  task: string;
  heavyKey: string;
};

export type UpdateTaskStatusReq = {
  workerId: string;
  taskStatus: TaskStatus;
  taskInfo?: Record<string, unknown> | null;
};
