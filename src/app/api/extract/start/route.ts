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

    // 1. DECODE THE FRONTEND PAYLOAD
    // location comes in as "City | Area1, Area2"
    const [city, areasString] = location.split(" | ");
    if (!city || !areasString) {
      return NextResponse.json(
        { error: "Invalid location format." },
        { status: 400 },
      );
    }
    const selectedAreas = areasString.split(",").map((a: string) => a.trim());

    // 2. FETCH ZIP CODES FROM SUPABASE
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

    // Vercel / Safety Check
    if (zipCodes.length > 50) {
      return NextResponse.json(
        { error: "Maximum of 50 zip codes exceeded." },
        { status: 400 },
      );
    }

    // 3. THE "GAS FEE" CALCULATION
    // Charge 1 credit per zip code to run the background engine
    const reservedCost = zipCodes.length;

    // Protect your Outscraper Budget: Cap total free leads at 2,000 per scan
    const MAX_RESULTS_TOTAL = 2000;
    const dynamicLimit = Math.max(
      10,
      Math.floor(MAX_RESULTS_TOTAL / zipCodes.length),
    );

    // 4. CHARGE THE USER THE FLAT FEE
    const { error: rpcError } = await supabase.rpc("start_scan_transaction", {
      p_user_id: userId,
      p_cost: reservedCost, // e.g., Just 40-50 Credits!
      p_max_scans: 100, // Increased limit since scans are now very cheap
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 403 });
    }

    // 5. PREPARE THE ASYNCHRONOUS OUTSCRAPER CALL
    // Build a comma-separated list of highly specific queries (e.g. "Dentist in 10001, Dentist in 10002")
    const searchQueries = zipCodes
      .map((zip) => `${keyword} in ${zip}`)
      .join(",");
    addLog(
      `STARTING ASYNC JOB: ${zipCodes.length} zips for "${keyword}" (-${reservedCost} reserved)`,
    );

    // Build the Webhook URL so Outscraper knows where to send the data when it finishes
    const host = req.headers.get("host");
    const protocol = host?.includes("localhost") ? "http" : "https";
    // We pass the userId and reservedCost in the webhook URL so we know who to refund later!
    const webhookUrl = `${protocol}://${host}/api/webhooks/outscraper?userId=${userId}&cost=${reservedCost}&keyword=${encodeURIComponent(keyword)}`;

    // Notice: We removed extractEmails and extractContacts to make this step incredibly fast and cheap
    const apiUrl = `https://api.app.outscraper.com/maps/search-v2?query=${encodeURIComponent(searchQueries)}&limit=${dynamicLimit}&async=true&webhookUrl=${encodeURIComponent(webhookUrl)}`;

    const response = await fetch(apiUrl, {
      headers: { "X-API-KEY": process.env.OUTSCRAPER_API_KEY! },
    });
    const data = await response.json();

    if (!data.id) {
      // Instant Failure = Instant Refund
      await supabase.rpc("increment_credits", {
        p_user_id: userId,
        p_amount: reservedCost,
      });
      throw new Error("Outscraper API Failed. Credits Refunded.");
    }

    // 6. RECORD THE REQUEST
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
