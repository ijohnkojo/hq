import os
from hq.worker import HQWorker, run
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
HOST = os.getenv("HQ_HOST", "http://localhost")
PORT = int(os.getenv("HQ_PORT", "3000"))
VERIFY = os.getenv("HQ_VERIFY") # it defaults to True if not set

if __name__ == "__main__":
    worker = HQWorker(host=HOST, port=PORT, fetch_n_tasks=3, verify=VERIFY)
    run(worker)
