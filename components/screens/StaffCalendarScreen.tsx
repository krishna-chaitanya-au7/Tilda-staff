import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Switch,
  Platform,
  Pressable,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import CalendarCreateEntryModal, {
  type CourseCreateFormData,
  type EventCreateFormData,
  type SubjectCreateFormData,
} from '@/components/CalendarCreateEntryModal';
import CalendarTourModal, { type HoleRect } from '@/components/CalendarTourModal';
import { useRouter } from 'expo-router';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { buildCalendarTourSteps, type TourTarget } from '@/lib/calendarTourMobile';
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
import { supabase } from '@/lib/supabase';
import { haptics } from '@/lib/haptics';
import type { SingleFacilityScope, SupervisorFacilityScope } from '@/lib/staffFacilityScope';
import { loadClosingDayStrings } from '@/lib/calendarClosingDays';
import { createSubjectEntryFromDialog } from '@/lib/addBaseSubjectSchedule';
import { loadCalendarSubjectOptions } from '@/lib/loadCalendarSubjectOptions';
import { SCREEN_HEADER_TOP_PAD } from '@/constants/theme';
import {
  type AssignmentRow,
  type FacilityEventItem,
  type PeriodRow,
  type PlanPerspective,
  addDays,
  buildFacilityDisplayByCell,
  buildMergedClassesMap,
  buildMergedDisplayByCell,
  buildGrouped,
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

const EMPTY_STRING_ARRAY: string[] = [];
const EMPTY_ASSIGNMENT_ROWS: AssignmentRow[] = [];
const EMPTY_ATTACHED: Array<{ id: string; base_schedule_id: string; subject_id: string; class: string }> = [];
const EMPTY_BASE_SLOTS: Array<{
  id: string;
  day_of_week: number;
  period_start: string;
  period_end: string;
  class: string;
}> = [];
const EMPTY_FACILITY_EVENTS: FacilityEventItem[] = [];

type Scope = SingleFacilityScope | SupervisorFacilityScope;

function primaryFacilityIdFromScope(s: Scope): string {
  return s.mode === 'supervisor' ? s.primaryFacilityId : s.facilityId;
}

function ymd(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

async function checkCanOpenPlanSettings(params: {
  facilityId: string;
  staffUserId: string;
  authUserId: string;
  userType: string;
  recordId: string | null | undefined;
  supervisorScope: SupervisorFacilityScope | null;
}): Promise<boolean> {
  const { facilityId, staffUserId, authUserId, userType, recordId, supervisorScope } = params;
  if (supervisorScope && supervisorScope.facilityIds.some((id) => String(id) === String(facilityId))) {
    return true;
  }
  const { data: ua } = await supabase
    .from('user_access')
    .select('role, user_type, resource_type, resource_id')
    .or(`user_id.eq.${staffUserId},user_id.eq.${authUserId}`)
    .eq('resource_type', 'facility')
    .eq('resource_id', facilityId);
  const roles = (ua || []).map((r: { role?: string | null }) => String(r.role || '').toLowerCase());
  if (roles.some((r) => ['principal', 'director'].includes(r))) return true;
  const isMainFacilityAccount =
    String(userType || '').toLowerCase() === 'facility' && recordId === facilityId;
  return isMainFacilityAccount;
}

type BaseSubject = {
  id: string;
  base_schedule_id: string;
  subject_id: string;
  subject_name: string;
  parent_subject_id: string | null;
};

/** Week grid row height — compact (~half of previous 52) */
const ROW_H = 26;
const TIME_COL_W = 64;
const DAY_MIN_W = 72;

export default function StaffCalendarScreen({
  scopeLoader,
}: {
  scopeLoader: () => Promise<Scope | null>;
}) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const isMobile = useIsMobile();
  const rootBottomPad = (tabBarHeight > 0 ? tabBarHeight : insets.bottom) + 8;

  const [scope, setScope] = useState<Scope | null>(null);
  const [staffCtx, setStaffCtx] = useState<{
    staffUserId: string;
    authUserId: string;
    userType: string;
    recordId: string | null;
  } | null>(null);
  const [canSettings, setCanSettings] = useState(false);

  const [academicYearOptions, setAcademicYearOptions] = useState<Array<{ id: string; label: string; isCurrent: boolean }>>(
    []
  );
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string | null>(null);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);

  const [facilityType, setFacilityType] = useState<string | null>(null);
  const [classes, setClasses] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [roomOptions, setRoomOptions] = useState<string[]>([]);
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [perspective, setPerspective] = useState<PlanPerspective>('school');
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [weekOf, setWeekOf] = useState<string>(() => formatLocalYYYYMMDD(getMonday(new Date())));

  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [closingDayKeys, setClosingDayKeys] = useState<Set<string>>(new Set());
  const [staffOptions, setStaffOptions] = useState<Array<{ keyId: string; userId: string; name: string }>>([]);
  const [childrenOptions, setChildrenOptions] = useState<Array<{ id: string; name: string; class: string }>>([]);

  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [allBaseSlotsData, setAllBaseSlotsData] = useState<
    Array<{ id: string; day_of_week: number; period_start: string; period_end: string; class: string }>
  >([]);
  const [allAttachedData, setAllAttachedData] = useState<
    Array<{ id: string; base_schedule_id: string; subject_id: string; class: string }>
  >([]);
  const [facilityEvents, setFacilityEvents] = useState<FacilityEventItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [entityPickerOpen, setEntityPickerOpen] = useState(false);

  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());

  const [createEntryOpen, setCreateEntryOpen] = useState(false);
  const [createEntryInitialTab, setCreateEntryInitialTab] = useState<'event' | 'course' | 'subject'>('event');
  const [subjectAddTarget, setSubjectAddTarget] = useState<{ dayIndex: number; start: string } | null>(null);

  const [editEventOpen, setEditEventOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTargetClasses, setEditTargetClasses] = useState<Set<string>>(new Set());
  const [editCancelMeal, setEditCancelMeal] = useState(false);
  const [editRoomPickerOpen, setEditRoomPickerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [allDay, setAllDay] = useState(true);
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('general');
  const [color, setColor] = useState('#6B7280');
  const [pickerTarget, setPickerTarget] = useState<'start' | 'end' | null>(null);

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

  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const [tourHoleRect, setTourHoleRect] = useState<HoleRect | null>(null);
  const tourAnchorRefs = useRef<Partial<Record<TourTarget, View | null>>>({});
  const makeAnchorProps = useCallback(
    (target: TourTarget) => ({
      collapsable: false as const,
      ref: (el: View | null) => {
        tourAnchorRefs.current[target] = el;
      },
    }),
    []
  );

  const router = useRouter();
  const scheduleFacilityId = scope ? primaryFacilityIdFromScope(scope) : '';
  const eventFacilityIds = useMemo(() => {
    if (scope?.facilityIds?.length) return scope.facilityIds;
    return EMPTY_STRING_ARRAY;
  }, [scope]);

  const classTabLabel = facilityType === 'kindergarten' ? 'Gruppen' : 'Klassen';

  const tourSteps = useMemo(() => buildCalendarTourSteps(canSettings), [canSettings]);

  const startCalendarTour = useCallback(() => {
    setTourIndex(0);
  }, []);

  const closeCalendarTour = useCallback(() => {
    setTourIndex(null);
    setTourHoleRect(null);
  }, []);

  useLayoutEffect(() => {
    if (tourIndex === null) {
      setTourHoleRect(null);
      return;
    }
    const target = tourSteps[tourIndex]?.target;
    if (!target) return;

    const MIN_Y = insets.top + 20;
    const isSane = (r: HoleRect) => r.w > 0 && r.h >= 10 && r.y >= MIN_Y;

    // Always measure fresh when a tour step activates. Early onLayout captures are
    // unreliable on Android — a measurement taken during initial layout can be
    // stale relative to the final painted positions of sibling elements above.
    // Clear the previous step's spotlight immediately to avoid a flash of the wrong rect.
    setTourHoleRect(null);

    let cancelled = false;
    let attempt = 0;
    const maxAttempts = 10;

    const takeMeasure = () => {
      if (cancelled) return;
      const node = tourAnchorRefs.current[target];
      if (!node) {
        attempt += 1;
        if (attempt < maxAttempts) setTimeout(takeMeasure, 150);
        return;
      }
      // requestAnimationFrame ensures the next paint has committed before we measure.
      requestAnimationFrame(() => {
        if (cancelled) return;
        const n = tourAnchorRefs.current[target];
        if (!n) return;
        // Use measure() — on Android its pageX/pageY values are more reliable than
        // measureInWindow for elements that have just been re-laid-out.
        n.measure((_fx: number, _fy: number, w: number, h: number, px: number, py: number) => {
          if (cancelled) return;
          const r = { x: px, y: py, w, h };
          if (__DEV__) {
            console.log(`[tour] ${target} measure:`, r);
          }
          if (isSane(r)) {
            setTourHoleRect(r);
          } else {
            attempt += 1;
            if (attempt < maxAttempts) setTimeout(takeMeasure, 150);
          }
        });
      });
    };

    const initial = setTimeout(takeMeasure, 400);
    return () => {
      cancelled = true;
      clearTimeout(initial);
    };
  }, [tourIndex, tourSteps, viewMode, assignmentsLoading, width, insets.top]);

  useEffect(() => {
    setSelectedEntityId('');
  }, [perspective]);

  useEffect(() => {
    (async () => {
      const { data: years } = await supabase
        .from('academic_years')
        .select('id, year, is_current, start_date, end_date')
        .order('start_date', { ascending: false, nullsFirst: false });
      const options = (years || []).map((y: any) => {
        const yearLabel = String(y.year || '').trim();
        const start = y.start_date ? String(y.start_date) : '';
        const end = y.end_date ? String(y.end_date) : '';
        const rangeLabel = start && end ? `${start} - ${end}` : start || end || '';
        return {
          id: String(y.id),
          label: yearLabel || rangeLabel || `Jahr ${y.id}`,
          isCurrent: !!y.is_current,
        };
      });
      setAcademicYearOptions(options);
    })();
  }, []);

  const bootstrapScope = useCallback(async () => {
    const s = await scopeLoader();
    setScope(s);
  }, [scopeLoader]);

  useEffect(() => {
    if (!academicYearOptions.length) return;
    setSelectedAcademicYearId((prev) => {
      if (prev && academicYearOptions.some((o) => o.id === prev)) return prev;
      if (scope?.academicYearId && academicYearOptions.some((o) => o.id === scope.academicYearId)) {
        return scope.academicYearId;
      }
      const cur = academicYearOptions.find((o) => o.isCurrent);
      return cur?.id ?? academicYearOptions[0]?.id ?? null;
    });
  }, [scope?.academicYearId, academicYearOptions]);

  useEffect(() => {
    (async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) {
        setStaffCtx(null);
        return;
      }
      const { data: userRow } = await supabase
        .from('users')
        .select('id, user_type, record_id')
        .eq('auth_id', authUser.id)
        .single();
      if (!userRow) {
        setStaffCtx(null);
        return;
      }
      setStaffCtx({
        staffUserId: userRow.id,
        authUserId: authUser.id,
        userType: String(userRow.user_type || ''),
        recordId: userRow.record_id ?? null,
      });
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!scheduleFacilityId || !staffCtx) {
        setCanSettings(false);
        return;
      }
      const ok = await checkCanOpenPlanSettings({
        facilityId: scheduleFacilityId,
        staffUserId: staffCtx.staffUserId,
        authUserId: staffCtx.authUserId,
        userType: staffCtx.userType,
        recordId: staffCtx.recordId,
        supervisorScope: scope?.mode === 'supervisor' ? scope : null,
      });
      setCanSettings(ok);
    })();
  }, [scheduleFacilityId, staffCtx, scope]);

  useEffect(() => {
    (async () => {
      if (!scheduleFacilityId || !selectedAcademicYearId) return;
      try {
        const { data, error: err } = await supabase
          .from('facilities')
          .select('facility_settings, type, can_connect_stripe, stripe_connected')
          .eq('id', scheduleFacilityId)
          .single();
        if (err) throw err;
        setPaymentsEnabled(Boolean(data?.can_connect_stripe && data?.stripe_connected));
        setFacilityType(typeof data?.type === 'string' ? data.type.toLowerCase() : null);
        let settings: any = data?.facility_settings;
        if (typeof settings === 'string') {
          try {
            settings = JSON.parse(settings);
          } catch {
            settings = {};
          }
        }
        if (Array.isArray(settings?.classes)) {
          setClasses(settings.classes);
          setSelectedClass((sc) => sc || settings.classes[0] || '');
        } else {
          setClasses([]);
        }
        if (Array.isArray(settings?.rooms)) {
          setRoomOptions(settings.rooms);
        } else {
          setRoomOptions([]);
        }
      } catch {
        setFacilityType(null);
      }
    })();
  }, [scheduleFacilityId, selectedAcademicYearId]);

  useEffect(() => {
    (async () => {
      if (!scheduleFacilityId) return;
      try {
        const { data, error: err } = await withAcademicYear(
          supabase
            .from('sch_facility_periods')
            .select('id, period_start, period_end, is_break, applies_to_days, label')
            .eq('facility_id', scheduleFacilityId),
          selectedAcademicYearId
        ).order('period_start', { ascending: true });
        if (err) throw err;
        setPeriods((data || []) as PeriodRow[]);
      } catch {
        setPeriods([]);
      }
    })();
  }, [scheduleFacilityId, selectedAcademicYearId]);

  useEffect(() => {
    (async () => {
      if (!scheduleFacilityId || !selectedAcademicYearId) return;
      try {
        const { data } = await withAcademicYear(
          supabase.from('sch_schedule_settings').select('is_locked').eq('facility_id', scheduleFacilityId),
          selectedAcademicYearId
        ).maybeSingle();
        setIsLocked(!!data?.is_locked);
      } catch {
        setIsLocked(false);
      }
    })();
  }, [scheduleFacilityId, selectedAcademicYearId]);

  useEffect(() => {
    (async () => {
      if (!scheduleFacilityId || !selectedAcademicYearId) return;
      try {
        const keys = await loadClosingDayStrings(scheduleFacilityId, selectedAcademicYearId);
        setClosingDayKeys(new Set(keys.map(String)));
      } catch {
        setClosingDayKeys(new Set());
      }
    })();
  }, [scheduleFacilityId, selectedAcademicYearId]);

  useFocusEffect(
    useCallback(() => {
      if (!scheduleFacilityId || !selectedAcademicYearId) return;
      let cancelled = false;
      (async () => {
        try {
          const keys = await loadClosingDayStrings(scheduleFacilityId, selectedAcademicYearId);
          if (!cancelled) setClosingDayKeys(new Set(keys.map(String)));
        } catch {
          if (!cancelled) setClosingDayKeys(new Set());
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [scheduleFacilityId, selectedAcademicYearId])
  );

  useEffect(() => {
    (async () => {
      if (!scheduleFacilityId) return;
      try {
        const { data, error: err } = await supabase
          .from('staff')
          .select('id, name, staff_user_id')
          .eq('facility_id', scheduleFacilityId)
          .order('name', { ascending: true });
        if (err) throw err;
        const staffRows = (data || []).filter((s: any) => !!s.staff_user_id);
        const userIds = Array.from(new Set(staffRows.map((s: any) => s.staff_user_id as string)));
        let userNameById = new Map<string, string>();
        if (userIds.length > 0) {
          const { data: users, error: uErr } = await supabase
            .from('users')
            .select('id, first_name, family_name')
            .in('id', userIds);
          if (!uErr && users) {
            userNameById = new Map(
              (users || []).map((u: any) => [
                u.id as string,
                `${u.first_name || ''} ${u.family_name || ''}`.trim(),
              ])
            );
          }
        }
        setStaffOptions(
          staffRows.map((s: any) => ({
            keyId: s.id as string,
            userId: s.staff_user_id as string,
            name: (userNameById.get(s.staff_user_id) || s.name) as string,
          }))
        );
      } catch {
        setStaffOptions([]);
      }
    })();
  }, [scheduleFacilityId]);

  useEffect(() => {
    (async () => {
      if (!scheduleFacilityId || !selectedAcademicYearId) return;
      try {
        const { data } = await withAcademicYear(
          supabase
            .from('children_info')
            .select('user_id, class, users!inner(first_name, family_name, is_deleted)')
            .eq('facility_id', scheduleFacilityId)
            .eq('is_deleted', false),
          selectedAcademicYearId
        );
        const list = (data || [])
          .filter((r: any) => !!r.user_id && !!r.users && !r.users.is_deleted)
          .map((r: any) => ({
            id: String(r.user_id),
            class: String(r.class || ''),
            name: `${r.users.first_name || ''} ${r.users.family_name || ''}`.trim() || String(r.user_id),
          }))
          .sort((a: any, b: any) => a.name.localeCompare(b.name));
        setChildrenOptions(list);
      } catch {
        setChildrenOptions([]);
      }
    })();
  }, [scheduleFacilityId, selectedAcademicYearId]);

  const classesToLoad = useMemo(() => {
    if (perspective === 'teacher' || perspective === 'room') {
      return classes;
    }
    if (perspective === 'child') {
      const child = childrenOptions.find((c) => c.id === selectedEntityId);
      return child?.class ? [child.class] : classes;
    }
    if (perspective === 'class') {
      if (selectedEntityId) return [selectedEntityId];
      return selectedClass ? [selectedClass] : EMPTY_STRING_ARRAY;
    }
    return selectedClass ? [selectedClass] : EMPTY_STRING_ARRAY;
  }, [perspective, classes, childrenOptions, selectedEntityId, selectedClass]);

  const eventTargetClass = useMemo(() => {
    if (perspective === 'class') return selectedEntityId || selectedClass || '';
    if (perspective === 'child') {
      const child = childrenOptions.find((c) => c.id === selectedEntityId);
      return child?.class || '';
    }
    return '';
  }, [perspective, selectedEntityId, selectedClass, childrenOptions]);

  const entityOptions = useMemo(() => {
    switch (perspective) {
      case 'class':
        return classes.map((c) => ({ id: c, name: c }));
      case 'teacher':
        return staffOptions.map((s) => ({ id: s.userId, name: s.name }));
      case 'child':
        return childrenOptions.map((c) => ({ id: c.id, name: c.name }));
      case 'room':
        return roomOptions.map((r) => ({ id: r, name: r }));
      default:
        return [];
    }
  }, [perspective, classes, staffOptions, childrenOptions, roomOptions]);

  useEffect(() => {
    if (perspective === 'class' && selectedEntityId && selectedEntityId !== selectedClass) {
      setSelectedClass(selectedEntityId);
    }
  }, [perspective, selectedEntityId, selectedClass]);

  const loadAssignments = useCallback(async () => {
    if (!scheduleFacilityId || !selectedAcademicYearId || classesToLoad.length === 0) {
      setRows((p) => (p.length === 0 ? p : EMPTY_ASSIGNMENT_ROWS));
      setAllBaseSlotsData((p) => (p.length === 0 ? p : EMPTY_BASE_SLOTS));
      setAllAttachedData((p) => (p.length === 0 ? p : EMPTY_ATTACHED));
      setAssignmentsLoading(false);
      return;
    }
    setAssignmentsLoading(true);
    setError(null);
    try {
      const baseSlotsQuery = withAcademicYear(
        supabase
          .from('sch_class_schedule_base')
          .select('id, day_of_week, period_start, period_end, class')
          .eq('facility_id', scheduleFacilityId),
        selectedAcademicYearId
      );
      const { data: baseSlots, error: baseErr } = await (classesToLoad.length === 1
        ? baseSlotsQuery.eq('class', classesToLoad[0])
        : baseSlotsQuery.in('class', classesToLoad));
      if (baseErr) throw baseErr;
      const baseIds = (baseSlots || []).map((b: any) => b.id);
      const baseIdToClass = new Map<string, string>();
      (baseSlots || []).forEach((b: any) => {
        baseIdToClass.set(b.id, b.class || classesToLoad[0] || '');
      });

      let attached: BaseSubject[] = [];
      if (baseIds.length > 0) {
        const { data: baseSubs, error: bsErr } = await withAcademicYear(
          supabase
            .from('sch_class_schedule_base_subjects')
            .select('id, base_schedule_id, subject_id')
            .in('base_schedule_id', baseIds)
            .eq('facility_id', scheduleFacilityId),
          selectedAcademicYearId
        );
        if (bsErr) throw bsErr;
        const subjIds = Array.from(new Set((baseSubs || []).map((b: any) => b.subject_id)));
        const { data: subs, error: sErr } = await supabase
          .from('sch_subjects')
          .select('id, name, parent_subject_id')
          .in('id', subjIds);
        if (sErr) throw sErr;
        const idToName = new Map((subs || []).map((s: any) => [s.id, s.name]));
        const idToParent = new Map(
          (subs || []).map((s: any) => [s.id, (s.parent_subject_id as string) || null])
        );
        attached = (baseSubs || []).map((b: any) => ({
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
          .eq('facility_id', scheduleFacilityId),
        selectedAcademicYearId
      );
      if (allBaseErr) throw allBaseErr;

      setAllBaseSlotsData(
        (allBaseSlots || []).map((b: any) => ({
          id: b.id,
          day_of_week: b.day_of_week,
          period_start: String(b.period_start).slice(0, 5),
          period_end: String(b.period_end).slice(0, 5),
          class: b.class || '',
        }))
      );

      const allBaseIds = (allBaseSlots || []).map((b: any) => b.id);
      const allBaseIdToClass = new Map<string, string>();
      (allBaseSlots || []).forEach((b: any) => {
        allBaseIdToClass.set(b.id, b.class || '');
      });

      let allAttached: Array<{ id: string; base_schedule_id: string; subject_id: string; class: string }> = [];
      if (allBaseIds.length > 0) {
        const { data: allBaseSubs, error: allBsErr } = await withAcademicYear(
          supabase
            .from('sch_class_schedule_base_subjects')
            .select('id, base_schedule_id, subject_id')
            .in('base_schedule_id', allBaseIds)
            .eq('facility_id', scheduleFacilityId),
          selectedAcademicYearId
        );
        if (allBsErr) throw allBsErr;
        allAttached = (allBaseSubs || []).map((b: any) => ({
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
          .eq('facility_id', scheduleFacilityId)
          .eq('week_of', weekOf),
        selectedAcademicYearId
      );
      if (aErrWeek) throw aErrWeek;

      const { data: assignsDate, error: aErrDate } = await withAcademicYear(
        supabase
          .from('sch_class_schedule_assignments')
          .select('base_subject_id, teacher_id, room, date, week_of')
          .eq('facility_id', scheduleFacilityId)
          .in('date', weekDates),
        selectedAcademicYearId
      );
      if (aErrDate) throw aErrDate;

      const dateAsnMap = new Map<string, any>();
      (assignsDate || []).forEach((a: any) => {
        if (a.date) {
          dateAsnMap.set(`${a.base_subject_id}-${a.date}`, a);
        }
      });

      const weekAsnMap = new Map<string, any>();
      (assignsWeek || []).forEach((a: any) => {
        const hasDateSpecific = (assignsDate || []).some(
          (d: any) => d.base_subject_id === a.base_subject_id && d.date
        );
        if (!hasDateSpecific) {
          weekAsnMap.set(a.base_subject_id, a);
        }
      });

      const combined: AssignmentRow[] = [];
      (baseSlots || []).forEach((slot: any) => {
        const subsForSlot = attached.filter((a) => a.base_schedule_id === slot.id);
        subsForSlot.forEach((as) => {
          const slotDate = new Date(monday);
          slotDate.setDate(monday.getDate() + (slot.day_of_week - 1));
          const slotDateStr = formatLocalYYYYMMDD(slotDate);
          const dateKey = `${as.id}-${slotDateStr}`;
          const found = dateAsnMap.get(dateKey) || weekAsnMap.get(as.id);
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
    } catch (e: any) {
      setError(e?.message || 'Stundenplan konnte nicht geladen werden');
      setRows(EMPTY_ASSIGNMENT_ROWS);
    } finally {
      setAssignmentsLoading(false);
    }
  }, [scheduleFacilityId, selectedAcademicYearId, weekOf, classesToLoad]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  const loadFacilityEvents = useCallback(async () => {
    if (!eventFacilityIds.length || !selectedAcademicYearId) {
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
          : getFacilityEventsVisibleRange(weekOf, viewMode);
      const rangeOr = `and(start_date.lte.${end},end_date.gte.${start})`;
      const yearNum = Number(selectedAcademicYearId);

      const { data: eventRows, error: evErr } = await supabase
        .from('facility_events')
        .select(
          'id, title, description, start_date, end_date, start_time, end_time, all_day, location, color, category, target_classes, cancel_meal, event_type'
        )
        .in('facility_id', eventFacilityIds)
        .eq('academic_year', yearNum)
        .or(rangeOr);
      if (evErr) throw evErr;

      const courseSelect =
        'id, title, description, start_date, end_date, start_time, end_time, all_day, location, color, category, target_classes, cancel_meal';

      const { data: sessionRowsRaw, error: sessionRangeErr } = await supabase
        .from('facility_course_schedule_days')
        .select('id, course_id, session_date, start_time, end_time')
        .in('facility_id', eventFacilityIds)
        .eq('academic_year', yearNum)
        .gte('session_date', start)
        .lte('session_date', end);

      const { data: anySchedRows, error: anySchedErr } = await supabase
        .from('facility_course_schedule_days')
        .select('course_id')
        .in('facility_id', eventFacilityIds)
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
        description: row.description,
        start_date: String(row.start_date),
        end_date: String(row.end_date),
        start_time: row.start_time,
        end_time: row.end_time,
        all_day: !!row.all_day,
        location: row.location,
        color: row.color,
        category: row.category,
        target_classes: row.target_classes,
        cancel_meal: row.cancel_meal,
        event_type: row.event_type === 'course' ? 'course' : 'event',
      }));

      if (!scheduleTableOk) {
        const { data: courseRows, error: courseErr } = await supabase
          .from('facility_courses')
          .select(courseSelect)
          .in('facility_id', eventFacilityIds)
          .eq('academic_year', yearNum)
          .or(rangeOr);
        if (courseErr) throw courseErr;
        const legacyCourses = (courseRows || []).map((row: any) => ({
          id: String(row.id),
          sourceTable: 'facility_courses' as const,
          title: String(row.title || ''),
          description: row.description,
          start_date: String(row.start_date),
          end_date: String(row.end_date),
          start_time: row.start_time,
          end_time: row.end_time,
          all_day: !!row.all_day,
          location: row.location,
          color: row.color,
          category: row.category,
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
        .in('facility_id', eventFacilityIds)
        .eq('academic_year', yearNum)
        .or(rangeOr);
      if (courseErr) throw courseErr;

      const fromLegacy = facilityCourseLegacyEvents(courseRows, courseIdsWithAnySchedule);
      setFacilityEvents([...events, ...fromSessions, ...fromLegacy]);
    } catch {
      setFacilityEvents((prev) => (prev.length === 0 ? prev : EMPTY_FACILITY_EVENTS));
    }
  }, [eventFacilityIds, selectedAcademicYearId, weekOf, viewMode, monthAnchor]);

  useEffect(() => {
    loadFacilityEvents();
  }, [loadFacilityEvents]);

  const loadEligibleChildren = useCallback(async () => {
    if (!scheduleFacilityId || !selectedAcademicYearId) return [];
    const { data: ci } = await withAcademicYear(
      supabase
        .from('children_info')
        .select(
          'user_id, class, is_approved, status, users!inner(id, first_name, family_name, is_deleted)'
        )
        .eq('facility_id', scheduleFacilityId)
        .eq('is_deleted', false),
      selectedAcademicYearId
    );
    return (ci || [])
      .filter((r: any) => {
        if (!r.users || r.users.is_deleted) return false;
        const approved = r.is_approved === true;
        const st = String(r.status || '').toLowerCase();
        const invited = st === 'invited' || st === 'invited+pending';
        return approved || invited;
      })
      .map((r: any) => ({
        id: r.user_id as string,
        name: `${r.users.first_name || ''} ${r.users.family_name || ''}`.trim(),
        class: r.class as string,
      }));
  }, [scheduleFacilityId, selectedAcademicYearId]);

  const loadSubjectOptionsForClass = useCallback(
    (className: string) =>
      loadCalendarSubjectOptions({
        facilityId: scheduleFacilityId,
        academicYearId: selectedAcademicYearId,
        selectedClass: className,
      }),
    [scheduleFacilityId, selectedAcademicYearId]
  );

  const handleCreateEntryEvent = useCallback(
    async (data: EventCreateFormData) => {
      if (!scheduleFacilityId || !selectedAcademicYearId) return;
      const endDate = data.endDate || data.startDate;
      const { error } = await supabase.from('facility_events').insert({
        facility_id: scheduleFacilityId,
        academic_year: Number(selectedAcademicYearId),
        title: data.title.trim(),
        description: data.description.trim() || null,
        start_date: data.startDate,
        end_date: endDate,
        start_time: data.allDay ? null : `${data.startTime}:00`,
        end_time: data.allDay ? null : `${data.endTime}:00`,
        all_day: data.allDay,
        location: data.room.trim() || null,
        color: null,
        category: 'general',
        target_classes: data.selectedClasses,
        cancel_meal: data.cancelMeal,
        created_by: staffCtx?.staffUserId ?? null,
      });
      if (error) {
        Alert.alert('Fehler', error.message);
        return;
      }
      await loadFacilityEvents();
    },
    [scheduleFacilityId, selectedAcademicYearId, staffCtx?.staffUserId, loadFacilityEvents]
  );

  const handleCreateEntryCourse = useCallback(
    async (data: CourseCreateFormData) => {
      if (!scheduleFacilityId || !selectedAcademicYearId) return;
      const sanitizedSessions = data.sessions
        .map((session) => ({
          date: String(session.date || ''),
          startTime: String(session.startTime || ''),
          endTime: String(session.endTime || ''),
        }))
        .filter((session) => session.date && session.startTime && session.endTime)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (sanitizedSessions.length === 0) {
        Alert.alert('Hinweis', 'Bitte für jeden Termin Datum, Startzeit und Endzeit ausfüllen.');
        return;
      }
      const invalidSession = sanitizedSessions.find((session) => session.endTime <= session.startTime);
      if (invalidSession) {
        Alert.alert('Hinweis', 'Bei jedem Termin muss die Endzeit nach der Startzeit liegen.');
        return;
      }
      const startDate = sanitizedSessions[0].date;
      const endDate = sanitizedSessions[sanitizedSessions.length - 1].date;
      const targetClasses =
        data.audience === 'class-specific' ? data.restrictedClasses : classes;
      const yearNum = Number(selectedAcademicYearId);

      const { data: insertedCourse, error: insertCourseError } = await supabase
        .from('facility_courses')
        .insert({
          facility_id: scheduleFacilityId,
          academic_year: yearNum,
          title: data.title.trim(),
          description: data.description.trim() || null,
          start_date: startDate,
          end_date: endDate,
          start_time: `${sanitizedSessions[0].startTime}:00`,
          end_time: `${sanitizedSessions[0].endTime}:00`,
          all_day: false,
          location: data.room.trim() || null,
          color: 'bg-violet-400/70',
          category: 'other',
          target_classes: targetClasses,
          cancel_meal: data.cancelMeal,
          max_participants: data.maxParticipants === '' ? null : Number(data.maxParticipants),
          price: paymentsEnabled && data.price !== '' ? Number(data.price) : null,
          billable: data.billable,
          audience: data.audience,
          created_by: staffCtx?.staffUserId ?? null,
        })
        .select('id')
        .single();

      if (insertCourseError) {
        Alert.alert('Fehler', insertCourseError.message);
        return;
      }
      if (!insertedCourse?.id) {
        Alert.alert('Fehler', 'Kurs konnte nicht erstellt werden.');
        return;
      }

      const sessionPayload = sanitizedSessions.map((session) => ({
        facility_id: scheduleFacilityId,
        academic_year: yearNum,
        course_id: insertedCourse.id,
        session_date: session.date,
        start_time: `${session.startTime}:00`,
        end_time: `${session.endTime}:00`,
      }));
      const { error: sessionInsertError } = await supabase
        .from('facility_course_schedule_days')
        .insert(sessionPayload);
      if (sessionInsertError) {
        await supabase.from('facility_courses').delete().eq('id', insertedCourse.id);
        Alert.alert('Fehler', sessionInsertError.message);
        return;
      }
      await loadFacilityEvents();
    },
    [
      scheduleFacilityId,
      selectedAcademicYearId,
      classes,
      paymentsEnabled,
      staffCtx?.staffUserId,
      loadFacilityEvents,
    ]
  );

  const handleCreateEntrySubject = useCallback(
    async (data: SubjectCreateFormData) => {
      if (!scheduleFacilityId || !selectedAcademicYearId) return;
      const res = await createSubjectEntryFromDialog({
        facilityId: scheduleFacilityId,
        academicYearId: selectedAcademicYearId,
        periods,
        subjectOptions: data.subjectOptions,
        selectedClassFallback: selectedClass || classes[0] || '',
        target: data.target,
        dialogSelectedClass: data.selectedClass,
        parentSubjectId: data.parentSubjectId,
        childSubjectId: data.childSubjectId,
        childSubjectName: data.childSubjectName,
        mergeEnabled: data.mergeEnabled,
        selectedClasses: data.selectedClasses,
      });
      if (!res.ok) {
        Alert.alert('Hinweis', res.error || 'Fach konnte nicht hinzugefügt werden.');
        return;
      }
      await loadAssignments();
    },
    [scheduleFacilityId, selectedAcademicYearId, periods, selectedClass, classes, loadAssignments]
  );

  // Sync `monthAnchor` from `weekOf` only when the user enters month view, not
  // on every `weekOf` change. The month-view chevrons set `monthAnchor`
  // directly, so re-syncing here would overwrite their explicit choice with a
  // value derived from `getMonday(...)` that can land in the previous month.
  const prevViewModeRef = useRef(viewMode);
  useEffect(() => {
    if (prevViewModeRef.current !== 'month' && viewMode === 'month') {
      const monday = getMonday(parseISODateLocal(weekOf));
      // Use the first day of the *displayed* week's month — anchor on the
      // Thursday of the week so a cross-month week resolves to the dominant
      // month (matches ISO week conventions).
      const thursday = addDays(monday, 3);
      setMonthAnchor(startOfMonth(thursday));
    }
    prevViewModeRef.current = viewMode;
  }, [viewMode, weekOf]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await bootstrapScope();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [bootstrapScope]);

  const visibleRows = useMemo(() => {
    if (perspective === 'teacher' && selectedEntityId) {
      return rows.filter((r) => r.teacher_id === selectedEntityId);
    }
    if (perspective === 'room' && selectedEntityId) {
      return rows.filter((r) => r.room === selectedEntityId);
    }
    if (perspective === 'child' && selectedEntityId) {
      const child = childrenOptions.find((c) => c.id === selectedEntityId);
      if (!child?.class) return rows;
      return rows.filter((r) => r.class === child.class);
    }
    return rows;
  }, [rows, perspective, selectedEntityId, childrenOptions]);

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
        // Pass empty string so the helper does NOT filter by `target_classes`.
        // Month view also shows every event regardless of class scope; this
        // makes the week grid match. Without this, a Kurs created with
        // class-specific audience disappears in week view when the user is
        // browsing a different class perspective, even though the same Kurs
        // shows up in month view.
        '',
        perspective,
        selectedEntityId,
        // Always render facility events in the week grid. The `isLocked`
        // gate inside the helper used to drop Kurs / Schulveranstaltung etc.
        // until the timetable was locked, which made events invisible to
        // most users.
        true
      ),
    [facilityEvents, timeSlots, periods, perspective, selectedEntityId]
  );

  const currentMonday = useMemo(() => getMonday(parseISODateLocal(weekOf)), [weekOf]);
  // In month mode, the label tracks `monthAnchor` directly. Deriving from
  // `currentMonday` could land on the wrong month name when the chevron sets
  // weekOf to `getMonday(monthFirstDay)` and that Monday falls in the previous
  // month (e.g. month starts on a Tuesday → Monday is in the prior month).
  const periodLabel = useMemo(
    () =>
      viewMode === 'month'
        ? getMonthNameDe(monthAnchor)
        : computePeriodLabel('week', currentMonday),
    [viewMode, currentMonday, monthAnchor]
  );

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

  const timeSlotOptions = useMemo(
    () => timeSlots.map((start) => ({ start, end: getRowEndByStart(start) })),
    [timeSlots, periods]
  );

  const staffNameById = useMemo(
    () => new Map(staffOptions.map((s) => [s.userId, s.name])),
    [staffOptions]
  );

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
      const rows = visibleRows
        .filter((r) => r.day_of_week === dow)
        .sort((a, b) => a.period_start.localeCompare(b.period_start));
      if (rows.length > 0) {
        const first = rows[0];
        const v = getEventVisuals(first.subject_name);
        const more = rows.length - 1;
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

  const openCreate = () => {
    setCreateEntryInitialTab('event');
    setSubjectAddTarget(null);
    setCreateEntryOpen(true);
  };

  const openEditFacilityEvent = (ev: FacilityEventItem) => {
    if (ev.sourceTable !== 'facility_events') {
      Alert.alert('Hinweis', 'Kurse/AG bearbeiten Sie bitte in der Web-App.');
      return;
    }
    setEditingId(ev.id);
    setTitle(String(ev.title || ''));
    setDescription(String(ev.description ?? ''));
    setAllDay(!!ev.all_day);
    const from = new Date(ev.start_date);
    const to = new Date(ev.end_date);
    setStartDate(from);
    setEndDate(to);
    setStartTime(
      ev.all_day || !ev.start_time ? '09:00' : String(ev.start_time).slice(0, 5)
    );
    setEndTime(ev.all_day || !ev.end_time ? '10:00' : String(ev.end_time).slice(0, 5));
    setLocation(String(ev.location ?? ''));
    setCategory(String(ev.category ?? 'general'));
    setColor(getFacilityEventVisuals(ev).colorHex);
    setEditTargetClasses(
      ev.target_classes && ev.target_classes.length > 0 ? new Set(ev.target_classes) : new Set(classes)
    );
    setEditCancelMeal(!!ev.cancel_meal);
    setEditEventOpen(true);
  };

  const saveEvent = async () => {
    try {
      if (!scheduleFacilityId || !selectedAcademicYearId) return;
      if (!editingId) return;
      setError(null);
      const pad = (n: number) => String(n).padStart(2, '0');
      const toDateStr = (d: Date) =>
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const toTimeStr = (t: string) => (t && t.length >= 5 ? `${t.slice(0, 5)}:00` : null);

      const payload = {
        title: title.trim() || 'Ohne Titel',
        description: description.trim() || null,
        start_date: toDateStr(startDate),
        end_date: toDateStr(endDate),
        start_time: allDay ? null : toTimeStr(startTime),
        end_time: allDay ? null : toTimeStr(endTime),
        all_day: allDay,
        location: location.trim() || null,
        color,
        category: category.trim() || 'general',
        target_classes: Array.from(editTargetClasses),
        cancel_meal: editCancelMeal,
      };

      const { error: uErr } = await supabase.from('facility_events').update(payload).eq('id', editingId);
      if (uErr) throw uErr;
      setEditEventOpen(false);
      await loadFacilityEvents();
    } catch (e: any) {
      setError(e?.message || 'Termin konnte nicht gespeichert werden');
    }
  };

  const deleteEvent = async () => {
    try {
      if (!editingId) return;
      setError(null);
      const { error: dErr } = await supabase.from('facility_events').delete().eq('id', editingId);
      if (dErr) throw dErr;
      setEditEventOpen(false);
      await loadFacilityEvents();
    } catch (e: any) {
      setError(e?.message || 'Termin konnte nicht gelöscht werden');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setError(null);
    await bootstrapScope();
    await loadAssignments();
    await loadFacilityEvents();
    setRefreshing(false);
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
    const teacher = r.teacher_id ? staffNameById.get(r.teacher_id) || '—' : '—';
    const room = r.room || '—';
    const v = getEventVisuals(r.subject_name);
    setPreviewData({
      title: r.subject_name,
      category: v.category,
      accentColor: v.colorHex,
      dateLabel,
      timeLabel: `${r.period_start}–${r.period_end}`,
      classes: clsLabel,
      teacher,
      room,
    });
  };

  const showFacilityPreview = (ev: FacilityEventItem, dayIndex: number, start: string, end: string) => {
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

  // Month-view preview helpers — take a Date directly so the date label is
  // correct regardless of the current week-anchored `weekOf` state.
  const showFacilityPreviewForDate = (ev: FacilityEventItem, day: Date) => {
    haptics.tap();
    const dateLabel = format(day, 'dd.MM.yyyy', { locale: de });
    const v = getFacilityEventVisuals(ev);
    const classesLabel =
      (ev.target_classes || []).length > 0 ? (ev.target_classes || []).join(', ') : 'Alle Klassen';
    const start = String(ev.start_time || '').slice(0, 5);
    const end = String(ev.end_time || '').slice(0, 5);
    setPreviewData({
      title: ev.title,
      category: v.category,
      accentColor: v.colorHex,
      dateLabel,
      timeLabel: ev.all_day || !start ? 'Ganztägig' : `${start}–${end}`,
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
    const teacher = r.teacher_id ? staffNameById.get(r.teacher_id) || '—' : '—';
    const room = r.room || '—';
    setPreviewData({
      title: r.subject_name,
      category: v.category,
      accentColor: v.colorHex,
      dateLabel,
      timeLabel: `${r.period_start}–${r.period_end}`,
      classes: clsLabel,
      teacher,
      room,
    });
  };

  const gridMinWidth = TIME_COL_W + 5 * DAY_MIN_W;
  /** Month grid: nearly full content width (root has paddingHorizontal 16). */
  const cellSize = Math.min(72, Math.floor((width - 32) / 7));

  const selectedYearLabel =
    academicYearOptions.find((y) => y.id === selectedAcademicYearId)?.label || 'Schuljahr';

  const perspectiveTabs: Array<{ id: PlanPerspective; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { id: 'school', label: 'Schule', icon: 'school-outline' },
    { id: 'class', label: classTabLabel, icon: 'people-outline' },
    { id: 'teacher', label: 'Personal', icon: 'person-outline' },
    { id: 'child', label: 'Kinder', icon: 'happy-outline' },
    { id: 'room', label: 'Räume', icon: 'cube-outline' },
  ];

  const renderCalendarLegend = () => (
    <View
      {...makeAnchorProps('legend')}
      style={styles.legendBar}
    >
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
  );

  if (loading && !scope) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + SCREEN_HEADER_TOP_PAD, paddingBottom: rootBottomPad }]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + SCREEN_HEADER_TOP_PAD, paddingBottom: rootBottomPad }]}>
      <View style={styles.mainColumn}>
      <View style={[styles.headerRow, isMobile && { marginBottom: 6 }]}>
        <Text style={[styles.h1, isMobile && { fontSize: 18 }]} numberOfLines={1}>
          Kalender
        </Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={startCalendarTour}
            style={[styles.iconBtn, isMobile && calMobileStyles.headerIconBtn]}
            accessibilityLabel="Kalenderhilfe"
            hitSlop={8}
          >
            <Ionicons name="help-circle-outline" size={isMobile ? 20 : 22} color="#374151" />
          </TouchableOpacity>
          {/* Settings icon — mobile only (tablet keeps it in the toolbar row below). */}
          {isMobile && canSettings ? (
            <View {...makeAnchorProps('settings')}>
              <TouchableOpacity
                onPress={() => {
                  if (!selectedAcademicYearId) {
                    Alert.alert('Schuljahr', 'Bitte wählen Sie zuerst ein Schuljahr aus (oben rechts).');
                    return;
                  }
                  router.push({
                    pathname: '/plan-settings',
                    params: {
                      facilityId: scheduleFacilityId,
                      academicYearId: selectedAcademicYearId,
                    },
                  });
                }}
                style={calMobileStyles.headerIconBtn}
                accessibilityLabel="Einstellungen"
                hitSlop={8}
              >
                <Ionicons name="settings-outline" size={20} color="#374151" />
              </TouchableOpacity>
            </View>
          ) : null}
          <TouchableOpacity
            onPress={() => setYearPickerOpen(true)}
            style={[styles.yearChip, isMobile && { maxWidth: 140, paddingHorizontal: 8, paddingVertical: 8 }]}
            accessibilityLabel="Schuljahr auswählen"
          >
            <Text style={styles.yearChipText} numberOfLines={1}>
              {selectedYearLabel}
            </Text>
            <Ionicons name="chevron-down" size={16} color="#374151" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.toolbarRow}>
        <View
          {...makeAnchorProps('perspective')}
          style={[styles.tabsScroll, isMobile && calMobileStyles.tabsScrollMobile]}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsRow}
          >
            {perspectiveTabs.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                onPress={() => setPerspective(tab.id)}
                style={[styles.perspectiveTab, perspective === tab.id && styles.perspectiveTabActive]}
              >
                <Ionicons
                  name={tab.icon}
                  size={14}
                  color={perspective === tab.id ? '#fff' : '#6b7280'}
                />
                <Text style={[styles.perspectiveTabText, perspective === tab.id && styles.perspectiveTabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        {!isMobile && (
          <View style={styles.toolbarRight}>
            {canSettings ? (
              <View {...makeAnchorProps('settings')}>
                <TouchableOpacity
                  onPress={() => {
                    if (!selectedAcademicYearId) {
                      Alert.alert('Schuljahr', 'Bitte wählen Sie zuerst ein Schuljahr aus (oben rechts).');
                      return;
                    }
                    router.push({
                      pathname: '/plan-settings',
                      params: {
                        facilityId: scheduleFacilityId,
                        academicYearId: selectedAcademicYearId,
                      },
                    });
                  }}
                  style={styles.iconBtn}
                  accessibilityLabel="Einstellungen"
                >
                  <Ionicons name="settings-outline" size={22} color="#374151" />
                </TouchableOpacity>
              </View>
            ) : null}
            <View {...makeAnchorProps('add')}>
              <TouchableOpacity
                style={styles.addEntryBtn}
                onPress={() => openCreate()}
                accessibilityLabel="Eintrag hinzufügen"
              >
                <Text style={styles.addEntryBtnText}>Eintrag hinzufügen</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Mobile: "+ Neu" button on its own right-aligned row below the tabs. */}
      {isMobile && (
        <View style={calMobileStyles.addRow}>
          <View {...makeAnchorProps('add')}>
            <TouchableOpacity
              style={calMobileStyles.addBtnMobile}
              onPress={() => openCreate()}
              accessibilityLabel="Eintrag hinzufügen"
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={calMobileStyles.addBtnMobileText}>Eintrag hinzufügen</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {entityOptions.length > 0 && perspective !== 'school' ? (
        <TouchableOpacity style={styles.entitySelect} onPress={() => setEntityPickerOpen(true)}>
          <Text style={styles.entitySelectText} numberOfLines={1}>
            {selectedEntityId
              ? entityOptions.find((e) => e.id === selectedEntityId)?.name || 'Auswählen…'
              : 'Auswählen…'}
          </Text>
          <Ionicons name="chevron-down" size={18} color="#374151" />
        </TouchableOpacity>
      ) : null}

      <View
        {...makeAnchorProps('nav')}
        style={styles.navBar}
      >
        <View style={styles.navLeft}>
          <TouchableOpacity
            style={styles.navPill}
            onPress={() => {
              const today = new Date();
              setWeekOf(formatLocalYYYYMMDD(getMonday(today)));
              setMonthAnchor(startOfMonth(today));
            }}
          >
            <Text style={styles.navPillText}>Heute</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if (viewMode === 'week') {
                setWeekOf(formatLocalYYYYMMDD(addDays(currentMonday, -7)));
              } else {
                // Step exactly one calendar month back. Set monthAnchor first
                // so the grid updates predictably; sync weekOf for the period
                // label.
                const prevMonthFirst = startOfMonth(
                  new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() - 1, 1)
                );
                setMonthAnchor(prevMonthFirst);
                setWeekOf(formatLocalYYYYMMDD(getMonday(prevMonthFirst)));
              }
            }}
          >
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if (viewMode === 'week') {
                setWeekOf(formatLocalYYYYMMDD(addDays(currentMonday, 7)));
              } else {
                const nextMonthFirst = startOfMonth(
                  new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1)
                );
                setMonthAnchor(nextMonthFirst);
                setWeekOf(formatLocalYYYYMMDD(getMonday(nextMonthFirst)));
              }
            }}
          >
            <Ionicons name="chevron-forward" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.periodLabel}>{periodLabel}</Text>
        </View>
        <View style={styles.segment}>
          <TouchableOpacity
            onPress={() => {
              if (viewMode !== 'week') haptics.selection();
              setViewMode('week');
            }}
            style={[styles.segmentBtn, viewMode === 'week' && styles.segmentBtnActive]}
          >
            <Text style={[styles.segmentText, viewMode === 'week' && styles.segmentTextActive]}>Woche</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if (viewMode !== 'month') haptics.selection();
              setViewMode('month');
            }}
            style={[styles.segmentBtn, viewMode === 'month' && styles.segmentBtnActive]}
          >
            <Text style={[styles.segmentText, viewMode === 'month' && styles.segmentTextActive]}>Monat</Text>
          </TouchableOpacity>
        </View>
      </View>

      {assignmentsLoading && viewMode === 'week' ? (
        <ActivityIndicator style={{ marginVertical: 16 }} />
      ) : null}

      {error ? <Text style={styles.err}>{error}</Text> : null}
      {!selectedAcademicYearId ? (
        <Text style={styles.err}>Kein Schuljahr ausgewählt.</Text>
      ) : null}

      {viewMode === 'week' ? (
        <ScrollView
          style={styles.calendarScroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ paddingBottom: 8 }}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            contentContainerStyle={{ paddingBottom: 0 }}
          >
            <View
              style={{ minWidth: Math.max(gridMinWidth, width - 16) }}
              {...makeAnchorProps('grid')}
            >
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
                            const start = String(ev.start_time || '').slice(0, 5);
                            const end = String(ev.end_time || '').slice(0, 5);
                            return (
                              <TouchableOpacity
                                key={`fallback-ev-${ev.id}-${di}`}
                                activeOpacity={0.85}
                                onPress={() => {
                                  const dayDate = parseISODateLocal(dateKey || '');
                                  showFacilityPreviewForDate(ev, dayDate);
                                }}
                                onLongPress={() => openEditFacilityEvent(ev)}
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
                                {!ev.all_day && start ? (
                                  <Text style={styles.eventSub} numberOfLines={1}>
                                    {start}
                                    {end ? ` – ${end}` : ''}
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
              timeSlots.map((start, rowIndex) => {
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
                                    onPress={() => showFacilityPreview(fr.ev, di, fr.start, fr.end)}
                                    onLongPress={() => openEditFacilityEvent(fr.ev)}
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
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.calendarScroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={isWide ? styles.listWide : styles.monthScrollContent}
        >
          {/* Month chevrons + label live in the top navBar; the previous
              duplicate row that lived here has been removed to keep a single
              source of truth for view-mode navigation. */}
          <View style={styles.weekRow}>
            {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => (
              <Text key={w} style={[styles.weekHdr, { width: cellSize }]}>
                {w}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
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
        </ScrollView>
      )}
      </View>
      {renderCalendarLegend()}

      <CalendarTourModal
        visible={tourIndex !== null}
        steps={tourSteps}
        stepIndex={tourIndex ?? 0}
        holeRect={tourHoleRect}
        onClose={closeCalendarTour}
        onNext={() =>
          setTourIndex((i) => (i != null ? Math.min(i + 1, tourSteps.length - 1) : 0))
        }
        onPrev={() => setTourIndex((i) => (i != null ? Math.max(i - 1, 0) : 0))}
      />

      <Modal visible={yearPickerOpen} transparent animationType="fade">
        <Pressable style={styles.pickBackdrop} onPress={() => setYearPickerOpen(false)}>
          <Pressable style={styles.pickSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.pickTitle}>Schuljahr</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {academicYearOptions.map((y) => (
                <TouchableOpacity
                  key={y.id}
                  style={styles.pickRow}
                  onPress={() => {
                    setSelectedAcademicYearId(y.id);
                    setYearPickerOpen(false);
                  }}
                >
                  <Text style={styles.pickRowText}>{y.label}</Text>
                  {y.id === selectedAcademicYearId ? <Ionicons name="checkmark" size={20} color="#111827" /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={entityPickerOpen} transparent animationType="fade">
        <Pressable style={styles.pickBackdrop} onPress={() => setEntityPickerOpen(false)}>
          <Pressable style={styles.pickSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.pickTitle}>Auswahl</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {entityOptions.map((e) => (
                <TouchableOpacity
                  key={e.id}
                  style={styles.pickRow}
                  onPress={() => {
                    setSelectedEntityId(e.id);
                    setEntityPickerOpen(false);
                  }}
                >
                  <Text style={styles.pickRowText}>{e.name}</Text>
                  {e.id === selectedEntityId ? <Ionicons name="checkmark" size={20} color="#111827" /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

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

            {previewData?.teacher ? (
              <View style={styles.previewRow}>
                <Ionicons name="person-outline" size={18} color="#6b7280" style={styles.previewIcon} />
                <Text style={styles.previewLabel}>Personal</Text>
                <Text style={styles.previewValue}>{previewData.teacher}</Text>
              </View>
            ) : null}

            {previewData?.room ? (
              <View style={styles.previewRow}>
                <Ionicons name="location-outline" size={18} color="#6b7280" style={styles.previewIcon} />
                <Text style={styles.previewLabel}>Raum</Text>
                <Text style={styles.previewValue}>{previewData.room}</Text>
              </View>
            ) : null}

            {previewData?.cancelMeal ? (
              <View style={styles.previewRow}>
                <Ionicons name="warning-outline" size={18} color="#b45309" style={styles.previewIcon} />
                <Text style={[styles.previewValue, { color: '#b45309' }]}>Verpflegung storniert</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      <CalendarCreateEntryModal
        visible={createEntryOpen}
        onClose={() => setCreateEntryOpen(false)}
        classes={classes}
        roomOptions={roomOptions}
        paymentsEnabled={paymentsEnabled}
        initialTab={createEntryInitialTab}
        subjectTarget={subjectAddTarget}
        selectedClassFallback={selectedClass || selectedEntityId || classes[0] || ''}
        timeSlotOptions={timeSlotOptions}
        onCreateEvent={handleCreateEntryEvent}
        onCreateCourse={handleCreateEntryCourse}
        onCreateSubject={handleCreateEntrySubject}
        loadEligibleChildren={loadEligibleChildren}
        loadSubjectOptions={loadSubjectOptionsForClass}
      />

      <Modal visible={editRoomPickerOpen} transparent animationType="fade">
        <Pressable style={styles.pickBackdrop} onPress={() => setEditRoomPickerOpen(false)}>
          <Pressable style={styles.pickSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.pickTitle}>Raum</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              <TouchableOpacity
                style={styles.pickRow}
                onPress={() => {
                  setLocation('');
                  setEditRoomPickerOpen(false);
                }}
              >
                <Text style={styles.pickRowText}>Kein Raum</Text>
              </TouchableOpacity>
              {roomOptions.map((ro) => (
                <TouchableOpacity
                  key={ro}
                  style={styles.pickRow}
                  onPress={() => {
                    setLocation(ro);
                    setEditRoomPickerOpen(false);
                  }}
                >
                  <Text style={styles.pickRowText}>{ro}</Text>
                  {location === ro ? <Ionicons name="checkmark" size={20} color="#111827" /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={editEventOpen} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setEditEventOpen(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalKb}
          >
            <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>Termin bearbeiten</Text>
              <TextInput style={styles.input} placeholder="Titel" value={title} onChangeText={setTitle} />
              <TextInput
                style={[styles.input, styles.inputMulti]}
                placeholder="Beschreibung"
                value={description}
                onChangeText={setDescription}
                multiline
              />
              <View style={styles.rowBetween}>
                <Text>Ganztägig</Text>
                <Switch value={allDay} onValueChange={setAllDay} />
              </View>
              {!allDay ? (
                <View style={styles.timeRow}>
                  <Text style={styles.lbl}>Start</Text>
                  <TextInput style={styles.timeInput} value={startTime} onChangeText={setStartTime} />
                  <Text style={styles.lbl}>Ende</Text>
                  <TextInput style={styles.timeInput} value={endTime} onChangeText={setEndTime} />
                </View>
              ) : null}
              <TouchableOpacity style={styles.dateBtn} onPress={() => setPickerTarget('start')}>
                <Text style={styles.dateBtnText}>Start: {format(startDate, 'dd.MM.yyyy', { locale: de })}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setPickerTarget('end')}>
                <Text style={styles.dateBtnText}>Ende: {format(endDate, 'dd.MM.yyyy', { locale: de })}</Text>
              </TouchableOpacity>
              {pickerTarget ? (
                <DateTimePicker
                  value={pickerTarget === 'start' ? startDate : endDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(ev, date) => {
                    if (Platform.OS === 'android') setPickerTarget(null);
                    if (ev.type === 'dismissed') return;
                    if (!date) return;
                    if (pickerTarget === 'start') setStartDate(date);
                    else setEndDate(date);
                  }}
                />
              ) : null}
              {Platform.OS === 'ios' && pickerTarget ? (
                <TouchableOpacity onPress={() => setPickerTarget(null)}>
                  <Text style={styles.donePicker}>Fertig</Text>
                </TouchableOpacity>
              ) : null}
              <Text style={styles.editSectionLabel}>Raum (optional)</Text>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setEditRoomPickerOpen(true)}>
                <Text style={styles.dateBtnText}>{location.trim() ? location : 'Raum wählen'}</Text>
              </TouchableOpacity>
              <Text style={styles.editSectionLabel}>Klassen</Text>
              <View style={styles.editClassGrid}>
                <TouchableOpacity
                  style={styles.editClassRow}
                  onPress={() => {
                    if (classes.length > 0 && editTargetClasses.size === classes.length) {
                      setEditTargetClasses(new Set());
                    } else {
                      setEditTargetClasses(new Set(classes));
                    }
                  }}
                >
                  <View style={[styles.editCheck, classes.length > 0 && editTargetClasses.size === classes.length && styles.editCheckOn]}>
                    {classes.length > 0 && editTargetClasses.size === classes.length ? (
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    ) : null}
                  </View>
                  <Text style={styles.editClassText}>Alle Klassen</Text>
                </TouchableOpacity>
                {classes.map((cls) => (
                  <TouchableOpacity
                    key={`edit-cls-${cls}`}
                    style={styles.editClassRow}
                    onPress={() => {
                      setEditTargetClasses((prev) => {
                        const n = new Set(prev);
                        if (n.has(cls)) n.delete(cls);
                        else n.add(cls);
                        return n;
                      });
                    }}
                  >
                    <View style={[styles.editCheck, editTargetClasses.has(cls) && styles.editCheckOn]}>
                      {editTargetClasses.has(cls) ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                    </View>
                    <Text style={styles.editClassText}>{cls}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.rowBetween}>
                <Text style={{ flex: 1, paddingRight: 8 }}>Essen absagen für betroffene Kinder</Text>
                <Switch value={editCancelMeal} onValueChange={setEditCancelMeal} />
              </View>
              <TextInput style={styles.input} placeholder="Kategorie" value={category} onChangeText={setCategory} />
              <TextInput style={styles.input} placeholder="Farbe (hex)" value={color} onChangeText={setColor} />

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.btnDanger} onPress={deleteEvent}>
                  <Text style={styles.btnDangerText}>Löschen</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnSecondary} onPress={() => setEditEventOpen(false)}>
                  <Text>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnPrimary} onPress={saveEvent}>
                  <Text style={styles.btnPrimaryText}>Speichern</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16, backgroundColor: '#f9fafb' },
  mainColumn: { flex: 1 },
  calendarScroll: { flex: 1 },
  headerRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  h1: {
    flex: 1,
    minWidth: 0,
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    marginLeft: 'auto',
  },
  iconBtn: { padding: 6 },
  yearChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff',
    maxWidth: 200,
  },
  yearChipText: { fontSize: 13, color: '#111827', fontWeight: '500' },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  tabsScroll: { flex: 1, minWidth: 0 },
  tabsRow: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  toolbarRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  perspectiveTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    marginRight: -1,
  },
  perspectiveTabActive: { backgroundColor: '#111827', borderColor: '#111827' },
  perspectiveTabText: { fontSize: 11, fontWeight: '600', color: '#6b7280' },
  perspectiveTabTextActive: { color: '#fff' },
  entitySelect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  entitySelectText: { fontSize: 14, color: '#111827', flex: 1, marginRight: 8 },
  addEntryBtn: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addEntryBtnText: { fontSize: 13, fontWeight: '600', color: '#111827' },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  navLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, flexWrap: 'wrap', gap: 4 },
  navPill: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#fff',
  },
  navPillText: { fontSize: 12, fontWeight: '600', color: '#111827' },
  periodLabel: { fontSize: 13, fontWeight: '600', color: '#111827', marginLeft: 4, flexShrink: 1 },
  segment: { flexDirection: 'row', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, overflow: 'hidden' },
  segmentBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#fff' },
  segmentBtnActive: { backgroundColor: '#111827' },
  segmentText: { fontSize: 11, fontWeight: '600', color: '#6b7280' },
  segmentTextActive: { color: '#fff' },
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
  err: { color: '#111827', marginBottom: 8 },
  legendBar: {
    width: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    paddingTop: 8,
    paddingBottom: 2,
    marginTop: 4,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    rowGap: 6,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: '#6b7280' },
  listWide: { maxWidth: 900, alignSelf: 'center', width: '100%', paddingBottom: 12 },
  monthScrollContent: { paddingBottom: 12 },
  // Event-detail bottom sheet
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
  weekRow: { flexDirection: 'row', marginTop: 4 },
  weekHdr: { textAlign: 'center', fontSize: 12, color: '#6b7280', fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
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
  cellMonthClosing: {
    backgroundColor: '#fef2f2',
  },
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
  cellMuted: { backgroundColor: '#f3f4f6' },
  cellSel: { backgroundColor: '#F1F5F9', borderColor: '#111827' },
  cellNum: { fontSize: 16, fontWeight: '600', color: '#111827', alignSelf: 'flex-start' },
  cellNumMuted: { color: '#9ca3af' },
  cellNumSel: { color: '#111827' },
  pickBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  pickSheet: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  pickTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  pickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  pickRowText: { fontSize: 16, color: '#111827' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalKb: { width: '100%' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '92%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    fontSize: 16,
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  lbl: { fontSize: 14, color: '#374151' },
  timeInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 8,
    width: 72,
    fontSize: 15,
  },
  dateBtn: { padding: 12, backgroundColor: '#f3f4f6', borderRadius: 10, marginBottom: 8 },
  dateBtnText: { fontSize: 15, color: '#111827' },
  donePicker: { textAlign: 'center', color: '#111827', fontWeight: '600', marginVertical: 8 },
  modalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16, justifyContent: 'flex-end' },
  btnPrimary: { backgroundColor: '#111827', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10 },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },
  btnSecondary: { paddingVertical: 12, paddingHorizontal: 14 },
  btnDanger: { paddingVertical: 12, paddingHorizontal: 14, marginRight: 'auto' },
  btnDangerText: { color: '#111827', fontWeight: '600' },
  editSectionLabel: { fontSize: 13, fontWeight: '600', color: '#111827', marginBottom: 6, marginTop: 4 },
  editClassGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  editClassRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '48%' },
  editCheck: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editCheckOn: { backgroundColor: '#111827', borderColor: '#111827' },
  editClassText: { fontSize: 14, color: '#111827', flex: 1 },
});

const calMobileStyles = StyleSheet.create({
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsScrollMobile: {
    width: '100%',
    flexGrow: 1,
    marginBottom: 8,
  },
  addRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  addBtnMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#111827',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  addBtnMobileText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
