import { COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION } from "@cold-start/core";
import { NextResponse } from "next/server";

export function apiJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set(COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION);
  return response;
}
