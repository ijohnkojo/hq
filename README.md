# hq (hep-queue)

A simple task-queue-like implementation with a HTTP server.

Contrary to dask-distributed-like systems workers connect to the HTTP server and fetch work continously until nothing is left. 
The server does not keep track of worker nor does the server push tasks onto them. 
This should reduce a lot of networking overhead.

Tasks are pickled with cloudpickle and distributed as messages.
The server internally holds a queue of those tasks and allows workers to fetch them in FIFO manner.

The HTTP server can be viewed as a very simplified message queue (like RabbitMQ).

## Setup:

Uses [`bun`](https://bun.com) and [`uv`](https://docs.astral.sh/uv/).

1. start a redis server that listens at `redis://localhost:6379` (or configure via `HQ_REDIS_URL` env variable), e.g.:

```shell
redis-server --port 6379
```

or use [`dragonfly`](https://github.com/dragonflydb/dragonfly) (a drop-in replacement for redis):
```shell
docker run -p 6379:6379 --ulimit memlock=-1 docker.dragonflydb.io/dragonflydb/dragonfly
```

2. start the queue server with `bun`:

```shell
bun run typescript/server.ts
```

3. submit some tasks with `uv` (prints a unique queue name):

```shell
uv run example/simple/client.py
```

4. start one or more workers on that queue:

```shell
uv run example/simple/worker.py <queue-from-client-output>
```

Once all tasks are finished redis, the server and the worker(s) can be shut down with ctrl+c.

For an end-to-end smoke test (including HTTPS), use `./scripts/testrun.sh`.

## TLS (HTTPS)

The HTTP boundary between the client/worker and the server can be encrypted with TLS.

1. Generate a self-signed certificate for local development (valid for `localhost`):

```shell
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout key.pem -out cert.pem -days 365 \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

2. Start the server with the key/cert env vars so Bun serves HTTPS:

```shell
HQ_SERVER_KEY_FILE=key.pem HQ_SERVER_CERT_FILE=cert.pem bun run typescript/server.ts
```

The server logs `Found TLS files ...` and serves at `https://localhost:3000`.

3. Point the client/worker at `https://` and tell them which certificate to trust.
   The `HQClient`/`HQWorker` constructors take a `verify` argument that is forwarded
   to `requests`:
   - `verify="cert.pem"` — trust this specific (self-signed) cert. Use for dev.
   - `verify=True` (default) — trust the system CA bundle. Use for real, publicly-signed certs.
   - `verify=False` — disable verification entirely. **Insecure**, dev-only.

```python
from hq.client import HQClient
from hq.util import generate_queue_name

queue = generate_queue_name()
with HQClient(
    host="https://localhost", port=3000, queue=queue, verify="cert.pem"
) as client:
    ...
```

Plain `http://` (no `verify`) continues to work unchanged when TLS is not configured.
