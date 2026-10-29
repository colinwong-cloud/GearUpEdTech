"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  parseStudentStampCardStatus,
  shouldRenderPracticeStampCardChrome,
  shouldRenderPracticeStampStrictChrome,
} from "@/lib/practice-stamp-card-ui";

/** Whether account/home stamp entry points should render (fail-closed until status is known). */
export function usePracticeStampCardChromeVisible(studentId: string | null): {
  visible: boolean;
  loading: boolean;
} {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(Boolean(studentId));

  const refresh = useCallback(async () => {
    if (!studentId) {
      setVisible(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setVisible(false);
    try {
      const { data, error } = await supabase.rpc("get_student_stamp_card_status", {
        p_student_id: studentId,
      });
      if (error) throw error;
      const status = parseStudentStampCardStatus(data);
      setVisible(shouldRenderPracticeStampStrictChrome(status, false));
    } catch {
      setVisible(false);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { visible, loading };
}

/** Result page and other fail-open surfaces (not account/home menu). */
export function usePracticeStampCardChromeVisibleFailOpen(studentId: string | null): {
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
