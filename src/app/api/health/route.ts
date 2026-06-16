import { NextResponse } from "next/server";
import { getStorageMode } from "@/lib/db";
import { isSupabaseEnabled } from "@/lib/supabase";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "jagangsecheon",
    storage: getStorageMode(),
    supabase: isSupabaseEnabled(),
    buildSha: process.env.NEXT_PUBLIC_BUILD_SHA ?? "local",
    timestamp: new Date().toISOString(),
  });
}
