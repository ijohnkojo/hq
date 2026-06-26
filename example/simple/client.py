import os
import time
from hq.client import HQClient

# Connection + TLS config from the environment (defaults to plain HTTP):
#   HQ_HOST          -> server host incl. scheme (default "http://localhost")
#   HQ_PORT          -> server port (default 3000)
#   HQ_CLIENT_CACERT -> path to the CA/cert that verifies the server's TLS cert;
#                       unset -> requests' default verification (system CA bundle)
HOST = os.environ.get("HQ_HOST", "http://localhost")
PORT = int(os.environ.get("HQ_PORT", "3000"))
VERIFY = os.environ.get("HQ_CLIENT_CACERT")


def my_function() -> str:
    time.sleep(0.5)
    return "Hello, World!"


def my_map_fun(i: int) -> int:
    time.sleep(1)
    return i * 2


def my_faulty_fun() -> None:
    raise ValueError("This is a faulty function")


if __name__ == "__main__":
    with HQClient(host=HOST, port=PORT, verify=VERIFY) as client:
        # submit some tasks
        task_id = client.submit(my_function)
        print(f"[submit] Task ID: {task_id}")

        task_ids = client.map(my_map_fun, range(20))
        print(f"[map] Task IDs: {task_ids}")

        faulty_task_id = client.submit(my_faulty_fun)
        print(f"[submit] Faulty Task ID: {faulty_task_id}")

        # check their status
        while True:
            time.sleep(3)
            print("\nChecking tasks status:")
            all_ids = [task_id, *task_ids, faulty_task_id]
            checked_many = client.check(*all_ids)
            statuses = []
            for _id, checked in zip(all_ids, checked_many):
                status = checked["status"] if checked is not None else "missing"
                statuses.append(status)
                print(f"[status] Task ID: {_id}, Status: {checked}")

            # break if all of them have been finished
            if all(status in {"success", "error", "lost"} for status in statuses):
                break
