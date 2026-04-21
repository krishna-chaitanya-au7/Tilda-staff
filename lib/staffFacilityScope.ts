import { supabase } from '@/lib/supabase';
import { getCurrentAcademicYearId, resolveFacilityIdFromAccess, type StaffUserForPortal, type UserAccessRow } from '@/lib/facilityPermissions';

export type SingleFacilityScope = {
  mode: 'single';
  facilityId: string;
  facilityIds: string[];
  academicYearId: string | null;
};

export type SupervisorFacilityScope = {
  mode: 'supervisor';
  supervisorId: string;
  facilityIds: string[];
  primaryFacilityId: string;
  academicYearId: string | null;
};

export async function loadSessionSingleFacilityScope(): Promise<SingleFacilityScope | null> {
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data: userRow, error } = await supabase
    .from('users')
    .select('id, user_type, record_id, auth_id')
    .eq('auth_id', authUser.id)
    .single();
  if (error || !userRow) return null;

  const { data: accessRows } = await supabase
    .from('user_access')
    .select('resource_type, resource_id, role, user_type')
    .or(`user_id.eq.${userRow.id},user_id.eq.${authUser.id}`);

  const facilityId = resolveFacilityIdFromAccess(userRow as StaffUserForPortal, (accessRows || []) as UserAccessRow[]);
  if (!facilityId) return null;

  const academicYearId = await getCurrentAcademicYearId();
  return {
    mode: 'single',
    facilityId,
    facilityIds: [facilityId],
    academicYearId,
  };
}

export async function loadSessionSupervisorScope(): Promise<SupervisorFacilityScope | null> {
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data: userRow, error } = await supabase
    .from('users')
    .select('id, record_id')
    .eq('auth_id', authUser.id)
    .single();
  if (error || !userRow) return null;

  const staffUserId = userRow.id;
  const supervisorId = String(userRow.record_id || userRow.id);

  const { data: coordinatorLinks } = await supabase
    .from('supervisor_coordinator_facilities')
    .select('facility_id')
    .eq('staff_user_id', staffUserId);
  const coordinatorIds =
    coordinatorLinks?.map((l: { facility_id: string }) => l.facility_id).filter(Boolean) || [];

  const { data: owned } = await supabase
    .from('facilities')
    .select('id')
    .eq('supervisor_id', supervisorId)
    .eq('is_deleted', false);
  const ownedIds = owned?.map((f) => f.id) || [];

  const facilityIds = Array.from(new Set([...coordinatorIds, ...ownedIds]));
  if (!facilityIds.length) return null;

  const academicYearId = await getCurrentAcademicYearId();
  return {
    mode: 'supervisor',
    supervisorId,
    facilityIds,
    primaryFacilityId: facilityIds[0],
    academicYearId,
  };
}
