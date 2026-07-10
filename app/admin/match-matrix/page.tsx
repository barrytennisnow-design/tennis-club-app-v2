"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function MatchMatrixPage() {
  const supabase = createClient();
  const [defaults, setDefaults] = useState({ court: "", time: "" });
  const [generating, setGenerating] = useState(false);

  async function loadSettings() {
    const { data } = await supabase.from("app_settings").select("*");
    if (data) {
      const court = data.find(s => s.setting_key === 'default_court')?.setting_value || "TBD";
      const time = data.find(s => s.setting_key === 'default_time')?.setting_value || "8:00am";
      setDefaults({ court, time });
    }
  }

  useEffect(() => { 
    loadSettings(); 
  }, []);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Match Matrix</h1>

      <div className="p-4 border rounded bg-stone-50">
        <button 
          onClick={() => alert("Generate logic will be updated next!")} 
          className="bg-court-green text-white px-4 py-2 rounded font-medium"
        >
          Generate Match Matrix
        </button>
        <div className="text-xs text-stone-500 mt-2">
          Default Court: {defaults.court} | Default Time: {defaults.time}
        </div>
      </div>
    </div>
  );
}