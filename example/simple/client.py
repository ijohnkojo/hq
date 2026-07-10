import os
import time
from hq.client import HQClient
from hq.util import generate_queue_name

from dotenv import load_dotenv
from pathlib import Path

EXAMPLE_DIR = Path(__file__).resolve().parents[1]
env = EXAMPLE_DIR / ".env"
load_dotenv(env if env.is_file() else EXAMPLE_DIR / ".env.example")

# Connection + TLS config from the environment (defaults to plain HTTP):
#   HQ_HOST          -> server host incl. scheme (default "http://localhost")
#   HQ_PORT          -> server port (default 3000)
#   HQ_VERIFY -> path to the CA/cert that verifies the server's TLS cert;
#                       unset -> requests' default verification (system CA bundle)
HOST = os.getenv("HQ_HOST", "http://localhost") # it defaults to http://localhost (no tls) if not set
PORT = int(os.getenv("HQ_PORT", "3000")) # it defaults to 3000 if not set
VERIFY = os.getenv("HQ_VERIFY") # it defaults to True if not set
QUEUE = os.getenv("HQ_QUEUE") or generate_queue_name() # use the queue name from the environment if set, otherwise generate a new one
os.environ["HQ_QUEUE"] = QUEUE # so that the worker can use the same queue
print(f"Using HQ_QUEUE={QUEUE}") #log the queue name to console

def my_function() -> str:
    time.sleep(0.5)
    return "Hello, World!"


def my_map_fun(i: int) -> int:
    time.sleep(1)
    return i * 2


def my_faulty_fun() -> None:
    raise ValueError("This is a faulty function")


if __name__ == "__main__":
    with HQClient(host=HOST, port=PORT, verify=VERIFY, queue=QUEUE) as client:
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
