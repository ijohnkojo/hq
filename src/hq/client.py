from __future__ import annotations

import requests
import typing as tp

from hq.base import HQBaseConnection
from hq.util import serialize_obj
from hq.types import TaskID, TaskStatus, AddTaskDict


def _default_task_name(fun: tp.Callable) -> str:
    return getattr(fun, "__name__", fun.__class__.__name__)


# client extends with `submit` and `map`
class HQClient(HQBaseConnection):
    def submit(
        self,
        fun: tp.Callable[[], tp.Any],
        *,
        name: str | None = None,
        queue: str = "default",
    ) -> TaskID:
        task = serialize_obj(fun)

        name = name if name is not None else _default_task_name(fun)

        body = [
            AddTaskDict({"task": task, "name": name, "queue": queue, "heavyKey": None})
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
        queue: str = "default",
    ) -> tp.List[TaskID]:
        # First we serialize the fun and send it as the 'heavy' payload once
        # Then, we distribute the args each with a pointer to the heavy payload

        # heavy payload
        heavy = serialize_obj(fun)
        # is this sufficient/ok to use `id`?
        heavy_key = f"mapfun:{id(fun)}"
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
                    "queue": queue,
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
