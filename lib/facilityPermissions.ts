import { supabase } from '@/lib/supabase';

export type FacilityPortal = 'facility' | 'teacher';

export type StaffUserForPortal = {
  id: string;
  user_type: string;
  record_id?: string | null;
  auth_id?: string | null;
};

export type UserAccessRow = {
  resource_type: string;
  resource_id: string;
  role?: string | null;
  user_type?: string | null;
};

/** Resolve facility UUID for staff (user_access row or main facility account). */
export function resolveFacilityIdFromAccess(
  staffUser: StaffUserForPortal,
  userAccess: UserAccessRow[]
): string | null {
  const fac = userAccess.filter((a) => a.resource_type === 'facility');
  if (fac.length) return fac[0].resource_id;
  if (String(staffUser.user_type || '').toLowerCase() === 'facility' && staffUser.record_id) {
    return staffUser.record_id;
  }
  return null;
}

export async function getFacilityTypeName(facilityId: string): Promise<string | null> {
  const { data } = await supabase.from('facilities').select('type').eq('id', facilityId).maybeSingle();
  return data?.type != null ? String(data.type).toLowerCase() : null;
}

export async function getCurrentAcademicYearId(): Promise<string | null> {
  const { data: years } = await supabase
    .from('academic_years')
    .select('id, is_current')
    .order('year', { ascending: false });
  if (!years?.length) return null;
  const cur = years.find((y: { is_current?: boolean }) => y.is_current);
  const row = cur || years[0];
  return row?.id != null ? String(row.id) : null;
}

/**
 * School teachers (not principal/director) use /teacher. Kindergarten and school principals use /facility.
 */
export async function computeFacilityPortal(params: {
  facilityId: string;
  staffUserId: string;
  authUserId: string;
  userType: string;
  recordId: string | null | undefined;
}): Promise<FacilityPortal> {
  const { facilityId, staffUserId, authUserId, userType, recordId } = params;
  const facilityType = await getFacilityTypeName(facilityId);
  const academicYearId = await getCurrentAcademicYearId();

  const { data: ua } = await supabase
    .from('user_access')
    .select('role, user_type, resource_type, resource_id')
    .or(`user_id.eq.${staffUserId},user_id.eq.${authUserId}`)
    .eq('resource_type', 'facility')
    .eq('resource_id', facilityId);

  const hasPrincipalRole = (ua || []).some(
    (r: { role?: string | null }) => String(r.role || '').toLowerCase() === 'principal'
  );
  const hasDirectorRole = (ua || []).some(
    (r: { role?: string | null }) => String(r.role || '').toLowerCase() === 'director'
  );
  const isFacilityAccountRow = (ua || []).some(
    (r: { user_type?: string | null }) => String(r.user_type || '').toLowerCase() === 'facility'
  );
  const utLower = String(userType || '').toLowerCase();
  const isMainFacilityAccount = utLower === 'facility' && recordId === facilityId;

  const isDirector = hasDirectorRole || isMainFacilityAccount;
  const isPrincipal =
    hasPrincipalRole || hasDirectorRole || isFacilityAccountRow || isMainFacilityAccount;

  const hasHeadRole = (ua || []).some((r: { role?: string | null }) =>
    ['head-teacher', 'co-head-teacher'].includes(String(r.role || '').toLowerCase())
  );
  const hasTeacherRole = (ua || []).some(
    (r: { role?: string | null }) => String(r.role || '').toLowerCase() === 'teacher'
  );
  const isTeacherUserType = (ua || []).some((r: { user_type?: string | null }) =>
    ['teacher', 'facility_staff'].includes(String(r.user_type || '').toLowerCase())
  );
  const hasHeadTeacherAccess = hasHeadRole;
  const hasTeacherAccess = hasTeacherRole || isTeacherUserType;

  let headsQuery = supabase
    .from('sch_class_teachers')
    .select('class, role')
    .eq('facility_id', facilityId)
    .eq('teacher_id', staffUserId);
  if (academicYearId) {
    headsQuery = headsQuery.eq('academic_year', academicYearId);
  }
  const { data: heads } = await headsQuery;

  const headClasses = new Set(
    (heads || [])
      .filter((r: { role?: string }) =>
        ['head-teacher', 'co-head-teacher'].includes(String(r.role || ''))
      )
      .map((r: { class: string }) => r.class)
  );
  const allTeacherClasses = new Set((heads || []).map((r: { class: string }) => r.class));

  const isHeadTeacher = headClasses.size > 0 || hasHeadTeacherAccess;
  const isRegularTeacher =
    !isPrincipal && !isHeadTeacher && (allTeacherClasses.size > 0 || hasTeacherAccess);

  if (
    facilityType === 'school' &&
    !isPrincipal &&
    !isDirector &&
    (isHeadTeacher || isRegularTeacher)
  ) {
    return 'teacher';
  }
  return 'facility';
}

export async function resolveFacilityBranchPath(
  staffUser: StaffUserForPortal,
  authUserId: string,
  userAccess: UserAccessRow[]
): Promise<'/facility' | '/teacher'> {
  const facilityId = resolveFacilityIdFromAccess(staffUser, userAccess);
  if (!facilityId) return '/facility';
  const portal = await computeFacilityPortal({
    facilityId,
    staffUserId: staffUser.id,
    authUserId,
    userType: staffUser.user_type,
    recordId: staffUser.record_id,
  });
  return portal === 'teacher' ? '/teacher' : '/facility';
}
