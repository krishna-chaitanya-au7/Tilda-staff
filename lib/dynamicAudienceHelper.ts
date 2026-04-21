// Ported from bissfest_tool/app/facility/communication/utils/dynamicAudienceHelper.ts

export type DynamicAudienceType =
  | 'all_teachers'
  | 'parents_of_class'
  | 'children_of_class'
  | 'teachers_of_class';

export interface DynamicAudienceConfig {
  type: DynamicAudienceType;
  classCode?: string | null;
  facilityId: string;
  academicYearId?: string | null;
}

export interface DynamicAudienceUser {
  id: string;
  name: string | null;
  email: string | null;
  status: 'active' | 'pending';
}

export async function createDynamicAudienceGroup(
  supabase: any,
  config: DynamicAudienceConfig,
  options: {
    name?: string;
    description?: string;
    createdBy?: string | null;
  }
): Promise<{
  audienceId: string;
  userCount: number;
  users: DynamicAudienceUser[];
} | null> {
  try {
    const users = await fetchDynamicAudienceUsers(supabase, config);

    if (users.length === 0) {
      console.warn('No users found for dynamic audience (creating group anyway)', config);
    }

    const audienceName = options.name || generateAudienceName(config);
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const createdByUuid =
      typeof options.createdBy === 'string' && uuidRegex.test(options.createdBy) ? options.createdBy : null;

    const { data: inserted, error: insErr } = await supabase
      .from('audience_groups')
      .insert([
        {
          facility_id: config.facilityId,
          name: audienceName,
          kind: 'dynamic',
          filter: {
            description: options.description || `Dynamic audience: ${audienceName}`,
            dynamicConfig: {
              type: config.type,
              classCode: config.classCode,
              academicYearId: config.academicYearId,
            },
          },
          created_by: createdByUuid,
          academic_year: config.academicYearId != null ? Number(config.academicYearId) : null,
        },
      ])
      .select('id')
      .single();

    if (insErr || !inserted?.id) {
      console.error('Failed to create dynamic audience group:', insErr);
      return null;
    }

    return {
      audienceId: inserted.id as string,
      userCount: users.length,
      users,
    };
  } catch (error) {
    console.error('Error creating dynamic audience group:', error);
    return null;
  }
}

export async function fetchDynamicAudienceUsers(
  supabase: any,
  config: DynamicAudienceConfig
): Promise<DynamicAudienceUser[]> {
  const { type, classCode, facilityId, academicYearId } = config;

  if (type === 'all_teachers') {
    return await fetchAllTeachers(supabase, facilityId);
  }

  if (!classCode) {
    console.warn('Class code required for audience type:', type);
    return [];
  }

  switch (type) {
    case 'parents_of_class':
      return await fetchParentsOfClass(supabase, facilityId, classCode, academicYearId);
    case 'children_of_class':
      return await fetchChildrenOfClass(supabase, facilityId, classCode, academicYearId);
    case 'teachers_of_class':
      return await fetchTeachersOfClass(supabase, facilityId, classCode, academicYearId);
    default:
      console.warn('Unknown dynamic audience type:', type);
      return [];
  }
}

export async function resolveDynamicAudienceUsers(
  supabase: any,
  audienceId: string,
  facilityId: string,
  academicYearId?: string | null
): Promise<string[]> {
  try {
    const { data: audience } = await supabase
      .from('audience_groups')
      .select('filter')
      .eq('id', audienceId)
      .eq('facility_id', facilityId)
      .is('is_deleted', false)
      .single();

    if (!audience?.filter?.dynamicConfig) {
      console.warn('No dynamic config found for audience:', audienceId);
      return [];
    }

    const config: DynamicAudienceConfig = {
      type: audience.filter.dynamicConfig.type,
      classCode: audience.filter.dynamicConfig.classCode,
      facilityId,
      academicYearId: academicYearId || audience.filter.dynamicConfig.academicYearId,
    };

    const users = await fetchDynamicAudienceUsers(supabase, config);
    return users.map((user) => user.id);
  } catch (error) {
    console.error('Error resolving dynamic audience users:', error);
    return [];
  }
}

async function fetchAllTeachers(supabase: any, facilityId: string): Promise<DynamicAudienceUser[]> {
  const { data } = await supabase
    .from('user_access')
    .select('user_id, users:users!inner(id, name, email, status)')
    .eq('resource_type', 'facility')
    .eq('resource_id', facilityId)
    .in('user_type', ['teacher', 'facility_staff']);

  return (data || []).map((row: any) => ({
    id: row.user_id,
    name: row.users?.name,
    email: row.users?.email,
    status: 'active' as const,
  }));
}

async function fetchParentsOfClass(
  supabase: any,
  facilityId: string,
  classCode: string,
  academicYearId?: string | null
): Promise<DynamicAudienceUser[]> {
  let q = supabase
    .from('children_info')
    .select(
      'user_id, is_deleted, is_approved, class, academic_year, users:users!inner(id, status, is_deleted, manager_id, name, email)'
    )
    .eq('facility_id', facilityId)
    .eq('is_deleted', false)
    .eq('users.is_deleted', false)
    .eq('class', classCode);

  if (academicYearId) q = q.eq('academic_year', academicYearId);

  const { data } = await q;

  const qualifying = (data || []).filter((row: any) => {
    const approved = row.is_approved === true;
    const uStatus = row.users?.status;
    const invited = uStatus === 'invited' || uStatus === 'invited+pending';
    return approved || (invited && row.is_approved === false);
  });

  const parentIds = new Set<string>();
  const parentMap = new Map<string, { name: string | null; email: string | null }>();

  qualifying.forEach((r: any) => {
    const managerId = r.users?.manager_id;
    if (managerId) {
      parentIds.add(managerId);
      parentMap.set(managerId, {
        name: r.users?.name,
        email: r.users?.email,
      });
    }
  });

  return Array.from(parentIds).map((id) => {
    const parent = parentMap.get(id);
    return {
      id,
      name: parent?.name || null,
      email: parent?.email || null,
      status: 'pending' as const,
    };
  });
}

async function fetchChildrenOfClass(
  supabase: any,
  facilityId: string,
  classCode: string,
  academicYearId?: string | null
): Promise<DynamicAudienceUser[]> {
  let q = supabase
    .from('children_info')
    .select(
      'user_id, is_deleted, is_approved, class, academic_year, users:users!inner(id, status, is_deleted, name, email)'
    )
    .eq('facility_id', facilityId)
    .eq('is_deleted', false)
    .eq('users.is_deleted', false)
    .eq('class', classCode);

  if (academicYearId) q = q.eq('academic_year', academicYearId);

  const { data } = await q;

  const qualifying = (data || []).filter((row: any) => {
    const approved = row.is_approved === true;
    const uStatus = row.users?.status;
    const invited = uStatus === 'invited' || uStatus === 'invited+pending';
    return approved || (invited && row.is_approved === false);
  });

  return qualifying.map((r: any) => ({
    id: r.user_id,
    name: r.users?.name,
    email: r.users?.email,
    status: 'pending' as const,
  }));
}

async function fetchTeachersOfClass(
  supabase: any,
  facilityId: string,
  classCode: string,
  academicYearId?: string | null
): Promise<DynamicAudienceUser[]> {
  let teachersQuery = supabase.from('sch_class_teachers').select('teacher_id').eq('facility_id', facilityId).eq('class', classCode);

  if (academicYearId != null) {
    teachersQuery = teachersQuery.eq('academic_year', academicYearId);
  }

  const { data: classTeachers } = await teachersQuery;

  if (!classTeachers || classTeachers.length === 0) return [];

  const teacherIds = Array.from(new Set(classTeachers.map((ct: any) => ct.teacher_id).filter(Boolean)));

  const { data: teachers } = await supabase
    .from('users')
    .select('id, name, email')
    .in('id', teacherIds)
    .eq('is_deleted', false);

  return (teachers || []).map((t: any) => ({
    id: t.id,
    name: t.name,
    email: t.email,
    status: 'active' as const,
  }));
}

function generateAudienceName(config: DynamicAudienceConfig): string {
  const { type, classCode } = config;

  switch (type) {
    case 'all_teachers':
      return 'Alle Lehrkräfte';
    case 'parents_of_class':
      return `Eltern der ${classCode || ''}`.trim();
    case 'children_of_class':
      return `Schülerinnen der ${classCode || ''}`.trim();
    case 'teachers_of_class':
      return `Lehrkräfte der ${classCode || ''}`.trim();
    default:
      return `Dynamic Audience (${type})`;
  }
}

export function isDynamicAudience(audience: { kind: string; filter?: any }): boolean {
  return audience.kind === 'dynamic' && audience.filter?.dynamicConfig;
}

export function getDynamicAudienceConfig(audience: { filter?: any }): DynamicAudienceConfig | null {
  if (!audience.filter?.dynamicConfig) return null;
  return audience.filter.dynamicConfig as DynamicAudienceConfig;
}
