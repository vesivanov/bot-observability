import { NextResponse } from "next/server";
import {
  checkLoginRateLimit,
  createSessionValue,
  getAdminToken,
  isStrongSecret,
  isTokenValid,
  LEGACY_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  sessionMaxAgeSeconds,
} from "@/lib/auth";

export async function POST(request: Request) {
  const adminToken = getAdminToken();
  if (!isStrongSecret(adminToken)) {
    return new NextResponse(null, { status: 303, headers: { Location: "/dashboard?error=not_configured" } });
  }

  if (!checkLoginRateLimit(request)) {
    return new NextResponse(null, { status: 303, headers: { Location: "/dashboard?error=rate_limited" } });
  }

  const formData = await request.formData();
  const token = formData.get("token");

  if (typeof token !== "string" || !isTokenValid(token, adminToken)) {
    return new NextResponse(null, { status: 303, headers: { Location: "/dashboard?error=invalid" } });
  }

  const response = new NextResponse(null, { status: 303, headers: { Location: "/dashboard" } });
  response.cookies.set(SESSION_COOKIE_NAME, createSessionValue(adminToken), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: sessionMaxAgeSeconds(),
  });
  response.cookies.delete(LEGACY_COOKIE_NAME);

  return response;
}
