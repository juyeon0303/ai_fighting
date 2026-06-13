import { NextResponse } from "next/server";
import { getStorageMode } from "@/lib/db";
import { isSupabaseEnabled } from "@/lib/supabase";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "ai-debate-arena",
    storage: getStorageMode(),
    supabase: isSupabaseEnabled(),
    timestamp: new Date().toISOString(),
  });
}
