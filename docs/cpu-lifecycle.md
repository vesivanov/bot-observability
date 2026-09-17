# Database lifecycle on Fluid Compute

Ingestion and dashboard rendering use a shared, bounded Postgres.js client per
database URL and process. Authentication, IP verification, SQL semantics, and
the maximum of one database connection per client are unchanged.

`getRequestDb()` acquires a lease and registers its release with Next.js
`after()`. Streaming dashboard sections hold the same request-scoped lease
until the full response completes. One request never closes another request's
client. A request arriving within five idle seconds reuses the client and
cancels the pending shutdown. When no request arrives, the callback closes the
client before returning, so Vercel cannot suspend the process with an orphaned
connection. A new request never receives a client whose shutdown has started.

This uses Postgres.js directly; `attachDatabasePool()` does not support its
event interface. It does not change database drivers or create a VPS service.

The idle window trades a small amount of provisioned-memory time for fewer
connection handshakes during bursts. It does not remove cold starts or promise
a particular reduction in billed CPU. Monitor both CPU and provisioned memory.

Tests cover reuse, overlapping requests, idempotent release, shutdown races,
configuration isolation, failures, and registration through `after()`.
