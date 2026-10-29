"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  parseStudentStampCardStatus,
  shouldRenderPracticeStampCardChrome,
} from "@/lib/practice-stamp-card-ui";

/** Whether student-facing stamp chrome (card, menu entry, account module) should render. */
export function usePracticeStampCardChromeVisible(studentId: string | null): {
  visible: boolean;
  loading: boolean;
} {
  const [visible, setVisible] = useState(true);
  const [loading, setLoading] = useState(Boolean(studentId));

  const refresh = useCallback(async () => {
    if (!studentId) {
      setVisible(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_student_stamp_card_status", {
        p_student_id: studentId,
      });
      if (error) throw error;
      const status = parseStudentStampCardStatus(data);
      setVisible(shouldRenderPracticeStampCardChrome(status, false));
    } catch {
      setVisible(shouldRenderPracticeStampCardChrome(null, false));
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { visible, loading };
}
