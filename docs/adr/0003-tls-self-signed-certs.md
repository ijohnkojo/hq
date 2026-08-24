# ADR 0003: TLS via cert files on the server, `verify=` passthrough on clients

**Status:** Accepted

## Context

The HTTP boundary between client/worker and server may cross machines (and at
a facility, networks). Pickled payloads are code — the transport should be
encryptable without introducing a certificate authority or a secrets service
into a research stack.

## Decision

- The Bun server enables HTTPS when both `HQ_SERVER_KEY_FILE` and
  `HQ_SERVER_CERT_FILE` are set ([`typescript/config.ts`](../../typescript/config.ts));
  otherwise it serves plain HTTP. No code change either way.
- For development and single-facility use, a **self-signed certificate**
  (openssl one-liner, CN/SAN = the server host) is sufficient; the cert file
  is distributed to clients and workers as an ordinary file.
- Python side exposes one knob, `verify`, forwarded directly to `requests`:
  - `verify="cert.pem"` — trust exactly this (self-signed) certificate; dev
    and facility-internal default,
  - `verify=True` (default) — trust the system CA bundle; for real,
    publicly-signed certs,
  - `verify=False` — no verification; insecure, debugging only.

## Consequences

- Zero-infrastructure TLS: one openssl command, two env vars, one constructor
  argument.
- The cert file must be readable wherever a client or worker runs, and paths
  are resolved relative to each process's cwd — a recurring gotcha (notebooks
  running in `example/` need `../cert.pem`).
- Self-signed certs must carry the correct SAN (`DNS:localhost,IP:127.0.0.1`
  for local dev); mismatches surface as `SSLError` at connect time.
- No client authentication (mTLS) — anyone who can reach the port and knows a
  queue name can submit or fetch. Acceptable inside a facility; revisit if the
  server is ever exposed more widely.
