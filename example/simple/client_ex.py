import time
from collections import Counter
from hq.util import load_result

from hq.executor import HQExecutor

HOST = "https://localhost"
PORT = 3000
VERIFY = "cert.pem"


N_MAP_TASKS = 10
TASK_SLEEP_S = 0.5


def my_function() -> str:
    time.sleep(0.5)
    return "Hello, World!"


def my_map_fun(i: int) -> int:
    time.sleep(TASK_SLEEP_S)
    return i * 2


def my_faulty_fun() -> None:
    raise ValueError("This is a faulty function")


if __name__ == "__main__":
    with HQExecutor(host=HOST, port=PORT, n_workers=8, verify=VERIFY) as ex:
        print(f"queue={ex.queue}")
        print(
            f"submitting 1 + {N_MAP_TASKS} map + 1 faulty "
            f"(~{TASK_SLEEP_S}s each map task, {ex.n_workers} workers)"
        )

        task_id = ex.submit(my_function)
        task_ids = ex.map(my_map_fun, range(N_MAP_TASKS))
        faulty_id = ex.submit(my_faulty_fun)

        all_ids = [task_id, *task_ids, faulty_id]
        statuses = ex.wait(*all_ids, poll_interval=1.0)

        counts = Counter(
            (s["status"] if s is not None else "missing") for s in statuses
        )
        print(f"done: {dict(counts)}  ({len(all_ids)} tasks)")
        for status, n in sorted(counts.items()):
            print(f"  {status}: {n}")
        
        # 
        print("results:")
        for tid, status in zip(all_ids, statuses):
            if status is None:
                print(f"  {tid}: missing status")
                continue
            if status["status"] == "success":
                locator = status["info"]["resultPath"]
                value = load_result(locator)
                print(f"  {tid}: {value!r}  ({locator})")
            elif status["status"] == "error":
                err = status["info"] or {}
                print(
                    f"  {tid}: ERROR {err.get('errorType')}: {err.get('errorMessage')}"
                )
            else:
                print(f"  {tid}: {status['status']}")
