import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // 1. Generate the 6-digit PIN
    const generatedPin = Math.floor(100000 + Math.random() * 900000).toString();

    // 2. Silently create the user in Supabase
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: generatedPin,
        email_confirm: true, // Bypass Supabase's default confirmation email
      });

    if (authError) {
      // If the email is already registered
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const userId = authData.user.id;

    // 3. Inject 20 Free Trial Credits, set tier to 'free', and bypass password reset
    const { error: dbError } = await supabaseAdmin.from("users").upsert({
      id: userId,
      email: email,
      credits: 20,
      scans_this_month: 0,
      tier: "free",
      needs_password_change: false, // <-- THE FIX
      created_at: new Date().toISOString(),
      is_active: true,
    });

    if (dbError) {
      console.error("Credit injection failed:", dbError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    // 4. Send the clean, custom Resend email
    await resend.emails.send({
      from: "AlphaLeads <noreply@help.alphaleads.app>",
      to: email,
      subject: "Your AlphaLeads Free Trial Access 🚀",
      html: `
        <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto; color: #111;">
          <h2 style="color: #000;">Welcome to AlphaLeads!</h2>
          <p>Your free trial account has been created and loaded with <strong>20 Free Credits</strong>.</p>
          <p>Here is your secure login PIN:</p>
          <h1 style="background: #f4f4f5; padding: 20px; text-align: center; letter-spacing: 8px; border-radius: 8px; font-size: 32px; color: #000;">
            ${generatedPin}
          </h1>
          <p>Go back to the AlphaLeads page and enter this PIN to start scraping immediately.</p>
          <p>Best,<br/>The AlphaLeads Team</p>
        </div>
      `,
    });

    return NextResponse.json({
      success: true,
      message: "PIN sent successfully",
    });
  } catch (error: any) {
    console.error("Trial Signup Error:", error);
    return NextResponse.json(
      { error: "System error occurred" },
      { status: 500 },
    );
  }
}
