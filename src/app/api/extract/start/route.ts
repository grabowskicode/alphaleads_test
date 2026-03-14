// src/app/api/extract/start/route.ts
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { addLog } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const { keyword, location } = await req.json();

    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    const [city, areasString] = location.split(" | ");
    if (!city || !areasString) {
      return NextResponse.json(
        { error: "Invalid location format." },
        { status: 400 },
      );
    }
    const selectedAreas = areasString.split(",").map((a: string) => a.trim());

    const { data: zipData, error: zipError } = await supabase
      .from("postal_codes")
      .select("zip_code")
      .ilike("city", `%${city}%`)
      .in("admin2", selectedAreas);

    if (zipError || !zipData || zipData.length === 0) {
      return NextResponse.json(
        { error: "Could not map zip codes for this area." },
        { status: 400 },
      );
    }

    const zipCodes = zipData.map((z) => z.zip_code);

    if (zipCodes.length > 50) {
      return NextResponse.json(
        { error: "Maximum of 50 zip codes exceeded." },
        { status: 400 },
      );
    }

    const reservedCost = zipCodes.length;
    const MAX_RESULTS_TOTAL = 2000;
    const dynamicLimit = Math.max(
      10,
      Math.floor(MAX_RESULTS_TOTAL / zipCodes.length),
    );

    const { error: rpcError } = await supabase.rpc("start_scan_transaction", {
      p_user_id: userId,
      p_cost: reservedCost,
      p_max_scans: 100,
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 403 });
    }

    const searchQueries = zipCodes
      .map((zip) => `${keyword} in ${zip}`)
      .join(",");
    addLog(
      `STARTING ASYNC JOB: ${zipCodes.length} zips for "${keyword}" (-${reservedCost} reserved)`,
    );

    // 🚨 SECURE FIX 1: Use Environment Variable for Host
    // Make sure NEXT_PUBLIC_APP_URL is set in your .env (e.g., https://alphaleads.com)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:9002";

    // 🚨 SECURE FIX 2: Attach WEBHOOK_SECRET to the callback URL
    const webhookToken = process.env.WEBHOOK_SECRET;
    if (!webhookToken)
      throw new Error("Server configuration error: Missing WEBHOOK_SECRET");

    const webhookUrl = `${appUrl}/api/webhooks/outscraper?userId=${userId}&cost=${reservedCost}&keyword=${encodeURIComponent(keyword)}&token=${webhookToken}`;

    const apiUrl = `https://api.app.outscraper.com/maps/search-v2?query=${encodeURIComponent(searchQueries)}&limit=${dynamicLimit}&async=true&webhookUrl=${encodeURIComponent(webhookUrl)}`;

    const response = await fetch(apiUrl, {
      headers: { "X-API-KEY": process.env.OUTSCRAPER_API_KEY! },
    });
    const data = await response.json();

    if (!data.id) {
      await supabase.rpc("increment_credits", {
        p_user_id: userId,
        p_amount: reservedCost,
      });
      throw new Error("Outscraper API Failed. Credits Refunded.");
    }

    await supabase.from("processed_requests").insert({
      request_id: data.id,
      user_id: userId,
      status: "pending",
    });

    return NextResponse.json({ success: true, requestId: data.id });
  } catch (error: any) {
    console.error("Start Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
