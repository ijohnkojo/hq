from __future__ import annotations

import requests
import typing as tp
import hashlib

from hq.base import HQBaseConnection
from hq.util import serialize_obj
from hq.types import TaskID, TaskStatus, AddTaskDict


def _default_task_name(fun: tp.Callable) -> str:
    return getattr(fun, "__name__", fun.__class__.__name__)


# client extends with `submit` and `map`
class HQClient(HQBaseConnection):
    __slots__ = ("host", "port", "queue", "verify")

    def __init__(
        self,
        host: str,
        port: int,
        *,
        queue: str,
        verify: bool | str | None = None,
    ) -> None:
        super().__init__(host, port, verify=verify)
        self.queue = queue

    def submit(
        self,
        fun: tp.Callable[[], tp.Any],
        *,
        name: str | None = None,
        queue: str | None = None,
    ) -> TaskID:
        q = queue or self.queue
        task = serialize_obj(fun)

        name = name if name is not None else _default_task_name(fun)

        body = [
            AddTaskDict({"task": task, "name": name, "queue": q, "heavyKey": None})
        ]

        response = requests.post(f"{self.url}/tasks", json=body, verify=self.verify)
        if response.status_code != 200:
            raise Exception(f"Failed to submit task, got {response.status_code}")

        ids = response.json()["taskIds"]
        assert len(ids) == 1
        return ids[0]

    def map(
        self,
        fun: tp.Callable[[tp.Any], tp.Any],
        args: tp.Iterable[tp.Any],
        *,
        name: str | None = None,
        queue: str | None = None,
    ) -> tp.List[TaskID]:
        q = queue or self.queue
        # First we serialize the fun and send it as the 'heavy' payload once
        # Then, we distribute the args each with a pointer to the heavy payload

        # heavy payload
        heavy = serialize_obj(fun)
        # use sha256 to avoid collisions
        heavy_key = f"mapfun:{hashlib.sha256(heavy.encode()).hexdigest()}" 
        name = name if name is not None else _default_task_name(fun)
        body = {"task": heavy, "heavyKey": heavy_key}
        response = requests.post(f"{self.url}/heavy", json=body, verify=self.verify)
        if response.status_code != 200:
            raise Exception(f"Failed to pre-submit {fun}, got {response.status_code}")

        # submit tasks
        body = [
            AddTaskDict(
                {
                    "task": serialize_obj(arg),
                    "name": name,
                    "queue": q,
                    "heavyKey": heavy_key,
                }
            )
            for arg in args
        ]
        response = requests.post(f"{self.url}/tasks", json=body, verify=self.verify)
        if response.status_code != 200:
            raise Exception(
                f"Failed to submit tasks that map {fun} over {args}, got {response.status_code}"
            )

        return response.json()["taskIds"]

    def check(self, *task_ids: int) -> tuple[TaskStatus | None, ...]:
        ids = [int(task_id) for task_id in task_ids]
        if len(ids) == 0:
            return tuple()

        response = requests.post(
            f"{self.url}/tasks/status",
            json={"taskIds": ids},
            verify=self.verify,
        )
        response.raise_for_status()

        by_id: dict[int, TaskStatus | None] = {}
        for item in response.json()["tasks"]:
            task_id = int(item["taskId"])
            status = item["status"]
            if status is None:
                by_id[task_id] = None
                continue

            by_id[task_id] = TaskStatus(
                {
                    "status": status,
                    "name": item["name"],
                    "workerId": item["workerId"],
                    "queue": item["queue"],
                    "info": item["info"],
                }
            )

        # Preserve input ordering and multiplicity.
        return tuple(by_id.get(task_id) for task_id in ids)
