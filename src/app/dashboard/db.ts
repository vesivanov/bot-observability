import { cache } from "react";
import { after } from "next/server";
import { createDbClient } from "@/lib/db";

// Request-scoped DB client. `cache()` memoizes this per request so every
// Suspense-streamed section on the page shares one connection (the pool is
// `max: 1`, so this also keeps query serialization identical to before).
// `after()` runs once the full response — including streamed chunks — has
// been flushed, so the connection closes after the last section renders
// instead of racing a `finally` block against async child components.
export const getDb = cache(() => {
  const db = createDbClient(process.env.DATABASE_URL!);
  after(async () => {
    await db.close();
  });
  return db;
});
