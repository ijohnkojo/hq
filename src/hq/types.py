from __future__ import annotations

import typing as tp

# These types reflect the types defined in the hq_server/server.ts implementation

TaskID: tp.TypeAlias = int


class AddTaskDict(tp.TypedDict):
    task: str
    name: str
    queue: str
    heavyKey: str | None


class TaskStatus(tp.TypedDict):
    status: (
        tp.Literal["success"]
        | tp.Literal["running"]
        | tp.Literal["error"]
        | tp.Literal["queued"]
        | tp.Literal["lost"]
    )
    name: str | None
    workerId: str | None
    queue: str | None
    info: dict[str, tp.Any] | None
