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
    return NextResponse.redirect(new URL("/dashboard?error=not_configured", request.url), 303);
  }

  if (!checkLoginRateLimit(request)) {
    return NextResponse.redirect(new URL("/dashboard?error=rate_limited", request.url), 303);
  }

  const formData = await request.formData();
  const token = formData.get("token");

  if (typeof token !== "string" || !isTokenValid(token, adminToken)) {
    return NextResponse.redirect(new URL("/dashboard?error=invalid", request.url), 303);
  }

  const response = NextResponse.redirect(new URL("/dashboard", request.url), 303);
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
