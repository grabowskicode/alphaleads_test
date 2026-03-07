// src/app/api/extract/leads/unlock-all/route.ts
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  try {
    const { leadIds } = await req.json();
    const cost = leadIds?.length || 0;

    if (cost === 0) return NextResponse.json({ success: true });

    // 1. Authenticate
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    // 2. Atomic Deduction (Zero Revenue Leakage)
    const { error: rpcError } = await supabase.rpc("decrement_credits", {
      p_user_id: userId,
      p_amount: cost,
    });

    if (rpcError) {
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 402 },
      );
    }

    // 3. Unlock the Leads
    const unlockEntries = leadIds.map((id: string) => ({
      user_id: userId,
      lead_id: id,
      is_unlocked: true,
    }));

    const { error: unlockError } = await supabase
      .from("user_leads")
      .upsert(unlockEntries, { onConflict: "user_id, lead_id" });

    // 4. The Refund Safety Net
    if (unlockError) {
      await supabase.rpc("increment_credits", {
        p_user_id: userId,
        p_amount: cost,
      });
      throw new Error("Database failed to unlock leads. Credits refunded.");
    }

    return NextResponse.json({ success: true, count: cost });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
