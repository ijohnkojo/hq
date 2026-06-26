import os
from hq.worker import HQWorker, run

# Connection + TLS config from the environment (defaults to plain HTTP):
#   HQ_HOST          -> server host incl. scheme (default "http://localhost")
#   HQ_PORT          -> server port (default 3000)
#   HQ_CLIENT_CACERT -> path to the CA/cert that verifies the server's TLS cert;
#                       unset -> requests' default verification (system CA bundle)
HOST = os.environ.get("HQ_HOST", "http://localhost")
PORT = int(os.environ.get("HQ_PORT", "3000"))
VERIFY = os.environ.get("HQ_CLIENT_CACERT")

if __name__ == "__main__":
    worker = HQWorker(host=HOST, port=PORT, fetch_n_tasks=3, verify=VERIFY)
    run(worker)
