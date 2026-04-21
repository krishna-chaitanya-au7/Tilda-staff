import { supabase as defaultClient } from '@/lib/supabase';

/** Academic year ID 1 uses facilities table; all others use facility_year_settings. */
export const LEGACY_ACADEMIC_YEAR_ID = 1;

export function useFacilitiesTable(academicYearId: string | number | null | undefined): boolean {
  if (academicYearId == null || academicYearId === undefined) return true;
  return Number(academicYearId) === LEGACY_ACADEMIC_YEAR_ID;
}

export async function getFacilitySettingsForYear(
  facilityId: string,
  academicYearId: string | number | null
): Promise<{ facility_settings: Record<string, any>; source: 'facilities' | 'facility_year_settings' }> {
  const yearId = academicYearId != null ? Number(academicYearId) : LEGACY_ACADEMIC_YEAR_ID;

  if (useFacilitiesTable(yearId)) {
    const { data, error } = await defaultClient
      .from('facilities')
      .select('facility_settings')
      .eq('id', facilityId)
      .single();
    if (error) throw error;
    return {
      facility_settings: (data as any)?.facility_settings ?? {},
      source: 'facilities',
    };
  }

  const { data, error } = await defaultClient
    .from('facility_year_settings')
    .select('facility_settings')
    .eq('facility_id', facilityId)
    .eq('academic_year', yearId)
    .maybeSingle();
  if (error) throw error;

  return {
    facility_settings: (data as any)?.facility_settings ?? {},
    source: 'facility_year_settings',
  };
}

