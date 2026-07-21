import { NextResponse } from "next/server";
import { LEGACY_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.delete(SESSION_COOKIE_NAME);
  response.cookies.delete(LEGACY_COOKIE_NAME);
  return response;
}
