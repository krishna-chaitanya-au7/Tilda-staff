import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptics } from '@/lib/haptics';
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { de } from 'date-fns/locale';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { loadClosingDayStrings } from '@/lib/calendarClosingDays';
import {
  type AssignmentRow,
  type FacilityEventItem,
  type PeriodRow,
  type PlanPerspective,
  addDays,
  buildFacilityDisplayByCell,
  buildGrouped,
  buildMergedClassesMap,
  buildMergedDisplayByCell,
  buildTimeSlots,
  computePeriodLabel,
  formatLocalYYYYMMDD,
  getEventVisuals,
  getFacilityEventVisuals,
  getFacilityEventsVisibleRange,
  getMonday,
  getMonthNameDe,
  parseISODateLocal,
  facilityCourseLegacyEvents,
  facilityCourseSessionEvents,
  withAcademicYear,
} from '@/lib/studentPlanCalendar';

const EMPTY_ASSIGNMENT_ROWS: AssignmentRow[] = [];
const EMPTY_BASE_SLOTS: Array<{
  id: string;
  day_of_week: number;
  period_start: string;
  period_end: string;
  class: string;
}> = [];

/** Same as StaffCalendarScreen week grid */
const ROW_H = 26;
const TIME_COL_W_DEFAULT = 64;
const DAY_MIN_W_DEFAULT = 72;

type BaseSubject = {
  id: string;
  base_schedule_id: string;
  subject_id: string;
  subject_name: string;
  parent_subject_id: string | null;
};

type Props = {
  facilityId: string;
  academicYearId: string;
  /** Current day from Anwesenheit; the week shown is the ISO week containing this date. */
  anchorDate: Date;
  /** Klassenfilter from Anwesenheit; leer = erste Klasse aus Einrichtung */
  classFilter: string;
  /** Woche: Montag der Zielwoche. Monat: angeklickter Tag. */
  onWeekNavigate: (date: Date) => void;
};

function ymd(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/**
 * Read-only Wochenkalender — gleiche Datenlogik wie der Kalender-Tab (Schule-Ansicht),
 * ohne Navigation zur Kalender-Route.
 */
export default function AttendanceEmbeddedWeekCalendar({
  facilityId,
  academicYearId,
  anchorDate,
  classFilter,
  onWeekNavigate,
}: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const weekOf = useMemo(() => formatLocalYYYYMMDD(getMonday(anchorDate)), [anchorDate]);
  const currentMonday = useMemo(() => getMonday(parseISODateLocal(weekOf)), [weekOf]);

  type PreviewData = {
    title: string;
    category: string;
    accentColor: string;
    dateLabel: string;
    timeLabel: string;
    classes: string;
    teacher?: string;
    room?: string;
    cancelMeal?: boolean;
  };
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);

  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [closingDayKeys, setClosingDayKeys] = useState<Set<string>>(new Set());

  const [classes, setClasses] = useState<string[]>([]);
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [allBaseSlotsData, setAllBaseSlotsData] = useState<
    Array<{ id: string; day_of_week: number; period_start: string; period_end: string; class: string }>
  >([]);
  const [allAttachedData, setAllAttachedData] = useState<
    Array<{ id: string; base_schedule_id: string; subject_id: string; class: string }>
  >([]);
  const [facilityEvents, setFacilityEvents] = useState<FacilityEventItem[]>([]);

  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => new Date());

  useEffect(() => {
    setMonthAnchor(startOfMonth(anchorDate));
    setSelectedDay(anchorDate);
  }, [anchorDate]);

  // Responsive grid sizing — shrink columns so the whole week fits the viewport on phones.
  const available = Math.max(0, width - 32);
  const defaultMinWidth = TIME_COL_W_DEFAULT + 5 * DAY_MIN_W_DEFAULT; // 424
  const fitsDefault = available >= defaultMinWidth;
  const TIME_COL_W = fitsDefault ? TIME_COL_W_DEFAULT : Math.max(40, Math.floor(available * 0.14));
  const DAY_MIN_W = fitsDefault
    ? DAY_MIN_W_DEFAULT
    : Math.max(36, Math.floor((available - TIME_COL_W) / 5));
  const gridMinWidth = TIME_COL_W + 5 * DAY_MIN_W;
  const cellSize = Math.min(72, Math.floor((width - 32) / 7));

  const selectedClassResolved = useMemo(() => {
    if (classFilter && classes.includes(classFilter)) return classFilter;
    return classes[0] ?? '';
  }, [classFilter, classes]);

  const classesToLoad = useMemo(() => {
    return selectedClassResolved ? [selectedClassResolved] : [];
  }, [selectedClassResolved]);

  useEffect(() => {
    (async () => {
      try {
        const { data, error: err } = await withAcademicYear(
          supabase
            .from('sch_facility_periods')
            .select('id, period_start, period_end, is_break, applies_to_days, label')
            .eq('facility_id', facilityId),
          academicYearId
        ).order('period_start', { ascending: true });
        if (err) throw err;
        setPeriods((data || []) as PeriodRow[]);
      } catch {
        setPeriods([]);
      }
    })();
  }, [facilityId, academicYearId]);

  useEffect(() => {
    (async () => {
      if (!facilityId || !academicYearId) return;
      try {
        const { data } = await withAcademicYear(
          supabase.from('sch_schedule_settings').select('is_locked').eq('facility_id', facilityId),
          academicYearId
        ).maybeSingle();
        setIsLocked(!!data?.is_locked);
      } catch {
        setIsLocked(false);
      }
    })();
  }, [facilityId, academicYearId]);

  useEffect(() => {
    (async () => {
      if (!facilityId || !academicYearId) return;
      try {
        const keys = await loadClosingDayStrings(facilityId, academicYearId);
        setClosingDayKeys(new Set(keys.map(String)));
      } catch {
        setClosingDayKeys(new Set());
      }
    })();
  }, [facilityId, academicYearId]);

  useEffect(() => {
    (async () => {
      if (!facilityId) return;
      try {
        const { data, error: err } = await supabase
          .from('facilities')
          .select('facility_settings')
          .eq('id', facilityId)
          .single();
        if (err) throw err;
        let settings: unknown = data?.facility_settings;
        if (typeof settings === 'string') {
          try {
            settings = JSON.parse(settings);
          } catch {
            settings = {};
          }
        }
        const s = settings as { classes?: string[] };
        if (Array.isArray(s?.classes)) {
          setClasses(s.classes);
        } else {
          setClasses([]);
        }
      } catch {
        setClasses([]);
      }
    })();
  }, [facilityId]);

  const loadAssignments = useCallback(async () => {
    if (!facilityId || !academicYearId || classesToLoad.length === 0) {
      setRows((p) => (p.length === 0 ? p : EMPTY_ASSIGNMENT_ROWS));
      setAllBaseSlotsData((p) => (p.length === 0 ? p : EMPTY_BASE_SLOTS));
      setAllAttachedData([]);
      setAssignmentsLoading(false);
      return;
    }
    setAssignmentsLoading(true);
    try {
      const baseSlotsQuery = withAcademicYear(
        supabase
          .from('sch_class_schedule_base')
          .select('id, day_of_week, period_start, period_end, class')
          .eq('facility_id', facilityId),
        academicYearId
      );
      const { data: baseSlots, error: baseErr } = await (classesToLoad.length === 1
        ? baseSlotsQuery.eq('class', classesToLoad[0])
        : baseSlotsQuery.in('class', classesToLoad));
      if (baseErr) throw baseErr;
      const baseIds = (baseSlots || []).map((b: { id: string }) => b.id);
      const baseIdToClass = new Map<string, string>();
      (baseSlots || []).forEach((b: { id: string; class?: string }) => {
        baseIdToClass.set(b.id, b.class || classesToLoad[0] || '');
      });

      let attached: BaseSubject[] = [];
      if (baseIds.length > 0) {
        const { data: baseSubs, error: bsErr } = await withAcademicYear(
          supabase
            .from('sch_class_schedule_base_subjects')
            .select('id, base_schedule_id, subject_id')
            .in('base_schedule_id', baseIds)
            .eq('facility_id', facilityId),
          academicYearId
        );
        if (bsErr) throw bsErr;
        const subjIds = Array.from(new Set((baseSubs || []).map((b: { subject_id: string }) => b.subject_id)));
        const { data: subs, error: sErr } = await supabase
          .from('sch_subjects')
          .select('id, name, parent_subject_id')
          .in('id', subjIds);
        if (sErr) throw sErr;
        const idToName = new Map((subs || []).map((s: { id: string; name: string }) => [s.id, s.name]));
        const idToParent = new Map(
          (subs || []).map((s: { id: string; parent_subject_id?: string | null }) => [
            s.id,
            (s.parent_subject_id as string) || null,
          ])
        );
        attached = (baseSubs || []).map((b: { id: string; base_schedule_id: string; subject_id: string }) => ({
          id: b.id,
          base_schedule_id: b.base_schedule_id,
          subject_id: b.subject_id,
          subject_name: idToName.get(b.subject_id) || b.subject_id,
          parent_subject_id: idToParent.get(b.subject_id) || null,
        }));
      }

      const { data: allBaseSlots, error: allBaseErr } = await withAcademicYear(
        supabase
          .from('sch_class_schedule_base')
          .select('id, day_of_week, period_start, period_end, class')
          .eq('facility_id', facilityId),
        academicYearId
      );
      if (allBaseErr) throw allBaseErr;

      setAllBaseSlotsData(
        (allBaseSlots || []).map(
          (b: { id: string; day_of_week: number; period_start: unknown; period_end: unknown; class?: string }) => ({
            id: b.id,
            day_of_week: b.day_of_week,
            period_start: String(b.period_start).slice(0, 5),
            period_end: String(b.period_end).slice(0, 5),
            class: b.class || '',
          })
        )
      );

      const allBaseIds = (allBaseSlots || []).map((b: { id: string }) => b.id);
      const allBaseIdToClass = new Map<string, string>();
      (allBaseSlots || []).forEach((b: { id: string; class?: string }) => {
        allBaseIdToClass.set(b.id, b.class || '');
      });

      let allAttached: Array<{ id: string; base_schedule_id: string; subject_id: string; class: string }> = [];
      if (allBaseIds.length > 0) {
        const { data: allBaseSubs, error: allBsErr } = await withAcademicYear(
          supabase
            .from('sch_class_schedule_base_subjects')
            .select('id, base_schedule_id, subject_id')
            .in('base_schedule_id', allBaseIds)
            .eq('facility_id', facilityId),
          academicYearId
        );
        if (allBsErr) throw allBsErr;
        allAttached = (allBaseSubs || []).map((b: { id: string; base_schedule_id: string; subject_id: string }) => ({
          id: b.id,
          base_schedule_id: b.base_schedule_id,
          subject_id: b.subject_id,
          class: allBaseIdToClass.get(b.base_schedule_id) || '',
        }));
      }
      setAllAttachedData(allAttached);

      const monday = getMonday(parseISODateLocal(weekOf));
      const weekDates = [0, 1, 2, 3, 4].map((i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return formatLocalYYYYMMDD(d);
      });

      const { data: assignsWeek, error: aErrWeek } = await withAcademicYear(
        supabase
          .from('sch_class_schedule_assignments')
          .select('base_subject_id, teacher_id, room, date, week_of')
          .eq('facility_id', facilityId)
          .eq('week_of', weekOf),
        academicYearId
      );
      if (aErrWeek) throw aErrWeek;

      const { data: assignsDate, error: aErrDate } = await withAcademicYear(
        supabase
          .from('sch_class_schedule_assignments')
          .select('base_subject_id, teacher_id, room, date, week_of')
          .eq('facility_id', facilityId)
          .in('date', weekDates),
        academicYearId
      );
      if (aErrDate) throw aErrDate;

      const dateAsnMap = new Map<string, unknown>();
      (assignsDate || []).forEach((a: { base_subject_id: string; date?: string }) => {
        if (a.date) {
          dateAsnMap.set(`${a.base_subject_id}-${a.date}`, a);
        }
      });

      const weekAsnMap = new Map<string, unknown>();
      (assignsWeek || []).forEach((a: { base_subject_id: string }) => {
        const hasDateSpecific = (assignsDate || []).some(
          (d: { base_subject_id: string; date?: string }) => d.base_subject_id === a.base_subject_id && d.date
        );
        if (!hasDateSpecific) {
          weekAsnMap.set(a.base_subject_id, a);
        }
      });

      const combined: AssignmentRow[] = [];
      (baseSlots || []).forEach((slot: { id: string; day_of_week: number; period_start: unknown; period_end: unknown }) => {
        const subsForSlot = attached.filter((a) => a.base_schedule_id === slot.id);
        subsForSlot.forEach((as) => {
          const slotDate = new Date(monday);
          slotDate.setDate(monday.getDate() + (slot.day_of_week - 1));
          const slotDateStr = formatLocalYYYYMMDD(slotDate);
          const dateKey = `${as.id}-${slotDateStr}`;
          const found =
            (dateAsnMap.get(dateKey) as { teacher_id?: string | null; room?: string | null } | undefined) ||
            (weekAsnMap.get(as.id) as { teacher_id?: string | null; room?: string | null } | undefined);
          combined.push({
            base_subject_id: as.id,
            day_of_week: slot.day_of_week,
            period_start: String(slot.period_start).slice(0, 5),
            period_end: String(slot.period_end).slice(0, 5),
            subject_name: as.subject_name,
            subject_id: as.subject_id,
            parent_subject_id: as.parent_subject_id || null,
            teacher_id: found?.teacher_id || null,
            room: found?.room || null,
            class: baseIdToClass.get(slot.id) || classesToLoad[0] || '',
          });
        });
      });
      combined.sort((a, b) =>
        a.day_of_week === b.day_of_week
          ? a.period_start.localeCompare(b.period_start)
          : a.day_of_week - b.day_of_week
      );
      setRows(combined);
    } catch {
      setRows(EMPTY_ASSIGNMENT_ROWS);
    } finally {
      setAssignmentsLoading(false);
    }
  }, [facilityId, academicYearId, weekOf, classesToLoad]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  const loadFacilityEvents = useCallback(async () => {
    if (!facilityId || !academicYearId) {
      setFacilityEvents([]);
      return;
    }
    try {
      const { start, end } =
        viewMode === 'month'
          ? {
              start: formatLocalYYYYMMDD(startOfMonth(monthAnchor)),
              end: formatLocalYYYYMMDD(endOfMonth(monthAnchor)),
            }
          : getFacilityEventsVisibleRange(weekOf, 'week');
      const rangeOr = `and(start_date.lte.${end},end_date.gte.${start})`;
      const yearNum = Number(academicYearId);

      const { data: eventRows, error: evErr } = await supabase
        .from('facility_events')
        .select(
          'id, title, description, start_date, end_date, start_time, end_time, all_day, location, color, category, target_classes, cancel_meal, event_type'
        )
        .eq('facility_id', facilityId)
        .eq('academic_year', yearNum)
        .or(rangeOr);
      if (evErr) throw evErr;

      const courseSelect =
        'id, title, description, start_date, end_date, start_time, end_time, all_day, location, color, category, target_classes, cancel_meal';

      const { data: sessionRowsRaw, error: sessionRangeErr } = await supabase
        .from('facility_course_schedule_days')
        .select('id, course_id, session_date, start_time, end_time')
        .eq('facility_id', facilityId)
        .eq('academic_year', yearNum)
        .gte('session_date', start)
        .lte('session_date', end);

      const { data: anySchedRows, error: anySchedErr } = await supabase
        .from('facility_course_schedule_days')
        .select('course_id')
        .eq('facility_id', facilityId)
        .eq('academic_year', yearNum);

      const scheduleTableOk = !sessionRangeErr && !anySchedErr;
      const courseIdsWithAnySchedule = new Set<string>();
      (anySchedRows || []).forEach((r: any) => {
        if (r?.course_id) courseIdsWithAnySchedule.add(String(r.course_id));
      });

      const events: FacilityEventItem[] = (eventRows || []).map((row: any) => ({
        id: String(row.id),
        sourceTable: 'facility_events' as const,
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
        event_type: row.event_type === 'course' ? 'course' : 'event',
      }));

      if (!scheduleTableOk) {
        const { data: courseRows, error: courseErr } = await supabase
          .from('facility_courses')
          .select(courseSelect)
          .eq('facility_id', facilityId)
          .eq('academic_year', yearNum)
          .or(rangeOr);
        if (courseErr) throw courseErr;
        const legacyCourses = (courseRows || []).map((row: any) => ({
          id: String(row.id),
          sourceTable: 'facility_courses' as const,
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
          event_type: 'course' as const,
        }));
        setFacilityEvents([...events, ...legacyCourses]);
        return;
      }

      const courseSessionInRange = (sessionRowsRaw || []) as Array<{
        id: string;
        course_id: string;
        session_date: string;
        start_time: string | null;
        end_time: string | null;
      }>;
      const sessionCourseIdList = [
        ...new Set(courseSessionInRange.map((s) => String(s.course_id || '')).filter(Boolean)),
      ];

      const courseById = new Map<string, any>();
      if (sessionCourseIdList.length) {
        const { data: courseMetaRows, error: metaErr } = await supabase
          .from('facility_courses')
          .select(courseSelect)
          .in('id', sessionCourseIdList);
        if (metaErr) throw metaErr;
        (courseMetaRows || []).forEach((row: any) => {
          if (row?.id != null) courseById.set(String(row.id), row);
        });
      }

      const fromSessions = facilityCourseSessionEvents(courseSessionInRange, courseById);

      const { data: courseRows, error: courseErr } = await supabase
        .from('facility_courses')
        .select(courseSelect)
        .eq('facility_id', facilityId)
        .eq('academic_year', yearNum)
        .or(rangeOr);
      if (courseErr) throw courseErr;

      const fromLegacy = facilityCourseLegacyEvents(courseRows, courseIdsWithAnySchedule);
      setFacilityEvents([...events, ...fromSessions, ...fromLegacy]);
    } catch {
      setFacilityEvents([]);
    }
  }, [facilityId, academicYearId, weekOf, viewMode, monthAnchor]);

  useEffect(() => {
    loadFacilityEvents();
  }, [loadFacilityEvents]);

  const visibleRows = rows;

  const calendarDays = useMemo(() => {
    const ms = startOfMonth(monthAnchor);
    const me = endOfMonth(monthAnchor);
    const start = startOfWeek(ms, { weekStartsOn: 1 });
    const end = endOfWeek(me, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [monthAnchor]);

  type MonthStripSource =
    | { type: 'facility'; ev: FacilityEventItem }
    | { type: 'lesson'; row: AssignmentRow };
  type MonthStripEntry =
    | { kind: 'closing' }
    | { kind: 'strip'; label: string; bg: string; source: MonthStripSource };

  const monthCellStripByKey = useMemo(() => {
    const map: Record<string, MonthStripEntry> = {};
    const ymdInEventRange = (k: string, ev: FacilityEventItem) => {
      const s = String(ev.start_date).slice(0, 10);
      const e = String(ev.end_date).slice(0, 10);
      return k >= s && k <= e;
    };
    calendarDays.forEach((d) => {
      const k = formatLocalYYYYMMDD(d);
      if (closingDayKeys.has(k)) {
        map[k] = { kind: 'closing' };
        return;
      }
      const dayEvents = facilityEvents.filter((ev) => ymdInEventRange(k, ev));
      if (dayEvents.length > 0) {
        const ev = [...dayEvents].sort((a, b) => String(a.title).localeCompare(String(b.title)))[0];
        const v = getFacilityEventVisuals(ev);
        map[k] = {
          kind: 'strip',
          label: String(ev.title || '').trim() || v.category,
          bg: v.colorHex,
          source: { type: 'facility', ev },
        };
        return;
      }
      const dow = d.getDay() === 0 ? 7 : d.getDay();
      const dayRows = visibleRows
        .filter((r) => r.day_of_week === dow)
        .sort((a, b) => a.period_start.localeCompare(b.period_start));
      if (dayRows.length > 0) {
        const first = dayRows[0];
        const v = getEventVisuals(first.subject_name);
        const more = dayRows.length - 1;
        const base = first.subject_name;
        const label = more > 0 ? `${base} (+${more})` : base;
        map[k] = {
          kind: 'strip',
          label,
          bg: v.colorHex,
          source: { type: 'lesson', row: first },
        };
      }
    });
    return map;
  }, [calendarDays, closingDayKeys, facilityEvents, visibleRows]);

  const grouped = useMemo(() => buildGrouped(visibleRows), [visibleRows]);
  const timeSlots = useMemo(() => buildTimeSlots(periods), [periods]);
  const mergedDisplayByCell = useMemo(
    () => buildMergedDisplayByCell(visibleRows, timeSlots, periods, grouped),
    [visibleRows, timeSlots, periods, grouped]
  );
  const mergedClassesMap = useMemo(
    () => buildMergedClassesMap(allAttachedData, allBaseSlotsData),
    [allAttachedData, allBaseSlotsData]
  );
  const facilityDisplayByCell = useMemo(
    () =>
      buildFacilityDisplayByCell(
        facilityEvents,
        timeSlots,
        periods,
        '',
        'school' as PlanPerspective,
        '',
        // Always render facility events regardless of lock state — matches the
        // staff calendar fix.
        true
      ),
    [facilityEvents, timeSlots, periods]
  );

  const periodLabel = useMemo(() => computePeriodLabel('week', currentMonday), [currentMonday]);

  const dayDates = useMemo(() => {
    const monday = getMonday(parseISODateLocal(weekOf));
    return [0, 1, 2, 3, 4].map((i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return format(d, 'EEE dd.MM', { locale: de });
    });
  }, [weekOf]);

  const weekDateKeys = useMemo(() => {
    const monday = getMonday(parseISODateLocal(weekOf));
    return [0, 1, 2, 3, 4].map((offset) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + offset);
      return formatLocalYYYYMMDD(date);
    });
  }, [weekOf]);

  const todayDayIndex = useMemo(() => {
    const today = new Date();
    const monday = getMonday(parseISODateLocal(weekOf));
    const sunday = addDays(monday, 6);
    if (today < monday || today > sunday) return null;
    const jsDay = today.getDay();
    return jsDay === 0 ? 7 : jsDay;
  }, [weekOf]);

  const isBreak = (dayIndex: number, start: string) => {
    const p = periods.find(
      (pr) =>
        String(pr.period_start).slice(0, 5) === start && (pr.applies_to_days || []).includes(dayIndex)
    );
    return !!p?.is_break;
  };

  const getRowEndByStart = (start: string): string => {
    const p = periods.find((pr) => String(pr.period_start).slice(0, 5) === start);
    return p ? String(p.period_end).slice(0, 5) : '';
  };

  const showLessonPreview = (r: AssignmentRow, dayIndex: number) => {
    haptics.tap();
    const monday = getMonday(parseISODateLocal(weekOf));
    const d = new Date(monday);
    d.setDate(monday.getDate() + (dayIndex - 1));
    const dateLabel = format(d, 'dd.MM.yyyy', { locale: de });
    const mergedKey = `${r.subject_id}-${r.day_of_week}-${r.period_start}`;
    const mergedClasses = mergedClassesMap.get(mergedKey) || [];
    const clsLabel = mergedClasses.length > 0 ? mergedClasses.join(', ') : r.class;
    const v = getEventVisuals(r.subject_name);
    setPreviewData({
      title: r.subject_name,
      category: v.category,
      accentColor: v.colorHex,
      dateLabel,
      timeLabel: `${r.period_start}–${r.period_end}`,
      classes: clsLabel,
    });
  };

  const showFacilityPreview = (ev: FacilityEventItem, start: string, end: string, dayIndex: number) => {
    haptics.tap();
    const monday = getMonday(parseISODateLocal(weekOf));
    const d = new Date(monday);
    d.setDate(monday.getDate() + (dayIndex - 1));
    const dateLabel = format(d, 'dd.MM.yyyy', { locale: de });
    const v = getFacilityEventVisuals(ev);
    const classesLabel =
      (ev.target_classes || []).length > 0 ? (ev.target_classes || []).join(', ') : 'Alle Klassen';
    setPreviewData({
      title: ev.title,
      category: v.category,
      accentColor: v.colorHex,
      dateLabel,
      timeLabel: `${start}–${end}`,
      classes: classesLabel,
      cancelMeal: ev.cancel_meal,
    });
  };

  const showFacilityPreviewForDate = (ev: FacilityEventItem, day: Date) => {
    haptics.tap();
    const dateLabel = format(day, 'dd.MM.yyyy', { locale: de });
    const v = getFacilityEventVisuals(ev);
    const classesLabel =
      (ev.target_classes || []).length > 0 ? (ev.target_classes || []).join(', ') : 'Alle Klassen';
    const startStr = String(ev.start_time || '').slice(0, 5);
    const endStr = String(ev.end_time || '').slice(0, 5);
    setPreviewData({
      title: ev.title,
      category: v.category,
      accentColor: v.colorHex,
      dateLabel,
      timeLabel: ev.all_day || !startStr ? 'Ganztägig' : `${startStr}–${endStr}`,
      classes: classesLabel,
      cancelMeal: ev.cancel_meal,
    });
  };

  const showLessonPreviewForDate = (r: AssignmentRow, day: Date) => {
    haptics.tap();
    const dateLabel = format(day, 'dd.MM.yyyy', { locale: de });
    const v = getEventVisuals(r.subject_name);
    const mergedKey = `${r.subject_id}-${r.day_of_week}-${r.period_start}`;
    const mergedClasses = mergedClassesMap.get(mergedKey) || [];
    const clsLabel = mergedClasses.length > 0 ? mergedClasses.join(', ') : r.class;
    setPreviewData({
      title: r.subject_name,
      category: v.category,
      accentColor: v.colorHex,
      dateLabel,
      timeLabel: `${r.period_start}–${r.period_end}`,
      classes: clsLabel,
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAssignments();
    await loadFacilityEvents();
    setRefreshing(false);
  };

  return (
    <View style={styles.root}>
      <View style={styles.modeSwitcherRow}>
        <View style={styles.modeSegment}>
          <TouchableOpacity
            onPress={() => setViewMode('week')}
            style={[styles.segBtn, viewMode === 'week' && styles.segBtnOn]}
          >
            <Text style={[styles.segText, viewMode === 'week' && styles.segTextOn]}>Woche</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setViewMode('month')}
            style={[styles.segBtn, viewMode === 'month' && styles.segBtnOn]}
          >
            <Text style={[styles.segText, viewMode === 'month' && styles.segTextOn]}>Monat</Text>
          </TouchableOpacity>
        </View>
      </View>

      {viewMode === 'week' ? (
        <View style={styles.weekNav}>
          <TouchableOpacity
            style={styles.navIconBtn}
            onPress={() => onWeekNavigate(addDays(currentMonday, -7))}
            accessibilityLabel="Vorherige Woche"
          >
            <Ionicons name="chevron-back" size={22} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.periodLabel} numberOfLines={2}>
            {periodLabel}
          </Text>
          <TouchableOpacity
            style={styles.navIconBtn}
            onPress={() => onWeekNavigate(addDays(currentMonday, 7))}
            accessibilityLabel="Nächste Woche"
          >
            <Ionicons name="chevron-forward" size={22} color="#111827" />
          </TouchableOpacity>
        </View>
      ) : null}

      {selectedClassResolved ? (
        <Text style={styles.classHint} numberOfLines={1}>
          Stundenplan: {selectedClassResolved}
        </Text>
      ) : (
        <Text style={styles.warn}>Keine Klassen in den Einrichtungseinstellungen.</Text>
      )}

      {assignmentsLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : null}

      <ScrollView
        nestedScrollEnabled
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.scrollContent}
      >
        {viewMode === 'week' ? (
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
          <View style={{ minWidth: Math.max(gridMinWidth, width - 32) }}>
            <View style={styles.gridHeaderRow}>
              <View style={[styles.hdrStunde, { width: TIME_COL_W }]}>
                <Text style={styles.hdrText} numberOfLines={1}>
                  Stunde
                </Text>
              </View>
              {[1, 2, 3, 4, 5].map((di, idx) => (
                <View
                  key={di}
                  style={[
                    styles.hdrDay,
                    { flex: 1, minWidth: DAY_MIN_W },
                    todayDayIndex === di && styles.hdrDayToday,
                  ]}
                >
                  <Text style={styles.hdrDayText}>{dayDates[idx]}</Text>
                </View>
              ))}
            </View>

            {timeSlots.length === 0 ? (
              (() => {
                const fallbackEventsByDay = [1, 2, 3, 4, 5].map((_, idx) => {
                  const dateKey = weekDateKeys[idx];
                  return dateKey
                    ? facilityEvents.filter((ev) => {
                        const s = String(ev.start_date).slice(0, 10);
                        const e = String(ev.end_date).slice(0, 10);
                        return dateKey >= s && dateKey <= e;
                      })
                    : [];
                });
                const closingByDay = [1, 2, 3, 4, 5].map((_, idx) => {
                  const dateKey = weekDateKeys[idx];
                  return dateKey ? closingDayKeys.has(dateKey) : false;
                });
                const totalFallbackEvents = fallbackEventsByDay.reduce(
                  (sum, list) => sum + list.length,
                  0
                );
                const totalClosingDays = closingByDay.filter(Boolean).length;
                if (totalFallbackEvents === 0 && totalClosingDays === 0) {
                  return <Text style={styles.emptyGrid}>Keine Stunden im Stundenplan hinterlegt.</Text>;
                }
                return (
                  <View style={styles.gridRow}>
                    <View style={[styles.timeCell, { width: TIME_COL_W }]} />
                    {[1, 2, 3, 4, 5].map((di, idx) => {
                      const dateKey = weekDateKeys[idx];
                      const dayEvents = fallbackEventsByDay[idx];
                      const isClosingDay = closingByDay[idx];
                      return (
                        <View
                          key={`fallback-${di}`}
                          style={[
                            styles.cell,
                            {
                              flex: 1,
                              minWidth: DAY_MIN_W,
                              minHeight: ROW_H * 2,
                              paddingVertical: 6,
                            },
                            todayDayIndex === di && styles.cellTodayBg,
                          ]}
                        >
                          {isClosingDay ? (
                            <TouchableOpacity
                              activeOpacity={0.85}
                              onPress={() => {
                                const dayDate = parseISODateLocal(dateKey || '');
                                haptics.tap();
                                setPreviewData({
                                  title: 'Schließtag',
                                  category: 'Schließtag',
                                  accentColor: '#dc2626',
                                  dateLabel: format(dayDate, 'dd.MM.yyyy', { locale: de }),
                                  timeLabel: 'Ganztägig',
                                  classes: 'Alle Klassen',
                                });
                              }}
                              style={{
                                backgroundColor: '#dc2626',
                                borderRadius: 6,
                                paddingHorizontal: 6,
                                paddingVertical: 4,
                                marginBottom: 4,
                              }}
                            >
                              <Text style={styles.eventTitle} numberOfLines={1}>
                                Schließtag
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                          {dayEvents.map((ev) => {
                            const v = getFacilityEventVisuals(ev);
                            const startStr = String(ev.start_time || '').slice(0, 5);
                            const endStr = String(ev.end_time || '').slice(0, 5);
                            return (
                              <TouchableOpacity
                                key={`fallback-ev-${ev.id}-${di}`}
                                activeOpacity={0.85}
                                onPress={() => {
                                  const dayDate = parseISODateLocal(dateKey || '');
                                  showFacilityPreviewForDate(ev, dayDate);
                                }}
                                style={{
                                  backgroundColor: v.colorHex || '#3b82f6',
                                  borderRadius: 6,
                                  paddingHorizontal: 6,
                                  paddingVertical: 4,
                                  marginBottom: 4,
                                }}
                              >
                                <Text style={styles.eventTitle} numberOfLines={2}>
                                  {ev.title}
                                </Text>
                                {!ev.all_day && startStr ? (
                                  <Text style={styles.eventSub} numberOfLines={1}>
                                    {startStr}
                                    {endStr ? ` – ${endStr}` : ''}
                                  </Text>
                                ) : null}
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      );
                    })}
                  </View>
                );
              })()
            ) : (
              timeSlots.map((start) => {
                const allBreak = [1, 2, 3, 4, 5].every((di) => isBreak(di, start));
                if (allBreak) {
                  return (
                    <View key={start} style={styles.gridRow}>
                      <View style={[styles.timeCell, styles.pauseCell, { width: TIME_COL_W }]}>
                        <Text style={styles.pauseLabel}>Pause</Text>
                      </View>
                      <View style={styles.pauseSpan}>
                        {[1, 2, 3, 4, 5].map((di, idx) => (
                          <View
                            key={di}
                            style={[
                              styles.pauseDay,
                              { flex: 1, minWidth: DAY_MIN_W },
                              todayDayIndex === di && styles.cellTodayBg,
                              closingDayKeys.has(weekDateKeys[idx]) && styles.cellClosing,
                            ]}
                          />
                        ))}
                      </View>
                    </View>
                  );
                }
                return (
                  <View key={start} style={styles.gridRow}>
                    <View style={[styles.timeCell, { width: TIME_COL_W }]}>
                      <Text style={styles.timeCellText}>
                        {start}
                        {getRowEndByStart(start) ? ` – ${getRowEndByStart(start)}` : ''}
                      </Text>
                    </View>
                    {[1, 2, 3, 4, 5].map((di, idx) => {
                      const breakCell = isBreak(di, start);
                      const displayRows = mergedDisplayByCell[`${di}-${start}`] || [];
                      const facRows = facilityDisplayByCell[`${di}-${start}`] || [];
                      const isClosingDay = closingDayKeys.has(weekDateKeys[idx]);
                      return (
                        <View
                          key={`${di}-${start}`}
                          style={[
                            styles.cell,
                            { flex: 1, minWidth: DAY_MIN_W, minHeight: ROW_H },
                            breakCell && styles.cellBreak,
                            !breakCell && todayDayIndex === di && styles.cellTodayBg,
                            isClosingDay && styles.cellClosing,
                          ]}
                        >
                          {breakCell ? null : (
                            <>
                              {facRows.map((fr) => {
                                const v = getFacilityEventVisuals(fr.ev);
                                const wPct = 100 / Math.max(1, fr.laneCount);
                                const leftPct = fr.lane * wPct;
                                return (
                                  <TouchableOpacity
                                    key={`fe-${fr.ev.sourceTable}-${fr.ev.id}-${di}-${start}`}
                                    activeOpacity={0.85}
                                    onPress={() => showFacilityPreview(fr.ev, fr.start, fr.end, di)}
                                    style={[
                                      styles.eventAbs,
                                      {
                                        backgroundColor: v.colorHex || '#3b82f6',
                                        left: `${leftPct}%`,
                                        width: `${wPct}%`,
                                        height: Math.max(ROW_H * fr.span - 6, ROW_H - 4),
                                      },
                                    ]}
                                  >
                                    <Text style={styles.eventTitle} numberOfLines={fr.span > 1 ? 3 : 2}>
                                      {fr.ev.title}
                                    </Text>
                                    {!fr.ev.all_day ? (
                                      <Text style={styles.eventSub} numberOfLines={1}>
                                        {fr.start} – {fr.end}
                                      </Text>
                                    ) : null}
                                  </TouchableOpacity>
                                );
                              })}
                              {displayRows.map(({ row: r, span }) => {
                                const v = getEventVisuals(r.subject_name);
                                const mergedKey = `${r.subject_id}-${r.day_of_week}-${r.period_start}`;
                                const mergedClasses = mergedClassesMap.get(mergedKey) || [];
                                const isMerged = mergedClasses.length > 1;
                                return (
                                  <TouchableOpacity
                                    key={r.base_subject_id}
                                    activeOpacity={0.85}
                                    onPress={() => showLessonPreview(r, di)}
                                    style={[
                                      span > 1 ? styles.lessonAbs : styles.lessonInline,
                                      {
                                        backgroundColor: v.colorHex || '#22c55e',
                                        minHeight: span > 1 ? ROW_H * span - 4 : undefined,
                                      },
                                    ]}
                                  >
                                    <Text style={styles.lessonTitle} numberOfLines={2}>
                                      {r.subject_name}
                                      {isMerged ? ` (${mergedClasses.join(', ')})` : ''}
                                    </Text>
                                    <Text style={styles.lessonSub} numberOfLines={1}>
                                      {r.period_start} – {r.period_end}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </>
                          )}
                        </View>
                      );
                    })}
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
        ) : (
        <View style={styles.monthWrap}>
          <View style={styles.monthNavRow}>
            <TouchableOpacity
              onPress={() => setMonthAnchor((d) => startOfMonth(new Date(d.getFullYear(), d.getMonth() - 1, 1)))}
            >
              <Text style={styles.monthNavBtn}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMonthAnchor(startOfMonth(new Date()))}>
              <Text style={styles.todayLink}>Heute</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setMonthAnchor((d) => startOfMonth(new Date(d.getFullYear(), d.getMonth() + 1, 1)))}
            >
              <Text style={styles.monthNavBtn}>›</Text>
            </TouchableOpacity>
            <Text style={styles.monthTitle} numberOfLines={1}>
              {getMonthNameDe(monthAnchor)}
            </Text>
          </View>
          <View style={styles.weekHdrRow}>
            {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => (
              <Text key={w} style={[styles.weekHdr, { width: cellSize }]}>
                {w}
              </Text>
            ))}
          </View>
          <View style={styles.monthGrid}>
            {calendarDays.map((d) => {
              const k = ymd(d);
              const inMonth = isSameMonth(d, monthAnchor);
              const sel = ymd(d) === ymd(selectedDay);
              const strip = monthCellStripByKey[k];
              const isClosingCell = strip?.kind === 'closing';
              return (
                <TouchableOpacity
                  key={k}
                  style={[
                    styles.cellMonth,
                    { width: cellSize, minHeight: Math.max(cellSize + 16, 56) },
                    !inMonth && styles.cellMuted,
                    sel && styles.cellSel,
                    isClosingCell && styles.cellMonthClosing,
                  ]}
                  onPress={() => {
                    setSelectedDay(d);
                    if (strip?.kind === 'strip') {
                      if (strip.source.type === 'facility') {
                        showFacilityPreviewForDate(strip.source.ev, d);
                      } else {
                        showLessonPreviewForDate(strip.source.row, d);
                      }
                    } else if (strip?.kind === 'closing') {
                      haptics.tap();
                      setPreviewData({
                        title: 'Schließtag',
                        category: 'Schließtag',
                        accentColor: '#dc2626',
                        dateLabel: format(d, 'dd.MM.yyyy', { locale: de }),
                        timeLabel: 'Ganztägig',
                        classes: 'Alle Klassen',
                      });
                    } else {
                      onWeekNavigate(d);
                    }
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.cellMonthInner}>
                    <Text style={[styles.cellNum, !inMonth && styles.cellNumMuted, sel && styles.cellNumSel]}>
                      {format(d, 'd')}
                    </Text>
                    <View style={styles.cellMonthSpacer} />
                    {strip?.kind === 'closing' ? (
                      <View style={styles.monthStripClosing}>
                        <Text style={styles.monthStripText} numberOfLines={1}>
                          Schließtag
                        </Text>
                      </View>
                    ) : strip?.kind === 'strip' ? (
                      <View style={[styles.monthStrip, { backgroundColor: strip.bg }]}>
                        <Text style={styles.monthStripText} numberOfLines={2}>
                          {strip.label}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        )}
      </ScrollView>

      <View style={styles.legendBar}>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#3b82f6' }]} />
            <Text style={styles.legendText}>Schulveranstaltung</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#22c55e' }]} />
            <Text style={styles.legendText}>Unterricht</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#8b5cf6' }]} />
            <Text style={styles.legendText}>Kurs/AG</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
            <Text style={styles.legendText}>Schließtag</Text>
          </View>
        </View>
      </View>

      <Modal
        visible={previewData != null}
        transparent
        animationType="slide"
        onRequestClose={() => setPreviewData(null)}
        statusBarTranslucent
      >
        <Pressable style={styles.previewSheetBackdrop} onPress={() => setPreviewData(null)} />
        <View
          style={[
            styles.previewSheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.previewSheetHandleRow}>
            <View style={styles.previewSheetHandle} />
          </View>
          <View
            style={[styles.previewAccent, { backgroundColor: previewData?.accentColor || '#22c55e' }]}
          />
          <View style={styles.previewBodyContent}>
            <View style={styles.previewHeaderRow}>
              <Text style={styles.previewSheetTitle} numberOfLines={2}>
                {previewData?.title ?? ''}
              </Text>
              <TouchableOpacity
                onPress={() => setPreviewData(null)}
                hitSlop={12}
                style={styles.previewCloseIconBtn}
                accessibilityRole="button"
                accessibilityLabel="Schließen"
              >
                <Ionicons name="close" size={22} color="#374151" />
              </TouchableOpacity>
            </View>
            {previewData?.category ? (
              <View style={styles.previewCategoryPill}>
                <Text style={styles.previewCategoryText}>{previewData.category}</Text>
              </View>
            ) : null}

            <View style={styles.previewRow}>
              <Ionicons name="calendar-outline" size={18} color="#6b7280" style={styles.previewIcon} />
              <Text style={styles.previewLabel}>Datum</Text>
              <Text style={styles.previewValue}>{previewData?.dateLabel ?? '—'}</Text>
            </View>

            <View style={styles.previewRow}>
              <Ionicons name="time-outline" size={18} color="#6b7280" style={styles.previewIcon} />
              <Text style={styles.previewLabel}>Zeit</Text>
              <Text style={styles.previewValue}>{previewData?.timeLabel ?? '—'}</Text>
            </View>

            <View style={styles.previewRow}>
              <Ionicons name="people-outline" size={18} color="#6b7280" style={styles.previewIcon} />
              <Text style={styles.previewLabel}>Klassen</Text>
              <Text style={styles.previewValue}>{previewData?.classes ?? '—'}</Text>
            </View>

            {previewData?.cancelMeal ? (
              <View style={styles.previewRow}>
                <Ionicons name="warning-outline" size={18} color="#b45309" style={styles.previewIcon} />
                <Text style={[styles.previewValue, { color: '#b45309' }]}>Verpflegung storniert</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginTop: 4, width: '100%' },
  modeSwitcherRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 10,
  },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  navIconBtn: { padding: 4 },
  periodLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: '#111827', textAlign: 'center' },
  classHint: { fontSize: 12, color: '#64748b', marginBottom: 6 },
  warn: { fontSize: 12, color: '#374151', marginBottom: 8 },
  loader: { marginVertical: 8 },
  scrollContent: { paddingBottom: 4 },
  gridHeaderRow: { flexDirection: 'row', borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f3f4f6' },
  hdrStunde: { paddingVertical: 4, paddingHorizontal: 4, borderRightWidth: 1, borderRightColor: '#e5e7eb', justifyContent: 'center' },
  hdrText: { fontSize: 10, fontWeight: '700', color: '#374151' },
  hdrDay: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
    alignItems: 'center',
  },
  hdrDayToday: { backgroundColor: '#e2e8f0' },
  hdrDayText: { fontSize: 10, fontWeight: '600', color: '#111827', textAlign: 'center' },
  closingBadge: {
    marginTop: 2,
    backgroundColor: '#dc2626',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  closingBadgeText: { fontSize: 9, fontWeight: '700', color: '#ffffff' },
  gridRow: { flexDirection: 'row', borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#e5e7eb' },
  timeCell: {
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    justifyContent: 'center',
  },
  timeCellText: { fontSize: 9, fontWeight: '600', color: '#374151' },
  pauseCell: { alignItems: 'center' },
  pauseLabel: { fontSize: 10, color: '#6b7280', fontWeight: '600' },
  pauseSpan: { flex: 1, flexDirection: 'row' },
  pauseDay: { borderRightWidth: 1, borderRightColor: '#e5e7eb', minHeight: ROW_H, backgroundColor: '#f3f4f6' },
  cell: {
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
    paddingHorizontal: 2,
    paddingVertical: 2,
    position: 'relative',
    overflow: 'visible',
  },
  cellBreak: { backgroundColor: '#f3f4f6' },
  cellTodayBg: { backgroundColor: '#f1f5f9' },
  cellClosing: { backgroundColor: '#fef2f2' },
  eventAbs: {
    position: 'absolute',
    top: 4,
    borderRadius: 6,
    padding: 4,
    zIndex: 20,
  },
  eventTitle: { color: '#fff', fontSize: 10, fontWeight: '700' },
  eventSub: { color: 'rgba(255,255,255,0.9)', fontSize: 9 },
  lessonAbs: {
    position: 'absolute',
    left: 4,
    right: 4,
    top: 4,
    borderRadius: 6,
    padding: 6,
    zIndex: 15,
  },
  lessonInline: { borderRadius: 6, padding: 4, marginBottom: 4, zIndex: 15 },
  lessonTitle: { color: '#fff', fontSize: 11, fontWeight: '700' },
  lessonSub: { color: 'rgba(255,255,255,0.9)', fontSize: 9, marginTop: 2 },
  emptyGrid: { padding: 16, color: '#6b7280', textAlign: 'center' },
  legendBar: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    rowGap: 6,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: '#6b7280' },
  // Event-detail bottom sheet (mirrors StaffCalendarScreen)
  previewSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  previewSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 12,
  },
  previewSheetHandleRow: {
    paddingTop: 10,
    paddingBottom: 6,
    alignItems: 'center',
  },
  previewSheetHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
  },
  previewAccent: {
    height: 6,
    width: '100%',
  },
  previewBodyContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  previewSheetTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  previewCloseIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  previewCategoryPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#f3f4f6',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    marginBottom: 14,
  },
  previewCategoryText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f3f4f6',
  },
  previewIcon: { marginRight: 12 },
  previewLabel: {
    width: 80,
    fontSize: 14,
    color: '#6b7280',
  },
  previewValue: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },
  modeSegment: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    overflow: 'hidden',
    flexShrink: 0,
  },
  segBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#fff' },
  segBtnOn: { backgroundColor: '#111827' },
  segText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  segTextOn: { color: '#fff' },
  monthWrap: { paddingBottom: 8 },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  monthNavBtn: { fontSize: 22, color: '#111827', fontWeight: '700', paddingHorizontal: 8 },
  todayLink: { fontSize: 14, color: '#111827', fontWeight: '600' },
  monthTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginLeft: 8, flex: 1, minWidth: 120 },
  weekHdrRow: { flexDirection: 'row', marginTop: 4 },
  weekHdr: { textAlign: 'center', fontSize: 12, color: '#6b7280', fontWeight: '600' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  cellMonth: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    alignItems: 'stretch',
    paddingTop: 6,
    paddingBottom: 4,
    paddingHorizontal: 2,
    backgroundColor: '#fff',
  },
  cellMonthInner: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'column',
  },
  cellMonthSpacer: {
    flexGrow: 1,
    flexShrink: 0,
    minHeight: 2,
  },
  cellMuted: { backgroundColor: '#f3f4f6' },
  cellSel: { backgroundColor: '#F1F5F9', borderColor: '#111827' },
  cellNum: { fontSize: 16, fontWeight: '600', color: '#111827', alignSelf: 'flex-start' },
  cellNumMuted: { color: '#9ca3af' },
  cellNumSel: { color: '#111827' },
  cellMonthClosing: { backgroundColor: '#fef2f2' },
  monthStrip: {
    alignSelf: 'stretch',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  monthStripClosing: {
    alignSelf: 'stretch',
    backgroundColor: '#ef4444',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  monthStripText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
});
