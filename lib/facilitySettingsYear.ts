/**
 * Port of bissfest_tool facility-settings-resolver.client.ts for React Native.
 * Uses the same merge/save rules as the web Caterer settings flow.
 */
import { supabase } from '@/lib/supabase';

export const LEGACY_ACADEMIC_YEAR_ID = 1;

export type FacilitySettingsResult = {
  facility_settings: Record<string, unknown>;
  pedagogical_concept: Record<string, unknown>;
  class_settings: Record<string, unknown>;
  kindergarten_settings: Record<string, unknown>;
  operating_days: string[];
  closing_days: string[];
  caterer_id?: string | null;
  supervisor_id?: string | null;
  default_menuline?: string | null;
  can_edit_child_schedule?: boolean | null;
  can_edit_child_schedule_till?: string | null;
  show_user_auto_select?: boolean | null;
  source: 'facilities' | 'facility_year_settings';
};

const DEFAULT_OPERATING_DAYS = ['Mon', 'Tue', 'Wed', 'Thu'];

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return target;
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    if (srcVal === undefined) continue;
    if (Array.isArray(srcVal)) {
      result[key] = srcVal;
    } else if (
      srcVal !== null &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      result[key] != null &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key] as Record<string, unknown>, srcVal as Record<string, unknown>);
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}

export function useFacilitiesTable(academicYearId: string | number | null | undefined): boolean {
  if (academicYearId == null || academicYearId === undefined) return true;
  return Number(academicYearId) === LEGACY_ACADEMIC_YEAR_ID;
}

export async function getFacilitySettingsForYear(
  facilityId: string,
  academicYearId: string | number | null
): Promise<FacilitySettingsResult> {
  const yearId = academicYearId != null ? Number(academicYearId) : 1;

  if (useFacilitiesTable(yearId)) {
    const { data, error } = await supabase
      .from('facilities')
      .select(
        'facility_settings, pedagogical_concept, class_settings, kindergarten_settings, operating_days, closing_days, caterer_id, supervisor_id, default_menuline, can_edit_child_schedule, can_edit_child_schedule_till, show_user_auto_select'
      )
      .eq('id', facilityId)
      .single();
    if (error) throw error;
    return {
      facility_settings: (data?.facility_settings as Record<string, unknown>) ?? {},
      pedagogical_concept: (data?.pedagogical_concept as Record<string, unknown>) ?? {},
      class_settings: (data?.class_settings as Record<string, unknown>) ?? {},
      kindergarten_settings: (data?.kindergarten_settings as Record<string, unknown>) ?? {},
      operating_days:
        Array.isArray(data?.operating_days) && data?.operating_days.length
          ? (data.operating_days as string[])
          : DEFAULT_OPERATING_DAYS,
      closing_days: Array.isArray(data?.closing_days) ? (data.closing_days as string[]) : [],
      caterer_id: data?.caterer_id ?? null,
      supervisor_id: data?.supervisor_id ?? null,
      default_menuline: (data as { default_menuline?: string | null })?.default_menuline ?? null,
      can_edit_child_schedule: (data as { can_edit_child_schedule?: boolean | null })
        ?.can_edit_child_schedule ?? null,
      can_edit_child_schedule_till: (data as { can_edit_child_schedule_till?: string | null })
        ?.can_edit_child_schedule_till ?? null,
      show_user_auto_select: (data as { show_user_auto_select?: boolean | null })
        ?.show_user_auto_select ?? null,
      source: 'facilities',
    };
  }

  const { data, error } = await supabase
    .from('facility_year_settings')
    .select(
      'facility_settings, pedagogical_concept, class_settings, kindergarten_settings, operating_days, closing_days, caterer_id, supervisor_id, default_menuline, can_edit_child_schedule, can_edit_child_schedule_till, show_user_auto_select'
    )
    .eq('facility_id', facilityId)
    .eq('academic_year', yearId)
    .maybeSingle();
  if (error) throw error;
  if (data) {
    return {
      facility_settings: (data.facility_settings as Record<string, unknown>) ?? {},
      pedagogical_concept: (data.pedagogical_concept as Record<string, unknown>) ?? {},
      class_settings: (data.class_settings as Record<string, unknown>) ?? {},
      kindergarten_settings: (data.kindergarten_settings as Record<string, unknown>) ?? {},
      operating_days:
        Array.isArray(data.operating_days) && data.operating_days.length
          ? (data.operating_days as string[])
          : DEFAULT_OPERATING_DAYS,
      closing_days: Array.isArray(data.closing_days) ? (data.closing_days as string[]) : [],
      caterer_id: data.caterer_id ?? null,
      supervisor_id: data.supervisor_id ?? null,
      default_menuline: (data as { default_menuline?: string | null }).default_menuline ?? null,
      can_edit_child_schedule: (data as { can_edit_child_schedule?: boolean | null })
        .can_edit_child_schedule ?? null,
      can_edit_child_schedule_till: (data as { can_edit_child_schedule_till?: string | null })
        .can_edit_child_schedule_till ?? null,
      show_user_auto_select: (data as { show_user_auto_select?: boolean | null })
        .show_user_auto_select ?? null,
      source: 'facility_year_settings',
    };
  }
  return {
    facility_settings: {},
    pedagogical_concept: {},
    class_settings: {},
    kindergarten_settings: {},
    operating_days: DEFAULT_OPERATING_DAYS,
    closing_days: [],
    caterer_id: null,
    supervisor_id: null,
    default_menuline: null,
    can_edit_child_schedule: null,
    can_edit_child_schedule_till: null,
    show_user_auto_select: null,
    source: 'facility_year_settings',
  };
}

export async function saveFacilitySettingsForYear(
  facilityId: string,
  academicYearId: string | number | null,
  payload: {
    facility_settings?: Record<string, unknown>;
    pedagogical_concept?: Record<string, unknown>;
    class_settings?: Record<string, unknown>;
    kindergarten_settings?: Record<string, unknown>;
    operating_days?: string[];
    closing_days?: string[] | null;
    caterer_id?: string | null;
    supervisor_id?: string | null;
    supervision_billing_to?: string | null;
    default_menuline?: string | null;
    can_edit_child_schedule?: boolean | null;
    can_edit_child_schedule_till?: string | null;
    show_user_auto_select?: boolean | null;
  }
): Promise<void> {
  const yearId = academicYearId != null ? Number(academicYearId) : 1;

  if (
    payload.facility_settings === undefined &&
    payload.pedagogical_concept === undefined &&
    payload.class_settings === undefined &&
    payload.kindergarten_settings === undefined &&
    payload.operating_days === undefined &&
    payload.closing_days === undefined &&
    payload.caterer_id === undefined &&
    payload.supervisor_id === undefined &&
    payload.supervision_billing_to === undefined &&
    payload.default_menuline === undefined &&
    payload.can_edit_child_schedule === undefined &&
    payload.can_edit_child_schedule_till === undefined &&
    payload.show_user_auto_select === undefined
  ) {
    return;
  }

  if (useFacilitiesTable(yearId)) {
    const { data: existing } = await supabase
      .from('facilities')
      .select(
        'facility_settings, pedagogical_concept, class_settings, kindergarten_settings, operating_days, closing_days, caterer_id, supervisor_id, default_menuline, can_edit_child_schedule, can_edit_child_schedule_till, show_user_auto_select'
      )
      .eq('id', facilityId)
      .maybeSingle();

    const base = {
      facility_settings: (existing?.facility_settings as Record<string, unknown>) ?? {},
      pedagogical_concept: (existing?.pedagogical_concept as Record<string, unknown>) ?? {},
      class_settings: (existing?.class_settings as Record<string, unknown>) ?? {},
      kindergarten_settings: (existing?.kindergarten_settings as Record<string, unknown>) ?? {},
      operating_days:
        Array.isArray(existing?.operating_days) && existing?.operating_days.length
          ? (existing.operating_days as string[])
          : DEFAULT_OPERATING_DAYS,
      closing_days: Array.isArray(existing?.closing_days) ? (existing.closing_days as string[]) : [],
      caterer_id: (existing as { caterer_id?: string | null })?.caterer_id ?? null,
      supervisor_id: (existing as { supervisor_id?: string | null })?.supervisor_id ?? null,
      default_menuline: (existing as { default_menuline?: string | null })?.default_menuline ?? null,
      can_edit_child_schedule: (existing as { can_edit_child_schedule?: boolean | null })
        ?.can_edit_child_schedule ?? null,
      can_edit_child_schedule_till: (existing as { can_edit_child_schedule_till?: string | null })
        ?.can_edit_child_schedule_till ?? null,
      show_user_auto_select: (existing as { show_user_auto_select?: boolean | null })
        ?.show_user_auto_select ?? null,
    };

    const merged: Record<string, unknown> = {};
    if (payload.facility_settings !== undefined) {
      merged.facility_settings = deepMerge(base.facility_settings, payload.facility_settings);
    }
    if (payload.pedagogical_concept !== undefined) {
      merged.pedagogical_concept = deepMerge(base.pedagogical_concept, payload.pedagogical_concept);
    }
    if (payload.class_settings !== undefined) {
      merged.class_settings = deepMerge(base.class_settings, payload.class_settings);
    }
    if (payload.kindergarten_settings !== undefined) {
      merged.kindergarten_settings = deepMerge(
        base.kindergarten_settings,
        payload.kindergarten_settings
      );
    }
    if (payload.operating_days !== undefined) merged.operating_days = payload.operating_days;
    if (payload.closing_days !== undefined) merged.closing_days = payload.closing_days;
    if (payload.caterer_id !== undefined) merged.caterer_id = payload.caterer_id;
    if (payload.supervisor_id !== undefined) merged.supervisor_id = payload.supervisor_id;
    if (payload.default_menuline !== undefined) merged.default_menuline = payload.default_menuline;
    if (payload.can_edit_child_schedule !== undefined)
      merged.can_edit_child_schedule = payload.can_edit_child_schedule;
    if (payload.can_edit_child_schedule_till !== undefined)
      merged.can_edit_child_schedule_till = payload.can_edit_child_schedule_till;
    if (payload.show_user_auto_select !== undefined)
      merged.show_user_auto_select = payload.show_user_auto_select;

    const { error } = await supabase.from('facilities').update(merged).eq('id', facilityId);
    if (error) throw error;
    return;
  }

  const { data: existing } = await supabase
    .from('facility_year_settings')
    .select(
      'facility_settings, pedagogical_concept, class_settings, kindergarten_settings, operating_days, closing_days, caterer_id, supervisor_id, supervision_billing_to, default_menuline, can_edit_child_schedule, can_edit_child_schedule_till, show_user_auto_select'
    )
    .eq('facility_id', facilityId)
    .eq('academic_year', yearId)
    .maybeSingle();

  const base = {
    facility_settings: (existing?.facility_settings as Record<string, unknown>) ?? {},
    pedagogical_concept: (existing?.pedagogical_concept as Record<string, unknown>) ?? {},
    class_settings: (existing?.class_settings as Record<string, unknown>) ?? {},
    kindergarten_settings: (existing?.kindergarten_settings as Record<string, unknown>) ?? {},
    operating_days:
      Array.isArray(existing?.operating_days) && existing?.operating_days.length
        ? (existing.operating_days as string[])
        : DEFAULT_OPERATING_DAYS,
    closing_days: Array.isArray(existing?.closing_days) ? (existing.closing_days as string[]) : [],
    caterer_id: existing?.caterer_id ?? null,
    supervisor_id: existing?.supervisor_id ?? null,
    supervision_billing_to: (existing as { supervision_billing_to?: string | null })
      ?.supervision_billing_to ?? null,
    default_menuline: (existing as { default_menuline?: string | null })?.default_menuline ?? null,
    can_edit_child_schedule: (existing as { can_edit_child_schedule?: boolean | null })
      ?.can_edit_child_schedule ?? null,
    can_edit_child_schedule_till: (existing as { can_edit_child_schedule_till?: string | null })
      ?.can_edit_child_schedule_till ?? null,
    show_user_auto_select: (existing as { show_user_auto_select?: boolean | null })
      ?.show_user_auto_select ?? null,
  };

  const facility_settings =
    payload.facility_settings !== undefined
      ? deepMerge(base.facility_settings, payload.facility_settings)
      : base.facility_settings;
  const class_settings =
    payload.class_settings !== undefined
      ? deepMerge(base.class_settings, payload.class_settings)
      : base.class_settings;
  const pedagogical_concept =
    payload.pedagogical_concept !== undefined
      ? deepMerge(base.pedagogical_concept, payload.pedagogical_concept)
      : base.pedagogical_concept;
  const kindergarten_settings =
    payload.kindergarten_settings !== undefined
      ? deepMerge(base.kindergarten_settings, payload.kindergarten_settings)
      : base.kindergarten_settings;
  const operating_days =
    payload.operating_days !== undefined ? payload.operating_days : base.operating_days;
  const closing_days =
    payload.closing_days !== undefined ? payload.closing_days : base.closing_days;
  const caterer_id = payload.caterer_id !== undefined ? payload.caterer_id : base.caterer_id;
  const supervisor_id =
    payload.supervisor_id !== undefined ? payload.supervisor_id : base.supervisor_id;
  const supervision_billing_to =
    payload.supervision_billing_to !== undefined
      ? payload.supervision_billing_to
      : base.supervision_billing_to;
  const default_menuline =
    payload.default_menuline !== undefined ? payload.default_menuline : base.default_menuline;
  const can_edit_child_schedule =
    payload.can_edit_child_schedule !== undefined
      ? payload.can_edit_child_schedule
      : base.can_edit_child_schedule;
  const can_edit_child_schedule_till =
    payload.can_edit_child_schedule_till !== undefined
      ? payload.can_edit_child_schedule_till
      : base.can_edit_child_schedule_till;
  const show_user_auto_select =
    payload.show_user_auto_select !== undefined
      ? payload.show_user_auto_select
      : base.show_user_auto_select;

  const row = {
    facility_id: facilityId,
    academic_year: yearId,
    facility_settings,
    pedagogical_concept,
    class_settings,
    kindergarten_settings,
    operating_days,
    closing_days,
    caterer_id,
    supervisor_id,
    supervision_billing_to,
    default_menuline,
    can_edit_child_schedule,
    can_edit_child_schedule_till,
    show_user_auto_select,
  };
  const { error } = await supabase
    .from('facility_year_settings')
    .upsert(row, { onConflict: 'facility_id,academic_year' });
  if (error) throw error;
}
