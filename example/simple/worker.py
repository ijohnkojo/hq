import sys

from hq.worker import HQWorker, run

HOST = "http://localhost"
PORT = 3000


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("usage: uv run example/simple/worker.py <queue>")

    queue = sys.argv[1]
    host = sys.argv[2] if len(sys.argv) > 2 else HOST
    port = int(sys.argv[3]) if len(sys.argv) > 3 else PORT
    verify = sys.argv[4] if len(sys.argv) > 4 else None

    worker = HQWorker(
        host=host, port=port, queue=queue, fetch_n_tasks=3, verify=verify
    )
    run(worker)
