"use client";

import { useEffect, useState } from "react";
import { createClient } from "./supabaseClient";
import type { PermissionCheckable } from "./permissions";

export function useMyAccess(): PermissionCheckable & { loading: boolean } {
  const supabase = createClient();
  const [me, setMe] = useState<PermissionCheckable>({ role: "player", permissions: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("players")
        .select("role, permissions")
        .eq("auth_user_id", userData.user.id)
        .maybeSingle();
      if (data) setMe(data);
      setLoading(false);
    })();
  }, []);

  return { ...me, loading };
}
