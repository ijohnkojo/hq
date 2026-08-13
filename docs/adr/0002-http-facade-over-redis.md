# ADR 0002: HTTP facade (Bun server) instead of direct Redis access

**Status:** Accepted

## Context

Redis alone could serve as the queue: clients `LPUSH`, workers `RPOP`. But
that would expose Redis to every client and worker machine, put queue
semantics (claiming, status transitions, heavy-payload refcounting) in every
client library, and make transport security awkward (Redis TLS + auth
everywhere).

## Decision

A small Bun HTTP server ([`typescript/server.ts`](../../typescript/server.ts))
is the only process that talks to Redis. Clients and workers speak plain HTTP
(optionally HTTPS) to it. All queue semantics live server-side in the route
handlers: task claiming marks status and ownership atomically with the pop,
terminal-status updates validate owner and current state, heavy blobs are
refcounted and garbage-collected on claim.

## Consequences

- Exactly one network boundary to secure — TLS on the Bun server
  ([ADR 0003](0003-tls-self-signed-certs.md)); Redis binds to localhost.
- Protocol invariants (only `running` → terminal, only the owning worker may
  report) are enforced in one place and cannot be bypassed by a buggy client.
- Python side stays dependency-light: `requests` + `cloudpickle`.
- One more moving part to deploy and monitor (Bun + the server process).
- The server adds a hop; acceptable because payload bodies are small (results
  travel over the shared FS, [ADR 0004](0004-results-on-shared-fs.md)).
