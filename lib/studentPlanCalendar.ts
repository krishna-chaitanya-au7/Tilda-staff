/**
 * Calendar grid logic aligned with bissfest_tool StudentPlan / WeekScheduleGrid.
 */

export type PlanPerspective = 'school' | 'class' | 'teacher' | 'child' | 'room';

export type PeriodRow = {
  id: string;
  period_start: string;
  period_end: string;
  is_break: boolean;
  applies_to_days: number[] | null;
  label?: string | null;
};

export type AssignmentRow = {
  base_subject_id: string;
  day_of_week: number;
  period_start: string;
  period_end: string;
  subject_name: string;
  subject_id: string;
  parent_subject_id: string | null;
  teacher_id: string | null;
  room: string | null;
  class: string;
};

export type FacilityEventItem = {
  id: string;
  sourceTable: 'facility_events' | 'facility_courses';
  title: string;
  description?: string | null;
  start_date: string;
  end_date: string;
  start_time?: string | null;
  end_time?: string | null;
  all_day?: boolean;
  location?: string | null;
  color?: string | null;
  category?: string | null;
  target_classes?: string[] | null;
  cancel_meal?: boolean;
  event_type?: 'event' | 'course' | null;
};

/** Row from `facility_course_schedule_days` (per-session calendar placement). */
export type FacilityCourseScheduleDayRow = {
  id: string;
  course_id: string;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
};

export function mapFacilityCourseRowToEventItem(row: any): FacilityEventItem | null {
  if (!row?.id) return null;
  return {
    id: String(row.id),
    sourceTable: 'facility_courses',
    title: String(row.title || ''),
    description: row.description ?? null,
    start_date: String(row.start_date),
    end_date: String(row.end_date),
    start_time: row.start_time ?? null,
    end_time: row.end_time ?? null,
    all_day: !!row.all_day,
    location: row.location ?? null,
    color: row.color ?? null,
    category: row.category ?? null,
    target_classes: row.target_classes,
    cancel_meal: row.cancel_meal,
    event_type: 'course',
  };
}

/** One calendar item per session day; id is stable for React keys (aligned with bissfest_tool). */
export function mapFacilityCourseSessionToEventItem(
  courseRow: any,
  sessionRow: FacilityCourseScheduleDayRow
): FacilityEventItem | null {
  if (!courseRow?.id || !sessionRow?.id || !sessionRow.session_date) return null;
  const courseId = String(courseRow.id);
  const sessionId = String(sessionRow.id);
  const date = String(sessionRow.session_date).slice(0, 10);
  return {
    id: `facility_courses:${courseId}:${sessionId}`,
    sourceTable: 'facility_courses',
    title: String(courseRow.title || ''),
    description: courseRow.description ?? null,
    start_date: date,
    end_date: date,
    start_time: sessionRow.start_time ?? null,
    end_time: sessionRow.end_time ?? null,
    all_day: false,
    location: courseRow.location ?? null,
    color: courseRow.color ?? null,
    category: courseRow.category ?? null,
    target_classes: courseRow.target_classes,
    cancel_meal: courseRow.cancel_meal,
    event_type: 'course',
  };
}

export function facilityCourseSessionEvents(
  sessions: FacilityCourseScheduleDayRow[],
  courseById: Map<string, any>
): FacilityEventItem[] {
  return sessions
    .map((s) => {
      const c = courseById.get(String(s.course_id));
      if (!c) return null;
      return mapFacilityCourseSessionToEventItem(c, s);
    })
    .filter((x): x is FacilityEventItem => x != null);
}

/** Courses with no `facility_course_schedule_days` rows: use parent date range on the calendar. */
export function facilityCourseLegacyEvents(
  courseRows: any[] | null,
  courseIdsWithAnySchedule: Set<string>
): FacilityEventItem[] {
  return (courseRows || [])
    .filter((row) => row?.id != null && !courseIdsWithAnySchedule.has(String(row.id)))
    .map((row) => mapFacilityCourseRowToEventItem(row))
    .filter((x): x is FacilityEventItem => x != null);
}

export const LEGACY_ACADEMIC_YEAR_ID = 1;

/** Supabase query helper for tables scoped by academic_year. */
export function withAcademicYear(q: any, academicYearId: string | null | undefined) {
  if (academicYearId != null && academicYearId !== '') {
    return q.eq('academic_year', Number(academicYearId));
  }
  return q.is('academic_year', null);
}

export function getMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function parseISODateLocal(iso: string) {
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10));
  const date = new Date();
  date.setFullYear(y, (m || 1) - 1, d || 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function formatLocalYYYYMMDD(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getMonthNameDe(date: Date) {
  return date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

export function computePeriodLabel(viewMode: 'week' | 'month', currentMonday: Date) {
  if (viewMode === 'month') return getMonthNameDe(currentMonday);
  const weekNo = Math.ceil(
    ((currentMonday.getTime() - new Date(currentMonday.getFullYear(), 0, 1).getTime()) / 86400000 +
      new Date(currentMonday.getFullYear(), 0, 1).getDay() +
      1) /
      7
  );
  return `KW ${weekNo} - ${getMonthNameDe(currentMonday)}`;
}

export function parseTimeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const hhmm = String(time).slice(0, 5);
  const [h, m] = hhmm.split(':').map((v) => Number(v));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function getFacilityEventsVisibleRange(weekOf: string, viewMode: 'week' | 'month') {
  const rangeStart =
    viewMode === 'month'
      ? new Date(
          getMonday(parseISODateLocal(weekOf)).getFullYear(),
          getMonday(parseISODateLocal(weekOf)).getMonth(),
          1
        )
      : getMonday(parseISODateLocal(weekOf));
  const rangeEnd =
    viewMode === 'month'
      ? new Date(
          getMonday(parseISODateLocal(weekOf)).getFullYear(),
          getMonday(parseISODateLocal(weekOf)).getMonth() + 1,
          0
        )
      : addDays(getMonday(parseISODateLocal(weekOf)), 6);
  return {
    start: formatLocalYYYYMMDD(rangeStart),
    end: formatLocalYYYYMMDD(rangeEnd),
  };
}

export function tailwindColorToHex(c: string | null | undefined): string {
  if (!c) return '#6B7280';
  const s = String(c).trim();
  if (s.startsWith('#') && s.length >= 7) return s.slice(0, 7);
  const compact = s.replace(/\s/g, '');
  const map: Record<string, string> = {
    'bg-blue-500': '#3b82f6',
    'bg-green-500': '#22c55e',
    'bg-violet-500': '#8b5cf6',
    'bg-violet-400/70': '#a78bfa',
    'bg-red-500': '#ef4444',
    'bg-sky-400': '#38bdf8',
    'bg-sky-400/70': '#7dd3fc',
    'bg-teal-500': '#14b8a6',
  };
  for (const [k, v] of Object.entries(map)) {
    if (compact.includes(k.replace('/', '')) || compact.includes(k)) return v;
  }
  return '#6B7280';
}

export function getEventVisuals(subjectName: string): { category: string; colorHex: string } {
  const n = subjectName.toLowerCase();
  if (n.includes('kurs') || n.includes('ag')) {
    return { category: 'Kurs/AG', colorHex: '#8b5cf6' };
  }
  if (n.includes('konferenz')) {
    return { category: 'room-booking', colorHex: '#3b82f6' };
  }
  if (n.includes('wandertag') || n.includes('fest') || n.includes('veranstaltung')) {
    return { category: 'Schulveranstaltung', colorHex: '#3b82f6' };
  }
  return { category: 'Unterricht', colorHex: '#22c55e' };
}

export function getFacilityEventVisuals(ev: FacilityEventItem): { category: string; colorHex: string } {
  if (ev.event_type === 'course') {
    return { category: 'Kurs / AG', colorHex: '#8b5cf6' };
  }
  const categoryLabelMap: Record<string, string> = {
    general: 'Allgemein',
    sport: 'Sport',
    trip: 'Ausflug',
    test: 'Test',
    other: 'Sonstiges',
  };
  const category = categoryLabelMap[ev.category || 'general'] || 'Allgemein';
  return { category, colorHex: '#3b82f6' };
}

export function buildGrouped(visibleRows: AssignmentRow[]) {
  const g: Record<string, AssignmentRow[]> = {};
  visibleRows.forEach((r) => {
    const key = `${r.day_of_week}-${r.period_start}`;
    g[key] = g[key] || [];
    g[key].push(r);
  });
  return g;
}

export function buildTimeSlots(periods: PeriodRow[]) {
  return Array.from(new Set(periods.map((p) => String(p.period_start).slice(0, 5)))).sort();
}

export function buildMergedDisplayByCell(
  visibleRows: AssignmentRow[],
  timeSlots: string[],
  periods: PeriodRow[],
  grouped: Record<string, AssignmentRow[]>
) {
  const slotIndexMap = new Map<string, number>();
  timeSlots.forEach((s, i) => slotIndexMap.set(s, i));

  const result: Record<string, Array<{ row: AssignmentRow; span: number }>> = {};

  for (const day of [1, 2, 3, 4, 5]) {
    const used = new Set<string>();
    const byDay = visibleRows
      .filter((r) => r.day_of_week === day)
      .sort(
        (a, b) =>
          (slotIndexMap.get(a.period_start) ?? 0) - (slotIndexMap.get(b.period_start) ?? 0)
      );

    for (const row of byDay) {
      const startIdx = slotIndexMap.get(row.period_start);
      if (startIdx == null) continue;

      const rowKey = `${row.subject_id}-${row.class}-${row.period_start}`;
      if (used.has(rowKey)) continue;

      let span = 1;
      let nextIdx = startIdx + 1;

      while (nextIdx < timeSlots.length) {
        const nextStart = timeSlots[nextIdx];
        const breakAtNext = periods.find(
          (pr) =>
            String(pr.period_start).slice(0, 5) === nextStart &&
            (pr.applies_to_days || []).includes(day) &&
            pr.is_break
        );
        if (breakAtNext) break;

        const nextRows = grouped[`${day}-${nextStart}`] || [];
        const match = nextRows.find(
          (nr) => nr.subject_id === row.subject_id && nr.class === row.class
        );
        if (!match) break;

        used.add(`${match.subject_id}-${match.class}-${match.period_start}`);
        span += 1;
        nextIdx += 1;
      }

      const cellKey = `${day}-${row.period_start}`;
      result[cellKey] = result[cellKey] || [];
      result[cellKey].push({ row, span });
    }
  }

  return result;
}

export type FacilityPlacement = {
  ev: FacilityEventItem;
  span: number;
  start: string;
  end: string;
  lane: number;
  laneCount: number;
};

export function buildFacilityDisplayByCell(
  facilityEvents: FacilityEventItem[],
  timeSlots: string[],
  periods: PeriodRow[],
  eventTargetClass: string,
  _perspective: PlanPerspective,
  _selectedEntityId: string,
  isLocked: boolean
) {
  const result: Record<string, FacilityPlacement[]> = {};
  if (timeSlots.length === 0) return result;

  const visibleFacilityEvents = (isLocked ? facilityEvents : []).filter((ev) => {
    if (!eventTargetClass) return true;
    const targets = ev.target_classes || [];
    if (!targets.length) return true;
    return targets.includes(eventTargetClass);
  });

  const placementsByDay: Record<
    number,
    Array<{
      startIdx: number;
      span: number;
      ev: FacilityEventItem;
      start: string;
      end: string;
    }>
  > = {};

  visibleFacilityEvents.forEach((ev) => {
    const startDate = parseISODateLocal(ev.start_date);
    const endDate = parseISODateLocal(ev.end_date);

    for (let d = new Date(startDate); d <= endDate; d = addDays(d, 1)) {
      const day = d.getDay() === 0 ? 7 : d.getDay();
      if (day < 1 || day > 5) continue;

      const dayPeriods: Array<{
        start: string;
        end: string;
        idx: number;
        startMin: number;
        endMin: number;
      }> = [];
      periods.forEach((p) => {
        if (p.is_break) return;
        if (!(p.applies_to_days || []).includes(day)) return;
        const start = String(p.period_start).slice(0, 5);
        const end = String(p.period_end).slice(0, 5);
        const idx = timeSlots.indexOf(start);
        const startMin = parseTimeToMinutes(start);
        const endMin = parseTimeToMinutes(end);
        if (idx < 0 || startMin == null || endMin == null) return;
        dayPeriods.push({ start, end, idx, startMin, endMin });
      });
      dayPeriods.sort((a, b) => a.idx - b.idx);

      // If this weekday has no periods configured at all, we can still place
      // the event on the first time-slot of the grid as a fallback (otherwise
      // schools without per-day period config silently drop every event).
      if (dayPeriods.length === 0) {
        if (timeSlots.length === 0) continue;
        placementsByDay[day] = placementsByDay[day] || [];
        placementsByDay[day].push({
          startIdx: 0,
          span: 1,
          ev,
          start: ev.all_day
            ? '—'
            : String(ev.start_time || timeSlots[0] || '').slice(0, 5),
          end: ev.all_day
            ? '—'
            : String(ev.end_time || ev.start_time || timeSlots[0] || '').slice(0, 5),
        });
        continue;
      }

      const visibleStart = dayPeriods[0].start;
      const visibleEnd = dayPeriods[dayPeriods.length - 1].end;
      const eventStartLabel = ev.all_day
        ? visibleStart
        : String(ev.start_time || visibleStart).slice(0, 5);
      const eventEndLabel = ev.all_day ? visibleEnd : String(ev.end_time || ev.start_time || visibleEnd).slice(0, 5);

      const eventStartMin = ev.all_day
        ? dayPeriods[0].startMin
        : parseTimeToMinutes(ev.start_time) ?? dayPeriods[0].startMin;
      let eventEndMin = ev.all_day
        ? dayPeriods[dayPeriods.length - 1].endMin
        : parseTimeToMinutes(ev.end_time) ??
          parseTimeToMinutes(ev.start_time) ??
          dayPeriods[0].endMin;
      if (eventEndMin <= eventStartMin) {
        eventEndMin = eventStartMin + 1;
      }

      const overlapping = dayPeriods.filter(
        (p) => p.endMin > eventStartMin && p.startMin < eventEndMin
      );

      let mergedStartIdx: number;
      let mergedSpan: number;

      if (overlapping.length > 0) {
        // Standard case: event overlaps one or more school periods.
        const mergedEndIdx = overlapping[overlapping.length - 1].idx;
        mergedStartIdx = overlapping[0].idx;
        mergedSpan = mergedEndIdx - mergedStartIdx + 1;
      } else {
        // Out-of-period case: e.g. an after-school Kurs at 14:00 when periods
        // end at 13:00. Don't drop the event — anchor it to the closest
        // period so it still renders in the day column. The card's visible
        // time label still shows the *real* start–end so the user reads the
        // correct time even if the block sits in a different period row.
        const lastPeriod = dayPeriods[dayPeriods.length - 1];
        const firstPeriod = dayPeriods[0];
        if (eventStartMin >= lastPeriod.endMin) {
          mergedStartIdx = lastPeriod.idx;
        } else if (eventEndMin <= firstPeriod.startMin) {
          mergedStartIdx = firstPeriod.idx;
        } else {
          // Falls in a gap between periods — pick the period whose start
          // time is closest to the event's start.
          let closest = firstPeriod;
          let closestDistance = Math.abs(firstPeriod.startMin - eventStartMin);
          for (const p of dayPeriods) {
            const distance = Math.abs(p.startMin - eventStartMin);
            if (distance < closestDistance) {
              closest = p;
              closestDistance = distance;
            }
          }
          mergedStartIdx = closest.idx;
        }
        mergedSpan = 1;
      }

      const mergedStartSlot = timeSlots[mergedStartIdx];
      if (mergedStartSlot) {
        placementsByDay[day] = placementsByDay[day] || [];
        placementsByDay[day].push({
          startIdx: mergedStartIdx,
          span: mergedSpan,
          ev,
          start: eventStartLabel,
          end: eventEndLabel,
        });
      }
    }
  });

  for (const dayKey of Object.keys(placementsByDay)) {
    const day = Number(dayKey);
    const placements = [...(placementsByDay[day] || [])].sort(
      (a, b) => a.startIdx - b.startIdx || b.span - a.span
    );
    const laneEndByIndex: number[] = [];
    const resolved = placements.map((p) => {
      const endExclusive = p.startIdx + p.span;
      let lane = laneEndByIndex.findIndex((laneEnd) => laneEnd <= p.startIdx);
      if (lane < 0) {
        lane = laneEndByIndex.length;
        laneEndByIndex.push(endExclusive);
      } else {
        laneEndByIndex[lane] = endExclusive;
      }
      return { ...p, lane };
    });
    const laneCount = Math.max(1, laneEndByIndex.length);
    resolved.forEach((p) => {
      const slot = timeSlots[p.startIdx];
      if (!slot) return;
      const key = `${day}-${slot}`;
      result[key] = result[key] || [];
      result[key].push({
        ev: p.ev,
        span: p.span,
        start: p.start,
        end: p.end,
        lane: p.lane,
        laneCount,
      });
    });
  }

  return result;
}

export function buildMergedClassesMap(
  allAttached: Array<{ id: string; base_schedule_id: string; subject_id: string; class: string }>,
  allBaseSlots: Array<{ id: string; day_of_week: number; period_start: string; class: string }>
) {
  const map = new Map<string, string[]>();
  allAttached.forEach((attached) => {
    const baseSlot = allBaseSlots.find((slot) => slot.id === attached.base_schedule_id);
    if (baseSlot) {
      const key = `${attached.subject_id}-${baseSlot.day_of_week}-${baseSlot.period_start}`;
      if (!map.has(key)) {
        const mergedAttached = allAttached.filter((aa) => {
          const aaSlot = allBaseSlots.find((s) => s.id === aa.base_schedule_id);
          return (
            aaSlot &&
            aa.subject_id === attached.subject_id &&
            aaSlot.day_of_week === baseSlot.day_of_week &&
            aaSlot.period_start === baseSlot.period_start
          );
        });
        const classes = Array.from(new Set(mergedAttached.map((ma) => ma.class))).filter(Boolean);
        if (classes.length > 0) {
          map.set(key, classes);
        }
      }
    }
  });
  return map;
}
