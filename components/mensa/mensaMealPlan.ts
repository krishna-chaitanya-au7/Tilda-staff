import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { supabase } from '@/lib/supabase';

export type RecipeLite = { id: string; title: string | null; allergies: unknown };

export type MenulineDay = {
  id: string;
  name: string;
  starter?: RecipeLite;
  mainCourse?: RecipeLite;
  dessert?: RecipeLite;
};

export type DayMenulines = { date: string; menulines: MenulineDay[] };

export type FilterType = 'current_week' | 'current_month' | 'date_range';

export const toYmd = (date: Date) => format(date, 'yyyy-MM-dd');

export function getFilteredDates(params: {
  filterType: FilterType;
  currentWeek: Date;
  currentMonth: Date;
  dateRange: { from: Date; to: Date } | null;
}): string[] {
  const { filterType, currentWeek, currentMonth, dateRange } = params;
  const today = new Date();

  switch (filterType) {
    case 'current_week': {
      const start = startOfWeek(currentWeek, { weekStartsOn: 1 });
      const end = endOfWeek(currentWeek, { weekStartsOn: 1 });
      const allDates = eachDayOfInterval({ start, end });
      return allDates
        .filter((date) => {
          const dayOfWeek = getDay(date);
          return dayOfWeek >= 1 && dayOfWeek <= 5;
        })
        .map((date) => toYmd(date));
    }
    case 'current_month': {
      const start = startOfMonth(currentMonth);
      const end = endOfMonth(currentMonth);
      const allDates = eachDayOfInterval({ start, end });
      const todayStr = toYmd(today);
      return allDates
        .filter((date) => {
          const dayOfWeek = getDay(date);
          const dateStr = toYmd(date);
          return (dayOfWeek >= 1 && dayOfWeek <= 5) || dateStr === todayStr;
        })
        .map((date) => toYmd(date));
    }
    case 'date_range': {
      if (!dateRange?.from || !dateRange?.to) return [];
      const dates: string[] = [];
      let currentDate = new Date(dateRange.from);
      const endDate = new Date(dateRange.to);
      while (currentDate <= endDate) {
        const dayOfWeek = currentDate.getDay();
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
          dates.push(toYmd(currentDate));
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
      return dates;
    }
    default:
      return [];
  }
}

/**
 * Same pipeline as MealPlanSection.fetchMealPlans.
 * selectedHeaderYearId = page header academic year (Speiseplan only).
 */
export async function fetchMealPlanData(params: {
  facilityId: string;
  selectedHeaderYearId: number | null;
  dates: string[];
  selectedMenulineId: string;
}): Promise<DayMenulines[]> {
  const { facilityId, selectedHeaderYearId, dates, selectedMenulineId } = params;
  if (dates.length === 0) return [];

  const yearEq = selectedHeaderYearId ?? 1;

  const { data: recipesData, error: recipesError } = await supabase
    .from('recipes')
    .select('id, title, allergies')
    .eq('is_deleted', false);
  if (recipesError) throw recipesError;

  const { data: facilityMenulines, error: facilityMenulinesError } = await supabase
    .from('facility_menuline')
    .select(
      `
      menuline_id,
      menu_lines ( id, name )
    `
    )
    .eq('facility_id', facilityId)
    .eq('is_deleted', false)
    .eq('academic_year', yearEq);
  if (facilityMenulinesError) throw facilityMenulinesError;

  if (!facilityMenulines?.length) {
    return dates.map((d) => ({ date: d, menulines: [] }));
  }

  const menulineIds = facilityMenulines.map((fm: { menuline_id: string }) => fm.menuline_id);
  const filteredMenulineIds =
    selectedMenulineId === 'all' ? menulineIds : menulineIds.filter((id) => id === selectedMenulineId);

  if (filteredMenulineIds.length === 0) {
    return dates.map((d) => ({ date: d, menulines: [] }));
  }

  let menulineDetailsQuery = supabase
    .from('menuline_details')
    .select('*')
    .in('menuline_id', filteredMenulineIds)
    .in('date', dates)
    .order('date', { ascending: true });

  if (selectedHeaderYearId !== null && selectedHeaderYearId !== undefined) {
    menulineDetailsQuery = menulineDetailsQuery.eq('academic_year', selectedHeaderYearId);
  }

  const { data: menulineDetailsData, error: detailsError } = await menulineDetailsQuery;
  if (detailsError) throw detailsError;

  const groupedByDate: Record<string, DayMenulines> = {};
  dates.forEach((date) => {
    groupedByDate[date] = { date, menulines: [] };
  });

  (menulineDetailsData || []).forEach((detail: Record<string, unknown>) => {
    const menulineInfo = (facilityMenulines as any[]).find(
      (fm: any) => fm.menuline_id === detail.menuline_id
    );
    const ml = menulineInfo?.menu_lines;
    const menulineName = (Array.isArray(ml) ? ml[0]?.name : ml?.name) || `Menu ${detail.menuline_id}`;
    const dStr = String(detail.date);

    if (groupedByDate[dStr]) {
      const recipes = recipesData || [];
      groupedByDate[dStr].menulines.push({
        id: String(detail.menuline_id),
        name: menulineName,
        starter: recipes.find((r) => r.id === detail.starter) as RecipeLite | undefined,
        mainCourse: recipes.find((r) => r.id === detail.main_course) as RecipeLite | undefined,
        dessert: recipes.find((r) => r.id === detail.dessert) as RecipeLite | undefined,
      });
    }
  });

  return dates.map((d) => groupedByDate[d]);
}

export async function fetchAvailableMenulines(
  facilityId: string,
  selectedHeaderYearId: number | null
): Promise<{ id: string; name: string }[]> {
  const yearEq = selectedHeaderYearId ?? 1;
  const { data: facilityMenulines, error } = await supabase
    .from('facility_menuline')
    .select(
      `
      menuline_id,
      menu_lines ( id, name )
    `
    )
    .eq('facility_id', facilityId)
    .eq('is_deleted', false)
    .eq('academic_year', yearEq);
  if (error) throw error;
  if (!facilityMenulines?.length) return [];
  return (facilityMenulines as any[]).map((fm: any) => {
    const ml = fm.menu_lines;
    const name = Array.isArray(ml) ? ml[0]?.name : ml?.name;
    return {
      id: String(fm.menuline_id),
      name: name || `Menu ${fm.menuline_id}`,
    };
  });
}

export { addMonths, subMonths, startOfWeek, endOfWeek, addDays };
