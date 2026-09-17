import { cache } from "react";
import { getRequestDb } from "@/lib/request-db";

// One lease per render, shared by every Suspense section. Concurrent requests
// reuse the same bounded pool; no request closes another request's connection.
export const getDb = cache(() => getRequestDb(process.env.DATABASE_URL!));
