/**
 * Base-schedule subject attach flow — aligned with bissfest_tool StudentPlan
 * (ensureBaseSlot + addBaseSubject + create-child subject path).
 */
import { supabase } from '@/lib/supabase';
import type { SubjectOptionRow } from '@/lib/loadCalendarSubjectOptions';
import type { PeriodRow } from '@/lib/studentPlanCalendar';
import { withAcademicYear } from '@/lib/studentPlanCalendar';

export async function ensureBaseSlot(params: {
  facilityId: string;
  academicYearId: string | null;
  periods: PeriodRow[];
  dayOfWeek: number;
  start: string;
  className: string;
}): Promise<string | null> {
  const { facilityId, academicYearId, periods, dayOfWeek, start, className } = params;
  try {
    const p = periods.find(
      (pr) =>
        String(pr.period_start).slice(0, 5) === start &&
        (pr.applies_to_days || []).includes(dayOfWeek)
    );
    if (!p) return null;

    const { data: existing } = await withAcademicYear(
      supabase
        .from('sch_class_schedule_base')
        .select('id')
        .eq('facility_id', facilityId)
        .eq('class', className)
        .eq('day_of_week', dayOfWeek)
        .eq('period_start', `${start}:00`),
      academicYearId
    ).eq('period_end', String(p.period_end));
    if (existing && existing.length > 0) return existing[0].id as string;

    const { data: ins, error: insErr } = await supabase
      .from('sch_class_schedule_base')
      .insert({
        facility_id: facilityId,
        class: className,
        academic_year: academicYearId || null,
        day_of_week: dayOfWeek,
        period_start: `${start}:00`,
        period_end: p.period_end,
      })
      .select('id')
      .single();
    if (insErr) throw insErr;
    return ins?.id || null;
  } catch {
    return null;
  }
}

export async function addBaseSubjectToClasses(params: {
  facilityId: string;
  academicYearId: string | null;
  periods: PeriodRow[];
  subjectOptions: SubjectOptionRow[];
  dayOfWeek: number;
  start: string;
  subjectId: string;
  classesToProcess: string[];
}): Promise<{ ok: boolean; error?: string }> {
  const { facilityId, academicYearId, periods, subjectOptions, dayOfWeek, start, subjectId, classesToProcess } =
    params;

  for (const className of classesToProcess) {
    if (!className) continue;

    const { data: facilitySubjects } = await withAcademicYear(
      supabase.from('sch_facility_class_subjects').select('subject_id').eq('facility_id', facilityId).eq('class', className),
      academicYearId
    );

    const allowedSubjectIds = new Set((facilitySubjects || []).map((fs: { subject_id: string }) => fs.subject_id));

    const selectedSubject = subjectOptions.find((s) => s.id === subjectId);
    let isAllowed = allowedSubjectIds.has(subjectId);
    if (!isAllowed && selectedSubject?.parent_subject_id) {
      isAllowed = allowedSubjectIds.has(selectedSubject.parent_subject_id);
    }

    if (!isAllowed) {
      return {
        ok: false,
        error: `Fach ist für Klasse ${className} nicht freigegeben. Bitte in den Klassen-Fächern aktivieren.`,
      };
    }
  }

  for (const className of classesToProcess) {
    const baseId = await ensureBaseSlot({
      facilityId,
      academicYearId,
      periods,
      dayOfWeek,
      start,
      className,
    });
    if (!baseId) continue;

    const { data: existing } = await withAcademicYear(
      supabase
        .from('sch_class_schedule_base_subjects')
        .select('id')
        .eq('base_schedule_id', baseId)
        .eq('subject_id', subjectId)
        .eq('facility_id', facilityId),
      academicYearId
    );

    if (existing && existing.length > 0) continue;

    await supabase.from('sch_class_schedule_base_subjects').insert({
      base_schedule_id: baseId,
      subject_id: subjectId,
      facility_id: facilityId,
      academic_year: academicYearId || null,
    });
  }

  return { ok: true };
}

export async function createSubjectEntryFromDialog(params: {
  facilityId: string;
  academicYearId: string | null;
  periods: PeriodRow[];
  subjectOptions: SubjectOptionRow[];
  selectedClassFallback: string;
  target: { dayIndex: number; start: string };
  dialogSelectedClass: string;
  parentSubjectId: string;
  childSubjectId: string;
  childSubjectName: string;
  mergeEnabled: boolean;
  selectedClasses: string[];
}): Promise<{ ok: boolean; error?: string }> {
  const {
    facilityId,
    academicYearId,
    periods,
    subjectOptions,
    selectedClassFallback,
    target,
    dialogSelectedClass,
    parentSubjectId,
    childSubjectId,
    childSubjectName,
    mergeEnabled,
    selectedClasses,
  } = params;

  let finalSubjectId = parentSubjectId;
  const parent = subjectOptions.find((p) => p.id === parentSubjectId);
  const targetClasses =
    mergeEnabled && selectedClasses.length > 0 ? selectedClasses : undefined;
  const classesToProcess =
    targetClasses && targetClasses.length > 0 ? targetClasses : [dialogSelectedClass || selectedClassFallback];

  if (parent?.is_split) {
    if (childSubjectId === '__create__') {
      const newName = childSubjectName.trim();
      if (!newName) return { ok: false, error: 'Name der Unterteilung fehlt.' };

      const { data: ins, error } = await supabase
        .from('sch_subjects')
        .insert({
          name: newName,
          is_split: false,
          parent_subject_id: parentSubjectId,
          facility_id: facilityId,
        })
        .select('id')
        .single();
      if (error) return { ok: false, error: error.message };
      finalSubjectId = ins?.id as string;

      for (const className of classesToProcess) {
        if (!className) continue;
        const { data: parentEntry } = await withAcademicYear(
          supabase
            .from('sch_facility_class_subjects')
            .select('id')
            .eq('facility_id', facilityId)
            .eq('class', className)
            .eq('subject_id', parentSubjectId),
          academicYearId
        ).single();

        if (parentEntry) {
          const { data: existingChild } = await withAcademicYear(
            supabase
              .from('sch_facility_class_subjects')
              .select('id')
              .eq('facility_id', facilityId)
              .eq('class', className)
              .eq('subject_id', finalSubjectId),
            academicYearId
          ).single();

          if (!existingChild) {
            await supabase.from('sch_facility_class_subjects').insert({
              facility_id: facilityId,
              academic_year: academicYearId || null,
              class: className,
              subject_id: finalSubjectId,
              is_split: false,
            });
          }
        }
      }
    } else if (childSubjectId) {
      finalSubjectId = childSubjectId;
    } else {
      return { ok: false, error: 'Bitte Unterteilung wählen oder anlegen.' };
    }
  }

  return addBaseSubjectToClasses({
    facilityId,
    academicYearId,
    periods,
    subjectOptions,
    dayOfWeek: target.dayIndex,
    start: target.start,
    subjectId: finalSubjectId,
    classesToProcess,
  });
}
