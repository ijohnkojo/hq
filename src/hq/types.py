from __future__ import annotations

import typing as tp

# These types reflect the types defined in the typescript/server.ts implementation

TaskID: tp.TypeAlias = int


class AddTaskDict(tp.TypedDict):
    task: str
    heavyKey: str | None


class TaskInfo(tp.TypedDict):
    workerId: str | None
    runtime: float | None
    extra: str | None


class TaskStatus(tp.TypedDict):
    status: (
        tp.Literal["success"]
        | tp.Literal["running"]
        | tp.Literal["error"]
        | tp.Literal["queued"]
        | tp.Literal["lost"]
    )
    info: TaskInfo
