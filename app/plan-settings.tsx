import { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import PlanSettingsPanel from '@/components/PlanSettingsPanel';
import { loadClosingDayStrings } from '@/lib/calendarClosingDays';
import { withAcademicYear, type PeriodRow } from '@/lib/studentPlanCalendar';

export default function PlanSettingsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ facilityId: string; academicYearId: string }>();
  const facilityId = typeof params.facilityId === 'string' ? params.facilityId : '';
  const academicYearId = typeof params.academicYearId === 'string' ? params.academicYearId : '';

  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [closingYmd, setClosingYmd] = useState<string[]>([]);

  /** closingDaysOverride: use after save so list updates immediately without a race on re-fetch (matches web). */
  const reload = useCallback(
    async (opts?: { closingDaysOverride?: string[] }) => {
      if (!facilityId || !academicYearId) return;
      try {
        if (opts?.closingDaysOverride !== undefined) {
          setClosingYmd([...opts.closingDaysOverride].sort());
        } else {
          const keys = await loadClosingDayStrings(facilityId, academicYearId);
          setClosingYmd(keys.sort());
        }
        const { data, error: err } = await withAcademicYear(
          supabase
            .from('sch_facility_periods')
            .select('id, period_start, period_end, is_break, applies_to_days, label')
            .eq('facility_id', facilityId),
          academicYearId
        ).order('period_start', { ascending: true });
        if (err) throw err;
        setPeriods((data || []) as PeriodRow[]);
      } catch {
        if (opts?.closingDaysOverride === undefined) {
          setClosingYmd([]);
        }
        setPeriods([]);
      }
    },
    [facilityId, academicYearId]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!facilityId || !academicYearId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const keys = await loadClosingDayStrings(facilityId, academicYearId);
        if (!cancelled) setClosingYmd(keys.sort());
        const { data, error: err } = await withAcademicYear(
          supabase
            .from('sch_facility_periods')
            .select('id, period_start, period_end, is_break, applies_to_days, label')
            .eq('facility_id', facilityId),
          academicYearId
        ).order('period_start', { ascending: true });
        if (!cancelled) {
          if (!err) setPeriods((data || []) as PeriodRow[]);
          else setPeriods([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [facilityId, academicYearId]);

  if (!facilityId || !academicYearId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.err}>Parameter fehlen.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <PlanSettingsPanel
      onBack={() => router.back()}
      facilityId={facilityId}
      academicYearId={academicYearId}
      periods={periods}
      initialClosingDaysYmd={closingYmd}
      onDataChanged={reload}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  err: { color: '#111827' },
});
