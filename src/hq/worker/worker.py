from __future__ import annotations

import json
import multiprocessing
from pathlib import Path
import requests
import time
import socket
import subprocess
import os
import typing as tp

from hq.base import HQBaseConnection
from hq.util import result_path, result_key


# worker extends with `fetch`
class HQWorker(HQBaseConnection):
    __slots__ = ("host", "port", "worker_id", "fetch_n_tasks", "queue", "verify")

    def __init__(
        self,
        host: str,
        port: int,
        *,
        queue: str,
        worker_id: str | None = None,
        fetch_n_tasks: int = 1,
        verify: bool | str | None = None,
    ) -> None:
        super().__init__(host, port, verify=verify)
        if worker_id is None:
            self.worker_id = f"{socket.gethostname()}-{os.getpid()}" # worker id is the hostname and pid, unless specified from the params
        else:
            if len(worker_id.strip()) == 0:
                raise ValueError(f"{worker_id=} can't be empty")
            self.worker_id = worker_id
        if fetch_n_tasks < 1:
            raise ValueError(f"{fetch_n_tasks=} needs to be larger than zero")
        self.fetch_n_tasks = fetch_n_tasks
        if len(queue.strip()) == 0:
            raise ValueError(f"{queue=} can't be empty")
        self.queue = queue.strip()

    def heartbeat(self) -> None:
        response = requests.get(
            f"{self.url}/status/{self.worker_id}", verify=self.verify # so essentially in this request we are sending the worker id to the server to record in the redis db, through the url  
        )
        response.raise_for_status()

    def _fetch_tasks(self) -> dict:
        response = requests.get(
            f"{self.url}/tasks/fetch/{self.worker_id}/{self.queue}/{self.fetch_n_tasks}",
            verify=self.verify,
        )
        response.raise_for_status()
        # pairs of taskIds and task+heavy buf [[], ...]
        return response.json()


def _process_loop(worker: HQWorker) -> None:
    while True:
        with worker:
            print(f"Trying to fetch {worker.fetch_n_tasks} task(s)...")
            ids_and_payloads = worker._fetch_tasks()
            if len(ids_and_payloads) == 0:
                print("No tasks currently exist, continue trying...")
                continue

            ids = ids_and_payloads["taskIds"]
            payloads = ids_and_payloads["payloads"]
            
            # here we are iterating over the task ids and payloads, and for each task we are executing the task as a subprocess, and then updating the task status in the queue
            for task_id, payload in zip(ids, payloads):
                executable = Path(__file__).parent / "exe.py"
                proc = subprocess.Popen(
                    ["python", str(executable), task_id, json.dumps(payload)],
                    stdout=None,
                    stderr=subprocess.PIPE,
                    text=True,
                )

                # wait for proc to finish and communicate err that contains execution information
                _, err = proc.communicate()

                info = json.loads(err)
                
                # heavy payload: local FS only, I need to strip it from the info before HTTP posting
                # Heavy payload stays on local FS — strip before HTTP status update
                task_result = info.pop("taskResult", None)
                if info.get("taskStatus") == "success" and task_result is not None:
                    out = result_path(worker.queue, task_id)
                    out.parent.mkdir(parents=True, exist_ok=True)
                    out.write_text(task_result)  # base64 from serialize_obj
                    info["taskInfo"]["resultPath"] = result_key(worker.queue, task_id)
                
                # update task status in the queue
                status_body = {
                    "workerId": worker.worker_id,
                    **info,  # taskStatus + taskInfo only — no taskResult
                }
                response = requests.post(
                    f"{worker.url}/tasks/status/{task_id}",
                    json=status_body,
                    verify=worker.verify,
                )
                response.raise_for_status()

        # let the server breathe
        time.sleep(1)


def _heartbeat_loop(worker: HQWorker) -> None:
    while True:
        worker.heartbeat()
        time.sleep(1)  # ping every 1s


# extend if needed, they're started as subprocesses
services: dict[str, tp.Callable[[HQWorker], None]] = {
    "heartbeat": _heartbeat_loop,
    "process": _process_loop,
}


def run(worker: HQWorker) -> None:
    service_procs = []
    for name, service in services.items():
        service_procs.append(
            multiprocessing.Process(
                name=name, target=service, args=(worker,), daemon=True
            )
        )

    for p in service_procs:
        p.start()

    for p in service_procs:
        p.join()
