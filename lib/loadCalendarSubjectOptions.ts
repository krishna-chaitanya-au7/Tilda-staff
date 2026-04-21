/**
 * Subject catalog for Unterricht tab — aligned with StudentPlan loadSubjects (web).
 */
import { supabase } from '@/lib/supabase';
import { withAcademicYear } from '@/lib/studentPlanCalendar';

export type SubjectOptionRow = {
  id: string;
  name: string;
  is_break?: boolean;
  is_split?: boolean;
  parent_subject_id?: string | null;
  facility_id?: string | null;
};

export async function loadCalendarSubjectOptions(params: {
  facilityId: string;
  academicYearId: string | null;
  selectedClass: string;
}): Promise<SubjectOptionRow[]> {
  const { facilityId, academicYearId, selectedClass } = params;
  try {
    if (selectedClass && facilityId) {
      const { data: facilitySubjects } = await withAcademicYear(
        supabase
          .from('sch_facility_class_subjects')
          .select(
            `
            subject_id,
            is_split,
            sch_subjects (
              id,
              name,
              is_break,
              parent_subject_id,
              facility_id
            )
          `
          )
          .eq('facility_id', facilityId),
        academicYearId
      ).eq('class', selectedClass);

      if (facilitySubjects) {
        const selectedSubjectIds = new Set((facilitySubjects as any[]).map((fs) => fs.subject_id));

        const { data: childSubjects } = await supabase
          .from('sch_subjects')
          .select('id, name, is_break, parent_subject_id, facility_id')
          .in('parent_subject_id', Array.from(selectedSubjectIds))
          .or(`facility_id.is.null,facility_id.eq.${facilityId}`);

        const allRelevantSubjects = new Map<string, SubjectOptionRow>();

        (facilitySubjects as any[]).forEach((fs) => {
          if (fs.sch_subjects && !fs.sch_subjects.is_break) {
            allRelevantSubjects.set(fs.subject_id, {
              id: fs.subject_id,
              name: fs.sch_subjects.name,
              is_break: fs.sch_subjects.is_break,
              is_split: fs.is_split,
              parent_subject_id: fs.sch_subjects.parent_subject_id,
              facility_id: fs.sch_subjects.facility_id,
            });
          }
        });

        (childSubjects || []).forEach((cs: any) => {
          if (!cs.is_break) {
            allRelevantSubjects.set(cs.id, {
              id: cs.id,
              name: cs.name,
              is_break: cs.is_break,
              is_split: false,
              parent_subject_id: cs.parent_subject_id,
              facility_id: cs.facility_id,
            });
          }
        });

        return Array.from(allRelevantSubjects.values()).sort((a, b) => a.name.localeCompare(b.name));
      }
    }

    const { data } = await supabase
      .from('sch_subjects')
      .select('id, name, is_break, is_split, parent_subject_id, facility_id')
      .or(facilityId ? `facility_id.is.null,facility_id.eq.${facilityId}` : 'facility_id.is.null')
      .order('name');

    return (data || [])
      .filter((s: any) => !s.is_break)
      .map((s: any) => ({
        id: s.id,
        name: s.name,
        is_break: s.is_break,
        is_split: s.is_split,
        parent_subject_id: s.parent_subject_id,
        facility_id: s.facility_id,
      }));
  } catch {
    return [];
  }
}
