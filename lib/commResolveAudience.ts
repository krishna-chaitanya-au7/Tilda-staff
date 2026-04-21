/**
 * Resolve audience group IDs to child user IDs — aligned with CommunicationStepper (web).
 */
import { resolveDynamicAudienceUsers } from '@/lib/dynamicAudienceHelper';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function resolveAudienceChildIds(
  supabase: SupabaseClient,
  params: {
    facilityId: string;
    effectiveAcademicYear: number | null;
    audienceIds: string[];
    lockedAudienceId?: string | null;
  }
): Promise<string[]> {
  const { facilityId, effectiveAcademicYear, audienceIds, lockedAudienceId } = params;

  if (lockedAudienceId) {
    if (!facilityId || !effectiveAcademicYear) return [];
    const { data: audience } = await supabase
      .from('audience_groups')
      .select('filter')
      .eq('id', lockedAudienceId)
      .is('is_deleted', false)
      .single();

    const userIds = (audience?.filter as any)?.lockedAudienceUserIds || [];
    return userIds as string[];
  }

  if (!audienceIds.length || !facilityId || !effectiveAcademicYear) return [];
  const out = new Set<string>();
  const { data: groups } = await supabase
    .from('audience_groups')
    .select('id, kind, filter')
    .in('id', audienceIds)
    .is('is_deleted', false);

  const staticIds = (groups || []).filter((g: any) => g.kind === 'static').map((g: any) => g.id);
  if (staticIds.length) {
    const { data: mems } = await supabase
      .from('audience_members')
      .select('child_user_id')
      .in('audience_id', staticIds)
      .eq('academic_year', effectiveAcademicYear);
    (mems || []).forEach((m: any) => out.add(m.child_user_id));
  }

  const dynamics = (groups || []).filter((g: any) => g.kind === 'dynamic');
  for (const g of dynamics) {
    const dynamicConfig = g.filter?.dynamicConfig;
    if (!dynamicConfig) continue;

    try {
      const userIds = await resolveDynamicAudienceUsers(
        supabase as any,
        g.id,
        facilityId,
        String(effectiveAcademicYear)
      );
      userIds.forEach((id) => out.add(id));
    } catch (error) {
      console.error('Error resolving dynamic audience:', g.id, error);
      const f = (g.filter as any) || {};
      let q = supabase
        .from('children_info')
        .select(
          'user_id, class, is_active, is_bus_child, religion, custom_religion, supervision_schedule, kindergarten_schedule'
        )
        .eq('facility_id', facilityId)
        .eq('academic_year', effectiveAcademicYear)
        .eq('is_deleted', false);
      const classes: string[] = f.class_names?.length
        ? f.class_names
        : f.class_name
          ? [f.class_name]
          : [];
      if (classes.length) q = q.in('class', classes);
      if (f.only_active) q = q.eq('is_active', true);
      const busYes = f.include_bus_children !== false;
      const busNo = f.include_non_bus_children !== false;
      if (busYes && !busNo) q = q.eq('is_bus_child', true);
      else if (!busYes && busNo) q = q.eq('is_bus_child', false);
      else if (!busYes && !busNo) {
        continue;
      }

      if (f.religions && f.religions.length > 0) {
        if (f.religions.includes('andere')) {
          const otherReligions = f.religions.filter((r: string) => r !== 'andere');
          if (otherReligions.length > 0) {
            q = q.or(
              `religion.in.(${otherReligions.join(',')}),and(religion.eq.andere,custom_religion.not.is.null)`
            );
          } else {
            q = q.eq('religion', 'andere').not('custom_religion', 'is', null);
          }
        } else {
          q = q.in('religion', f.religions);
        }
      }

      const { data: kids } = await q;

      let filteredKids = kids || [];

      if (
        f.include_lunch ||
        f.include_no_lunch ||
        f.include_supervision ||
        f.include_no_supervision
      ) {
        const requireLunch = !!f.include_lunch && !f.include_no_lunch;
        const requireNoLunch = !!f.include_no_lunch && !f.include_lunch;
        const requireSup = !!f.include_supervision && !f.include_no_supervision;
        const requireNoSup = !!f.include_no_supervision && !f.include_supervision;
        filteredKids = filteredKids.filter((k: any) => {
          const schedule: any[] =
            Array.isArray(k.supervision_schedule) && k.supervision_schedule.length
              ? k.supervision_schedule
              : Array.isArray(k.kindergarten_schedule)
                ? k.kindergarten_schedule
                : [];

          const hasLunch = Array.isArray(schedule)
            ? schedule.some((d: any) => String(d?.lunch).toLowerCase() === 'essen')
            : false;
          const hasSupervision = Array.isArray(k.supervision_schedule)
            ? k.supervision_schedule.some(
                (d: any) => String(d?.supervision) === 'Langgruppe' || String(d?.supervision) === 'Kurzgruppe'
              )
            : false;

          if (requireLunch && !hasLunch) return false;
          if (requireNoLunch && hasLunch) return false;
          if (requireSup && !hasSupervision) return false;
          if (requireNoSup && hasSupervision) return false;

          return true;
        });
      }

      filteredKids.forEach((k: any) => out.add(k.user_id));
    }
  }
  return Array.from(out);
}
