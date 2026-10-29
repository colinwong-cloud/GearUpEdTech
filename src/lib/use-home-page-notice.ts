"use client";

import { useCallback, useEffect, useState } from "react";
import { parseHomePageNoticePublic, type HomePageNoticePublic } from "@/lib/home-page-notice";
import { supabase } from "@/lib/supabase";

const EMPTY: HomePageNoticePublic = {
  visible: false,
  body_text: null,
  image_url: null,
  link_url: null,
};

/** Fail-closed until RPC succeeds and server marks visible. */
export function useHomePageNotice(): {
  notice: HomePageNoticePublic;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [notice, setNotice] = useState<HomePageNoticePublic>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setNotice(EMPTY);
    try {
      const { data, error } = await supabase.rpc("get_home_page_notice_public");
      if (error) throw error;
      setNotice(parseHomePageNoticePublic(data));
    } catch {
      setNotice(EMPTY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { notice, loading, refresh };
}
