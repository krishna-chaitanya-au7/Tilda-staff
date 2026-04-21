import { supabase } from '@/lib/supabase';
import { LEGACY_ACADEMIC_YEAR_ID } from '@/lib/studentPlanCalendar';

/** Closing days for the facility + academic year (facilities vs facility_year_settings). */
export async function loadClosingDayStrings(
  facilityId: string,
  academicYearId: string
): Promise<string[]> {
  const yearId = Number(academicYearId);
  if (yearId === LEGACY_ACADEMIC_YEAR_ID) {
    const { data } = await supabase.from('facilities').select('closing_days').eq('id', facilityId).single();
    return Array.isArray(data?.closing_days) ? data.closing_days.map(String) : [];
  }
  const { data } = await supabase
    .from('facility_year_settings')
    .select('closing_days')
    .eq('facility_id', facilityId)
    .eq('academic_year', yearId)
    .maybeSingle();
  return Array.isArray(data?.closing_days) ? data.closing_days.map(String) : [];
}
