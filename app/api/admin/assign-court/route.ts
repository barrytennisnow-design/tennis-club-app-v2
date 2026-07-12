import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer"; // Adjust this import path if needed to match your project

export async function POST(req: Request) {
  try {
    const { match_id, court_id } = await req.json();

    if (!match_id) {
      return NextResponse.json({ ok: false, error: "Match ID is required" }, { status: 400 });
    }

    const finalCourtId = court_id === "" ? null : court_id;
    const supabase = createClient(); 

    const { error } = await supabase
      .from("matches")
      .update({ court_id: finalCourtId })
      .eq("id", match_id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}