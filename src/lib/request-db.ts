import { after } from "next/server";
import { createDbClient } from "./db";
import { createIdleClientPool } from "./idle-client-pool";

const pool = createIdleClientPool(createDbClient);

export function getRequestDb(databaseUrl: string) {
  const lease = pool.acquire(databaseUrl);
  // Next keeps this callback alive after the full streamed response. The last
  // user waits up to five idle seconds, then closes the pool before suspension.
  after(() => lease.release());
  return lease.client;
}
