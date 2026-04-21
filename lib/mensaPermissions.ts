import { supabase } from '@/lib/supabase';

/**
 * Mirrors bissfest_tool useFacilityPermissions isDirector for eating-location settings.
 * Supervisors with access to the facility are treated as director (web supervisor branch).
 */
export async function canEditMensaSettings(params: {
  facilityId: string;
  staffUserId: string;
  authUserId: string;
  userType: string;
  recordId: string | null | undefined;
  /** When set, user is a supervisor viewing this facility */
  supervisorContext?: { supervisorId: string; facilityIds: string[] } | null;
}): Promise<boolean> {
  const { facilityId, staffUserId, authUserId, userType, recordId, supervisorContext } = params;

  if (supervisorContext?.supervisorId) {
    const ids = supervisorContext.facilityIds;
    if (ids.length > 0) {
      if (ids.some((id) => String(id) === String(facilityId))) return true;
    } else {
      const { data: fac } = await supabase
        .from('facilities')
        .select('supervisor_id')
        .eq('id', facilityId)
        .maybeSingle();
      if (fac?.supervisor_id === supervisorContext.supervisorId) return true;
    }
  }

  const { data: ua } = await supabase
    .from('user_access')
    .select('role, user_type, resource_type, resource_id')
    .or(`user_id.eq.${staffUserId},user_id.eq.${authUserId}`)
    .eq('resource_type', 'facility')
    .eq('resource_id', facilityId);

  const hasDirectorRole = (ua || []).some(
    (r: { role?: string | null }) => String(r.role || '').toLowerCase() === 'director'
  );
  const isMainFacilityAccount =
    String(userType || '').toLowerCase() === 'facility' && recordId === facilityId;

  return hasDirectorRole || isMainFacilityAccount;
}
