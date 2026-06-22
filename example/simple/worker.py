from pathlib import Path
from hq.worker import HQWorker, run

# Trust the self-signed dev cert (repo-root/cert.pem).
CA_CERT = str(Path(__file__).resolve().parents[2] / "cert.pem")

if __name__ == "__main__":
    worker = HQWorker(
        host="https://localhost", port=3000, fetch_n_tasks=3, verify=CA_CERT
    )
    run(worker)
