import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';

export type MensaAllergyDetail = {
  childName: string;
  allergicMeals: string[];
  allergyTypes: string[];
};

export type MensaMealStatsResult = {
  stats: {
    totalEaters: number;
    todayEaters: number;
    canceledMeals: number;
    allergicMeals: number;
  };
  canceledUserNames: string[];
  allergyDetails: MensaAllergyDetail[];
};

/**
 * Same logic as bissfest_tool StatsSection.fetchMealStats (today = local calendar day).
 * children_info is NOT filtered by academic year (matches web).
 */
export async function fetchMensaMealStats(params: {
  facilityId: string;
  facilityType?: 'school' | 'kindergarten' | null;
}): Promise<MensaMealStatsResult> {
  const { facilityId, facilityType: facilityTypeProp } = params;
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  let eligibilityMode: 'school' | 'kindergarten' = 'school';
  if (facilityTypeProp === 'kindergarten' || facilityTypeProp === 'school') {
    eligibilityMode = facilityTypeProp;
  } else {
    const { data: facRow } = await supabase
      .from('facilities')
      .select('type')
      .eq('id', facilityId)
      .eq('is_deleted', false)
      .maybeSingle();
    if (String(facRow?.type || '').toLowerCase() === 'kindergarten') eligibilityMode = 'kindergarten';
  }

  const { data: childrenInfo, error: childrenInfoError } = await supabase
    .from('children_info')
    .select('user_id, supervision_schedule')
    .eq('facility_id', facilityId);

  if (childrenInfoError) throw childrenInfoError;

  const eligibleUserIds = new Set<string>();
  (childrenInfo || []).forEach((row: { user_id?: string; supervision_schedule?: unknown }) => {
    if (!row.user_id) return;
    if (eligibilityMode === 'kindergarten') {
      eligibleUserIds.add(row.user_id);
      return;
    }
    const schedule: { supervision?: string }[] = Array.isArray(row.supervision_schedule)
      ? (row.supervision_schedule as { supervision?: string }[])
      : [];
    const isEligible = schedule.some((s) => {
      const sup = (s?.supervision || '').toString().toLowerCase();
      return sup === 'kurzgruppe' || sup === 'langgruppe';
    });
    if (isEligible) eligibleUserIds.add(row.user_id);
  });

  if (eligibleUserIds.size === 0) {
    return {
      stats: { totalEaters: 0, todayEaters: 0, canceledMeals: 0, allergicMeals: 0 },
      canceledUserNames: [],
      allergyDetails: [],
    };
  }

  const eligible = Array.from(eligibleUserIds);

  const { data: totalEatersData, error: totalError } = await supabase
    .from('meal_selections')
    .select('user_id')
    .eq('facility_id', facilityId)
    .eq('is_deleted', false)
    .in('user_id', eligible);
  if (totalError) throw totalError;
  const totalEaters = new Set((totalEatersData || []).map((item) => item.user_id)).size;

  const { data: todayEatersData, error: todayEatersError } = await supabase
    .from('meal_selections')
    .select('user_id')
    .eq('facility_id', facilityId)
    .eq('date', todayStr)
    .eq('is_deleted', false)
    .eq('is_skipped', false)
    .in('user_id', eligible);
  if (todayEatersError) throw todayEatersError;
  const todayEaters = new Set((todayEatersData || []).map((item) => item.user_id)).size;

  const { data: canceledData, error: canceledError } = await supabase
    .from('meal_selections')
    .select('user_id')
    .eq('facility_id', facilityId)
    .eq('date', todayStr)
    .eq('is_deleted', false)
    .eq('is_skipped', true)
    .in('user_id', eligible);
  if (canceledError) throw canceledError;
  const canceledMeals = canceledData?.length || 0;

  const canceledUserIds = [...new Set((canceledData || []).map((item) => item.user_id))];
  let canceledUsersData: { id: string; first_name: string | null; family_name: string | null }[] | null =
    [];
  if (canceledUserIds.length > 0) {
    const { data, error } = await supabase
      .from('users')
      .select('id, first_name, family_name')
      .in('id', canceledUserIds);
    if (error) throw error;
    canceledUsersData = data;
  }
  const canceledUserNames = (canceledUsersData || []).map((u) =>
    `${u.first_name ?? ''} ${u.family_name ?? ''}`.trim()
  );

  const { data: allergicData, error: allergicError } = await supabase
    .from('meal_selections')
    .select('id')
    .eq('facility_id', facilityId)
    .eq('date', todayStr)
    .eq('is_deleted', false)
    .eq('is_skipped', false)
    .or('main_meal_allergy.eq.true,dessert_allergy.eq.true,starter_allergy.eq.true')
    .in('user_id', eligible);
  if (allergicError) throw allergicError;
  const allergicMeals = allergicData?.length || 0;

  const { data: detailedAllergyData, error: detailedAllergyError } = await supabase
    .from('meal_selections')
    .select(
      `
      user_id,
      menuline_id,
      date,
      main_meal_allergy,
      dessert_allergy,
      starter_allergy
    `
    )
    .eq('facility_id', facilityId)
    .eq('date', todayStr)
    .eq('is_deleted', false)
    .eq('is_skipped', false)
    .or('main_meal_allergy.eq.true,dessert_allergy.eq.true,starter_allergy.eq.true')
    .in('user_id', eligible);
  if (detailedAllergyError) throw detailedAllergyError;

  const userIds = [...new Set((detailedAllergyData || []).map((item) => item.user_id))];
  const { data: usersData, error: usersError } = await supabase
    .from('users')
    .select('id, first_name, family_name')
    .in('id', userIds);
  if (usersError) throw usersError;

  const usersMap = new Map<string, { first_name: string | null; family_name: string | null }>();
  usersData?.forEach((user) => {
    usersMap.set(user.id, { first_name: user.first_name, family_name: user.family_name });
  });

  const { data: menulineDetailsData, error: menulineDetailsError } = await supabase
    .from('menuline_details')
    .select('menuline_id, date, main_course, starter, dessert')
    .eq('date', todayStr)
    .eq('is_deleted', false);
  if (menulineDetailsError) throw menulineDetailsError;

  const recipeIds = new Set<string>();
  menulineDetailsData?.forEach((detail) => {
    if (detail.main_course) recipeIds.add(detail.main_course);
    if (detail.starter) recipeIds.add(detail.starter);
    if (detail.dessert) recipeIds.add(detail.dessert);
  });

  const { data: recipesData, error: recipesError } = await supabase
    .from('recipes')
    .select('id, title')
    .in('id', Array.from(recipeIds))
    .eq('is_deleted', false);
  if (recipesError) throw recipesError;

  const recipesMap = new Map<string, string>();
  recipesData?.forEach((recipe) => recipesMap.set(recipe.id, recipe.title || ''));

  const allergyDetailsMap = new Map<string, MensaAllergyDetail>();

  detailedAllergyData?.forEach((selection) => {
    const userData = usersMap.get(selection.user_id);
    const childName = userData
      ? `${userData.first_name} ${userData.family_name}`.trim()
      : `User ${selection.user_id}`;

    const menulineDetail = menulineDetailsData?.find(
      (detail) => detail.menuline_id === selection.menuline_id && detail.date === selection.date
    );

    if (!allergyDetailsMap.has(childName)) {
      allergyDetailsMap.set(childName, { childName, allergicMeals: [], allergyTypes: [] });
    }

    const detail = allergyDetailsMap.get(childName)!;
    const meals: string[] = [];
    const types: string[] = [];

    if (selection.main_meal_allergy && menulineDetail?.main_course) {
      const recipeTitle = recipesMap.get(menulineDetail.main_course);
      if (recipeTitle) {
        meals.push(recipeTitle);
        types.push('Main Course');
      }
    }
    if (selection.starter_allergy && menulineDetail?.starter) {
      const recipeTitle = recipesMap.get(menulineDetail.starter);
      if (recipeTitle) {
        meals.push(recipeTitle);
        types.push('Starter');
      }
    }
    if (selection.dessert_allergy && menulineDetail?.dessert) {
      const recipeTitle = recipesMap.get(menulineDetail.dessert);
      if (recipeTitle) {
        meals.push(recipeTitle);
        types.push('Dessert');
      }
    }

    detail.allergicMeals.push(...meals);
    detail.allergyTypes.push(...types);
  });

  const allergyList = Array.from(allergyDetailsMap.values()).map((d) => {
    const seen = new Set<string>();
    const meals: string[] = [];
    const types: string[] = [];
    d.allergicMeals.forEach((meal, idx) => {
      const t = d.allergyTypes[idx] ?? '';
      const key = `${t}|${meal}`;
      if (!seen.has(key)) {
        seen.add(key);
        meals.push(meal);
        types.push(t);
      }
    });
    return { ...d, allergicMeals: meals, allergyTypes: types };
  });

  return {
    stats: { totalEaters, todayEaters, canceledMeals, allergicMeals },
    canceledUserNames,
    allergyDetails: allergyList,
  };
}
