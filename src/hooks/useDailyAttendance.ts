import { useState, useRef, useEffect } from 'react';
import { supabase } from '../services/supabase';

export interface AttendanceStats {
  streak: number;
  monthlyPercentage: number;
  last7Days: boolean[];
}

export function useDailyAttendance(isAuthenticated: boolean) {
  const [attendanceStats, setAttendanceStats] = useState<AttendanceStats | null>(null);
  const hasCalledRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || hasCalledRef.current) return;

    const timer = setTimeout(async () => {
      hasCalledRef.current = true;
      const result = await supabase.recordDailyAttendance();
      if (result.success) {
        setAttendanceStats({
          streak: result.streak ?? 0,
          monthlyPercentage: result.monthlyPercentage ?? 0,
          last7Days: result.last7Days ?? [],
        });
      } else {
        hasCalledRef.current = false;
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [isAuthenticated]);

  return { attendanceStats };
}
