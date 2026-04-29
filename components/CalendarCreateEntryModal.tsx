import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import type { SubjectOptionRow } from '@/lib/loadCalendarSubjectOptions';
import { formatLocalYYYYMMDD, parseISODateLocal } from '@/lib/studentPlanCalendar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DateTimePickerSheet } from './shared/DateTimePickerSheet';

const NONE_VALUE = '__none__';

export type EventCreateFormData = {
  title: string;
  description: string;
  allDay: boolean;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  room: string;
  cancelMeal: boolean;
  selectedClasses: string[];
};

export type CourseSessionForm = {
  date: string;
  startTime: string;
  endTime: string;
};

export type CourseCreateFormData = {
  title: string;
  description: string;
  sessions: CourseSessionForm[];
  room: string;
  audience: 'none' | 'daycare-only' | 'eaters-only' | 'class-specific';
  restrictedClasses: string[];
  maxParticipants: string;
  price: string;
  taxRate: string;
  billable: boolean;
  cancelMeal: boolean;
};

export type SubjectCreateFormData = {
  target: { dayIndex: number; start: string };
  selectedClass: string;
  parentSubjectId: string;
  childSubjectId: string;
  childSubjectName: string;
  mergeEnabled: boolean;
  selectedClasses: string[];
  subjectOptions: SubjectOptionRow[];
};

type EligibleChild = { id: string; name: string; class: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  classes: string[];
  roomOptions: string[];
  paymentsEnabled: boolean;
  initialTab: 'event' | 'course' | 'subject';
  subjectTarget: { dayIndex: number; start: string } | null;
  selectedClassFallback: string;
  timeSlotOptions: { start: string; end: string }[];
  onCreateEvent: (data: EventCreateFormData) => Promise<void>;
  onCreateCourse: (data: CourseCreateFormData) => Promise<void>;
  onCreateSubject: (data: SubjectCreateFormData) => Promise<void>;
  loadEligibleChildren: () => Promise<EligibleChild[]>;
  loadSubjectOptions: (className: string) => Promise<SubjectOptionRow[]>;
};

const WEEKDAYS = [
  { value: '1', label: 'Montag' },
  { value: '2', label: 'Dienstag' },
  { value: '3', label: 'Mittwoch' },
  { value: '4', label: 'Donnerstag' },
  { value: '5', label: 'Freitag' },
];

const AUDIENCE_OPTIONS: Array<{ value: CourseCreateFormData['audience']; label: string }> = [
  { value: 'none', label: 'Alle' },
  { value: 'daycare-only', label: 'Nur Kinder mit Betreuung' },
  { value: 'eaters-only', label: 'Nur Kinder mit Essen' },
  { value: 'class-specific', label: 'Bestimmte Klassen' },
];

function parseYmd(s: string): Date {
  if (!s || s.length < 10) return new Date();
  return parseISODateLocal(s.slice(0, 10));
}

function combineDateAndHm(ymd: string, hm: string): Date {
  const d = parseYmd(ymd);
  const [hh, mm] = (hm || '12:00').slice(0, 5).split(':').map((x) => parseInt(x, 10));
  d.setHours(Number.isFinite(hh) ? hh : 12, Number.isFinite(mm) ? mm : 0, 0, 0);
  return d;
}

function hmFromDate(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Visible on Android + matches web (switch left, label right). */
const SWITCH_TRACK = { false: '#d1d5db', true: '#111827' } as const;

export default function CalendarCreateEntryModal({
  visible,
  onClose,
  classes,
  roomOptions,
  paymentsEnabled,
  initialTab,
  subjectTarget,
  selectedClassFallback,
  timeSlotOptions,
  onCreateEvent,
  onCreateCourse,
  onCreateSubject,
  loadEligibleChildren,
  loadSubjectOptions,
}: Props) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'event' | 'course' | 'subject'>(initialTab);

  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventAllDay, setEventAllDay] = useState(false);
  const [eventStartDate, setEventStartDate] = useState('');
  const [eventEndDate, setEventEndDate] = useState('');
  const [eventStartTime, setEventStartTime] = useState('08:00');
  const [eventEndTime, setEventEndTime] = useState('12:00');
  const [eventRoom, setEventRoom] = useState('');
  const [eventCancelMeal, setEventCancelMeal] = useState(false);
  const [eventSelectedClasses, setEventSelectedClasses] = useState<Set<string>>(new Set());

  const [courseTitle, setCourseTitle] = useState('');
  const [courseDescription, setCourseDescription] = useState('');
  const [courseSessions, setCourseSessions] = useState<CourseSessionForm[]>(() => {
    const t = formatLocalYYYYMMDD(new Date());
    return [{ date: t, startTime: '14:00', endTime: '15:30' }];
  });
  const [courseRoom, setCourseRoom] = useState('');
  const [courseAudience, setCourseAudience] = useState<CourseCreateFormData['audience']>('none');
  const [courseRestrictedClasses, setCourseRestrictedClasses] = useState<Set<string>>(new Set());
  const [courseMaxParticipants, setCourseMaxParticipants] = useState('');
  const [coursePrice, setCoursePrice] = useState('');
  const [courseTaxRate, setCourseTaxRate] = useState('19');
  const [courseBillable, setCourseBillable] = useState(false);
  const [courseCancelMeal, setCourseCancelMeal] = useState(false);

  const [subjectParentId, setSubjectParentId] = useState('');
  const [subjectPrimaryClass, setSubjectPrimaryClass] = useState('');
  const [subjectChildId, setSubjectChildId] = useState('');
  const [subjectChildName, setSubjectChildName] = useState('');
  const [subjectMergeEnabled, setSubjectMergeEnabled] = useState(false);
  const [subjectSelectedClasses, setSubjectSelectedClasses] = useState<Set<string>>(new Set());
  const [subjectActiveClassTab, setSubjectActiveClassTab] = useState('');
  const [subjectEligibleAll, setSubjectEligibleAll] = useState<EligibleChild[]>([]);
  const [subjectSelectedChildIds, setSubjectSelectedChildIds] = useState<Set<string>>(new Set());
  const [subjectSaving, setSubjectSaving] = useState(false);
  const [subjectDayIndex, setSubjectDayIndex] = useState('1');
  const [subjectStart, setSubjectStart] = useState('');
  const [subjectOptions, setSubjectOptions] = useState<SubjectOptionRow[]>([]);
  const [subjectOptionsLoading, setSubjectOptionsLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [pickerSheet, setPickerSheet] = useState<
    | null
    | { kind: 'eventRoom' | 'courseRoom' | 'courseAudience' | 'courseTax' }
    | { kind: 'subjectClass' | 'subjectDay' | 'subjectSlot' | 'subjectParent' | 'subjectChild'; key: number }
  >(null);

  const [dateFocus, setDateFocus] = useState<null | 'eventStart' | 'eventEnd' | { kind: 'course'; index: number }>(
    null
  );
  const [timeFocus, setTimeFocus] = useState<
    null | 'eventStart' | 'eventEnd' | { kind: 'course'; slot: 'start' | 'end'; index: number }
  >(null);

  useEffect(() => {
    if (!visible) return;
    const today = formatLocalYYYYMMDD(new Date());
    setTab(initialTab);
    setEventTitle('');
    setEventDescription('');
    setEventAllDay(false);
    setEventStartDate(today);
    setEventEndDate(today);
    setEventStartTime('08:00');
    setEventEndTime('12:00');
    setEventRoom('');
    setEventCancelMeal(false);
    setEventSelectedClasses(new Set(classes));

    setCourseTitle('');
    setCourseDescription('');
    setCourseSessions([{ date: today, startTime: '14:00', endTime: '15:30' }]);
    setCourseRoom('');
    setCourseAudience('none');
    setCourseRestrictedClasses(new Set(classes));
    setCourseMaxParticipants('');
    setCoursePrice('');
    setCourseTaxRate('19');
    setCourseBillable(false);
    setCourseCancelMeal(false);

    setSubjectParentId('');
    setSubjectPrimaryClass(selectedClassFallback || classes[0] || '');
    setSubjectChildId('');
    setSubjectChildName('');
    setSubjectMergeEnabled(false);
    setSubjectSelectedClasses(new Set());
    setSubjectActiveClassTab('');
    setSubjectEligibleAll([]);
    setSubjectSelectedChildIds(new Set());
    setSubjectDayIndex(String(subjectTarget?.dayIndex ?? 1));
    setSubjectStart(
      subjectTarget?.start || timeSlotOptions[0]?.start || ''
    );
    setSubjectOptions([]);
  }, [visible, classes, initialTab, subjectTarget, selectedClassFallback, timeSlotOptions]);

  useEffect(() => {
    if (!visible || tab !== 'subject' || !subjectPrimaryClass) {
      return;
    }
    let cancelled = false;
    (async () => {
      setSubjectOptionsLoading(true);
      try {
        const opts = await loadSubjectOptions(subjectPrimaryClass);
        if (!cancelled) setSubjectOptions(opts);
      } finally {
        if (!cancelled) setSubjectOptionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, tab, subjectPrimaryClass, loadSubjectOptions]);

  const currentSubjectTarget =
    subjectStart.trim().length > 0
      ? { dayIndex: Number(subjectDayIndex), start: subjectStart }
      : null;

  const parentSubjects = useMemo(
    () => subjectOptions.filter((s) => !s.is_break && !s.parent_subject_id),
    [subjectOptions]
  );

  const childSubjectsForParent = useMemo(() => {
    if (!subjectParentId) return [];
    return subjectOptions.filter((c) => c.parent_subject_id === subjectParentId);
  }, [subjectOptions, subjectParentId]);

  const toggleEventClass = useCallback((cls: string, checked: boolean) => {
    setEventSelectedClasses((prev) => {
      const next = new Set(prev);
      if (checked) next.add(cls);
      else next.delete(cls);
      return next;
    });
  }, []);

  const toggleCourseClass = useCallback((cls: string, checked: boolean) => {
    setCourseRestrictedClasses((prev) => {
      const next = new Set(prev);
      if (checked) next.add(cls);
      else next.delete(cls);
      return next;
    });
  }, []);

  const runCreateEvent = async () => {
    if (!eventTitle.trim() || !eventStartDate) {
      Alert.alert('Hinweis', 'Bitte Titel und Startdatum ausfüllen.');
      return;
    }
    setSaving(true);
    try {
      await onCreateEvent({
        title: eventTitle,
        description: eventDescription,
        allDay: eventAllDay,
        startDate: eventStartDate,
        endDate: eventEndDate,
        startTime: eventStartTime,
        endTime: eventEndTime,
        room: eventRoom,
        cancelMeal: eventCancelMeal,
        selectedClasses: Array.from(eventSelectedClasses),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const runCreateCourse = async () => {
    if (!courseTitle.trim() || !Array.isArray(courseSessions) || courseSessions.length === 0) {
      Alert.alert('Hinweis', 'Bitte Titel und mindestens einen Termin ausfüllen.');
      return;
    }
    const sanitized = courseSessions
      .map((session) => ({
        date: String(session.date || ''),
        startTime: String(session.startTime || ''),
        endTime: String(session.endTime || ''),
      }))
      .filter((session) => session.date && session.startTime && session.endTime)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (sanitized.length === 0) {
      Alert.alert('Hinweis', 'Bitte für jeden Termin Datum, Startzeit und Endzeit ausfüllen.');
      return;
    }
    if (sanitized.some((s) => s.endTime <= s.startTime)) {
      Alert.alert('Hinweis', 'Bei jedem Termin muss die Endzeit nach der Startzeit liegen.');
      return;
    }
    setSaving(true);
    try {
      await onCreateCourse({
        title: courseTitle,
        description: courseDescription,
        sessions: sanitized,
        room: courseRoom,
        audience: courseAudience,
        restrictedClasses: Array.from(courseRestrictedClasses),
        maxParticipants: courseMaxParticipants,
        price: coursePrice,
        taxRate: courseTaxRate,
        billable: courseBillable,
        cancelMeal: courseCancelMeal,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const runCreateSubject = async () => {
    if (!currentSubjectTarget || !subjectParentId) return;
    setSubjectSaving(true);
    try {
      await onCreateSubject({
        target: currentSubjectTarget,
        selectedClass: subjectPrimaryClass,
        parentSubjectId: subjectParentId,
        childSubjectId: subjectChildId,
        childSubjectName: subjectChildName,
        mergeEnabled: subjectMergeEnabled,
        selectedClasses: Array.from(subjectSelectedClasses),
        subjectOptions,
      });
      onClose();
    } finally {
      setSubjectSaving(false);
    }
  };

  const renderCheckboxRow = (
    checked: boolean,
    onPress: () => void,
    label: string,
    wide?: boolean
  ) => (
    <TouchableOpacity
      style={[styles.checkRow, wide && styles.checkRowWide]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.checkBox, checked && styles.checkBoxOn]}>
        {checked ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      {...(Platform.OS === 'ios' ? ({ presentationStyle: 'fullScreen' } as const) : {})}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fullScreenRoot}
      >
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          <View style={[styles.sheetHeader, { paddingTop: Math.max(insets.top, 12) }]}>
            <Text style={styles.sheetTitle}>Eintrag hinzufügen</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={26} color="#374151" />
            </TouchableOpacity>
          </View>

          <View style={styles.tabRow}>
            {(['event', 'course', 'subject'] as const).map((k) => (
              <TouchableOpacity
                key={k}
                onPress={() => setTab(k)}
                style={[styles.tabBtn, tab === k && styles.tabBtnOn]}
              >
                <Text style={[styles.tabBtnText, tab === k && styles.tabBtnTextOn]}>
                  {k === 'event' ? 'Veranstaltung' : k === 'course' ? 'Kurs / AG' : 'Unterricht'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView
            style={styles.scroll}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {tab === 'event' ? (
              <View style={styles.section}>
                <Text style={styles.lbl}>Titel</Text>
                <TextInput
                  style={styles.input}
                  placeholder="z.B. Wandertag"
                  value={eventTitle}
                  onChangeText={setEventTitle}
                />
                <Text style={styles.lbl}>Beschreibung (optional)</Text>
                <TextInput
                  style={[styles.input, styles.inputMulti]}
                  placeholder=""
                  value={eventDescription}
                  onChangeText={setEventDescription}
                  multiline
                />
                <View style={[styles.switchRow, styles.switchRowFirst]}>
                  <Switch
                    value={eventAllDay}
                    onValueChange={setEventAllDay}
                    trackColor={SWITCH_TRACK}
                    thumbColor="#fff"
                    ios_backgroundColor="#d1d5db"
                  />
                  <Text style={styles.switchLabel}>Ganztägig</Text>
                </View>
                <View style={styles.twoCol}>
                  <View style={styles.col}>
                    <Text style={styles.lbl}>Startdatum</Text>
                    <TouchableOpacity style={styles.fakeInput} onPress={() => setDateFocus('eventStart')}>
                      <Text>{format(parseYmd(eventStartDate), 'dd.MM.yyyy', { locale: de })}</Text>
                      <Ionicons name="calendar-outline" size={18} color="#6b7280" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.lbl}>Startzeit</Text>
                    <TouchableOpacity
                      style={[styles.fakeInput, eventAllDay && styles.fakeInputDisabled]}
                      disabled={eventAllDay}
                      onPress={() => !eventAllDay && setTimeFocus('eventStart')}
                    >
                      <Text style={eventAllDay ? { color: '#9ca3af' } : undefined}>{eventStartTime}</Text>
                      <Ionicons name="time-outline" size={18} color="#6b7280" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.lbl}>Enddatum (optional)</Text>
                    <TouchableOpacity style={styles.fakeInput} onPress={() => setDateFocus('eventEnd')}>
                      <Text>{format(parseYmd(eventEndDate), 'dd.MM.yyyy', { locale: de })}</Text>
                      <Ionicons name="calendar-outline" size={18} color="#6b7280" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.lbl}>Endzeit</Text>
                    <TouchableOpacity
                      style={[styles.fakeInput, eventAllDay && styles.fakeInputDisabled]}
                      disabled={eventAllDay}
                      onPress={() => !eventAllDay && setTimeFocus('eventEnd')}
                    >
                      <Text style={eventAllDay ? { color: '#9ca3af' } : undefined}>{eventEndTime}</Text>
                      <Ionicons name="time-outline" size={18} color="#6b7280" />
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={styles.lbl}>Klassen</Text>
                <View style={styles.classGrid}>
                  {renderCheckboxRow(
                    classes.length > 0 && eventSelectedClasses.size === classes.length,
                    () => {
                      if (eventSelectedClasses.size === classes.length) setEventSelectedClasses(new Set());
                      else setEventSelectedClasses(new Set(classes));
                    },
                    'Alle Klassen',
                    true
                  )}
                  {classes.map((cls) =>
                    renderCheckboxRow(eventSelectedClasses.has(cls), () => {
                      toggleEventClass(cls, !eventSelectedClasses.has(cls));
                    }, cls)
                  )}
                </View>

                <Text style={styles.lbl}>Raum (optional)</Text>
                <TouchableOpacity style={styles.fakeInput} onPress={() => setPickerSheet({ kind: 'eventRoom' })}>
                  <Text style={!eventRoom ? { color: '#9ca3af' } : undefined}>
                    {eventRoom || 'Raum wählen'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#6b7280" />
                </TouchableOpacity>

                <View style={styles.switchRow}>
                  <Switch
                    value={eventCancelMeal}
                    onValueChange={setEventCancelMeal}
                    trackColor={SWITCH_TRACK}
                    thumbColor="#fff"
                    ios_backgroundColor="#d1d5db"
                  />
                  <Text style={styles.switchLabel}>Essen absagen für betroffene Kinder</Text>
                </View>

                <View style={styles.footerRow}>
                  <TouchableOpacity style={styles.btnSecondary} onPress={onClose}>
                    <Text style={styles.btnSecondaryText}>Abbrechen</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnPrimary, saving && styles.btnDisabled]}
                    disabled={saving}
                    onPress={runCreateEvent}
                  >
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Speichern</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {tab === 'course' ? (
              <View style={styles.section}>
                <Text style={styles.lbl}>Titel</Text>
                <TextInput
                  style={styles.input}
                  placeholder="z.B. Töpferkurs"
                  value={courseTitle}
                  onChangeText={setCourseTitle}
                />
                <Text style={styles.lbl}>Beschreibung</Text>
                <TextInput
                  style={[styles.input, styles.inputMulti]}
                  value={courseDescription}
                  onChangeText={setCourseDescription}
                  multiline
                />
                <Text style={styles.lbl}>Termine</Text>
                {courseSessions.map((session, idx) => (
                  <View key={`cs-${idx}`} style={styles.courseSessionCard}>
                    <View style={styles.courseSessionHeader}>
                      <Text style={styles.courseSessionTitle}>Termin {idx + 1}</Text>
                      {courseSessions.length > 1 ? (
                        <TouchableOpacity
                          onPress={() =>
                            setCourseSessions((prev) => prev.filter((_, i) => i !== idx))
                          }
                          hitSlop={8}
                          accessibilityLabel="Termin entfernen"
                        >
                          <Text style={styles.courseSessionRemove}>x</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    <View style={styles.threeCol}>
                      <View style={styles.col1}>
                        <Text style={styles.lbl}>Datum</Text>
                        <TouchableOpacity
                          style={styles.fakeInput}
                          onPress={() => setDateFocus({ kind: 'course', index: idx })}
                        >
                          <Text>{format(parseYmd(session.date), 'dd.MM.yyyy', { locale: de })}</Text>
                          <Ionicons name="calendar-outline" size={18} color="#6b7280" />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.col1}>
                        <Text style={styles.lbl}>Von</Text>
                        <TouchableOpacity
                          style={styles.fakeInput}
                          onPress={() => setTimeFocus({ kind: 'course', slot: 'start', index: idx })}
                        >
                          <Text>{session.startTime}</Text>
                          <Ionicons name="time-outline" size={18} color="#6b7280" />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.col1}>
                        <Text style={styles.lbl}>Bis</Text>
                        <TouchableOpacity
                          style={styles.fakeInput}
                          onPress={() => setTimeFocus({ kind: 'course', slot: 'end', index: idx })}
                        >
                          <Text>{session.endTime}</Text>
                          <Ionicons name="time-outline" size={18} color="#6b7280" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
                <TouchableOpacity
                  style={styles.addTerminBtn}
                  onPress={() =>
                    setCourseSessions((prev) => [
                      ...prev,
                      {
                        date:
                          prev.length > 0 && prev[prev.length - 1]?.date
                            ? prev[prev.length - 1].date
                            : formatLocalYYYYMMDD(new Date()),
                        startTime: '14:00',
                        endTime: '15:30',
                      },
                    ])
                  }
                  activeOpacity={0.7}
                  accessibilityLabel="Termin hinzufügen"
                >
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={styles.addTerminBtnText}>Termin hinzufügen</Text>
                </TouchableOpacity>

                <Text style={styles.lbl}>Raum (optional)</Text>
                <TouchableOpacity style={styles.fakeInput} onPress={() => setPickerSheet({ kind: 'courseRoom' })}>
                  <Text style={!courseRoom ? { color: '#9ca3af' } : undefined}>
                    {courseRoom || 'Raum wählen'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#6b7280" />
                </TouchableOpacity>

                <Text style={styles.lbl}>Zielgruppe</Text>
                <TouchableOpacity style={styles.fakeInput} onPress={() => setPickerSheet({ kind: 'courseAudience' })}>
                  <Text>{AUDIENCE_OPTIONS.find((a) => a.value === courseAudience)?.label}</Text>
                  <Ionicons name="chevron-down" size={18} color="#6b7280" />
                </TouchableOpacity>

                {courseAudience === 'class-specific' ? (
                  <View style={styles.classGrid}>
                    {classes.map((cls) =>
                      renderCheckboxRow(courseRestrictedClasses.has(cls), () => {
                        toggleCourseClass(cls, !courseRestrictedClasses.has(cls));
                      }, cls)
                    )}
                  </View>
                ) : null}

                <Text style={styles.lbl}>Max. Teilnehmer (optional)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  value={courseMaxParticipants}
                  onChangeText={setCourseMaxParticipants}
                />

                {paymentsEnabled ? (
                  <View style={styles.payBlock}>
                    <View style={styles.twoCol}>
                      <View style={styles.col}>
                        <Text style={styles.lbl}>Preis (€)</Text>
                        <TextInput
                          style={styles.input}
                          keyboardType="decimal-pad"
                          placeholder="z.B. 12.50"
                          value={coursePrice}
                          onChangeText={setCoursePrice}
                        />
                      </View>
                      <View style={styles.col}>
                        <Text style={styles.lbl}>MwSt.</Text>
                        <TouchableOpacity
                          style={styles.fakeInput}
                          onPress={() => setPickerSheet({ kind: 'courseTax' })}
                        >
                          <Text>
                            {courseTaxRate === '0' ? '0%' : courseTaxRate === '7' ? '7%' : '19%'}
                          </Text>
                          <Ionicons name="chevron-down" size={18} color="#6b7280" />
                        </TouchableOpacity>
                      </View>
                    </View>
                    {renderCheckboxRow(courseBillable, () => setCourseBillable(!courseBillable), 
                      'Die Kosten des Kurses/der AG sind über Bildung- und Teilhabe abrechenbar.',
                      true
                    )}
                  </View>
                ) : (
                  <View style={styles.hintBox}>
                    <Text style={styles.hintText}>
                      Preis und MwSt. sind erst verfügbar, wenn Zahlungen in den Einrichtungseinstellungen aktiviert sind.
                    </Text>
                  </View>
                )}

                {renderCheckboxRow(courseCancelMeal, () => setCourseCancelMeal(!courseCancelMeal), 
                  'Essen absagen für teilnehmende Kinder',
                  true
                )}

                <View style={styles.footerRow}>
                  <TouchableOpacity style={styles.btnSecondary} onPress={onClose}>
                    <Text style={styles.btnSecondaryText}>Abbrechen</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnPrimary, saving && styles.btnDisabled]}
                    disabled={saving}
                    onPress={runCreateCourse}
                  >
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Erstellen</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {tab === 'subject' ? (
              <View style={styles.section}>
                <View style={styles.twoCol}>
                  <View style={styles.col}>
                    <Text style={styles.lbl}>Klasse</Text>
                    <TouchableOpacity
                      style={styles.fakeInput}
                      onPress={() => setPickerSheet({ kind: 'subjectClass', key: Date.now() })}
                    >
                      <Text>{subjectPrimaryClass || '—'}</Text>
                      <Ionicons name="chevron-down" size={18} color="#6b7280" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.lbl}>Wochentag</Text>
                    <TouchableOpacity
                      style={styles.fakeInput}
                      onPress={() => setPickerSheet({ kind: 'subjectDay', key: Date.now() })}
                    >
                      <Text>{WEEKDAYS.find((w) => w.value === subjectDayIndex)?.label}</Text>
                      <Ionicons name="chevron-down" size={18} color="#6b7280" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.colFull}>
                    <Text style={styles.lbl}>Zeitfenster</Text>
                    <TouchableOpacity
                      style={styles.fakeInput}
                      onPress={() => setPickerSheet({ kind: 'subjectSlot', key: Date.now() })}
                    >
                      <Text>
                        {subjectStart
                          ? `${subjectStart}${timeSlotOptions.find((t) => t.start === subjectStart)?.end ? ` – ${timeSlotOptions.find((t) => t.start === subjectStart)?.end}` : ''}`
                          : '—'}
                      </Text>
                      <Ionicons name="chevron-down" size={18} color="#6b7280" />
                    </TouchableOpacity>
                  </View>
                </View>

                {subjectOptionsLoading ? (
                  <ActivityIndicator style={{ marginVertical: 12 }} />
                ) : null}

                {currentSubjectTarget && subjectPrimaryClass ? (
                  <>
                    <Text style={styles.lbl}>Fach</Text>
                    <TouchableOpacity
                      style={styles.fakeInput}
                      onPress={() => setPickerSheet({ kind: 'subjectParent', key: Date.now() })}
                    >
                      <Text style={!subjectParentId ? { color: '#9ca3af' } : undefined}>
                        {parentSubjects.find((p) => p.id === subjectParentId)?.name || 'Fach wählen…'}
                      </Text>
                      <Ionicons name="chevron-down" size={18} color="#6b7280" />
                    </TouchableOpacity>

                    {(() => {
                      const parent = subjectOptions.find((p) => p.id === subjectParentId);
                      if (!parent?.is_split) return null;
                      return (
                        <View style={styles.mergeBlock}>
                          <Text style={styles.lbl}>Unterteilung</Text>
                          <TouchableOpacity
                            style={styles.fakeInput}
                            onPress={() => setPickerSheet({ kind: 'subjectChild', key: Date.now() })}
                          >
                            <Text style={!subjectChildId ? { color: '#9ca3af' } : undefined}>
                              {subjectChildId === '__create__'
                                ? '+ Neue Unterteilung…'
                                : childSubjectsForParent.find((c) => c.id === subjectChildId)?.name ||
                                  'Unterteilung wählen…'}
                            </Text>
                            <Ionicons name="chevron-down" size={18} color="#6b7280" />
                          </TouchableOpacity>
                          {subjectChildId === '__create__' ? (
                            <TextInput
                              style={styles.input}
                              placeholder="Name der Unterteilung"
                              value={subjectChildName}
                              onChangeText={setSubjectChildName}
                            />
                          ) : null}

                          <View style={styles.mergeDivider}>
                            {renderCheckboxRow(subjectMergeEnabled, async () => {
                              const enabled = !subjectMergeEnabled;
                              setSubjectMergeEnabled(enabled);
                              if (enabled) {
                                const next = new Set<string>([subjectPrimaryClass || selectedClassFallback]);
                                setSubjectSelectedClasses(next);
                                setSubjectActiveClassTab(subjectPrimaryClass || selectedClassFallback);
                                const eligible = await loadEligibleChildren();
                                setSubjectEligibleAll(eligible);
                              } else {
                                setSubjectSelectedClasses(new Set());
                                setSubjectSelectedChildIds(new Set());
                              }
                            }, 'Mit anderen Klassen zusammenführen', true)}

                            {subjectMergeEnabled ? (
                              <View style={styles.mergeInner}>
                                <Text style={styles.subLbl}>Klassen auswählen</Text>
                                <View style={styles.classGrid}>
                                  {classes.map((cls) =>
                                    renderCheckboxRow(subjectSelectedClasses.has(cls), () => {
                                      setSubjectSelectedClasses((prev) => {
                                        const n = new Set(prev);
                                        const wasChecked = n.has(cls);
                                        if (n.has(cls)) n.delete(cls);
                                        else n.add(cls);
                                        if (n.size === 0) {
                                          n.add(subjectPrimaryClass || selectedClassFallback);
                                        }
                                        if (!n.has(subjectActiveClassTab)) {
                                          setSubjectActiveClassTab(Array.from(n)[0]);
                                        }
                                        if (wasChecked) {
                                          const idsToDrop = subjectEligibleAll
                                            .filter((c) => c.class === cls)
                                            .map((c) => c.id);
                                          setSubjectSelectedChildIds((prevIds) => {
                                            const s = new Set(prevIds);
                                            idsToDrop.forEach((id) => s.delete(id));
                                            return s;
                                          });
                                        }
                                        return n;
                                      });
                                    }, cls)
                                  )}
                                </View>
                                <View style={styles.mergeTabs}>
                                  {Array.from(subjectSelectedClasses).map((cls) => (
                                    <TouchableOpacity
                                      key={`mt-${cls}`}
                                      style={[
                                        styles.mergeTab,
                                        subjectActiveClassTab === cls && styles.mergeTabOn,
                                      ]}
                                      onPress={() => setSubjectActiveClassTab(cls)}
                                    >
                                      <Text
                                        style={[
                                          styles.mergeTabText,
                                          subjectActiveClassTab === cls && styles.mergeTabTextOn,
                                        ]}
                                      >
                                        {cls}
                                      </Text>
                                    </TouchableOpacity>
                                  ))}
                                </View>
                                <ScrollView style={styles.childList} nestedScrollEnabled>
                                  {subjectEligibleAll
                                    .filter(
                                      (c) =>
                                        subjectSelectedClasses.has(c.class) &&
                                        (!subjectActiveClassTab || c.class === subjectActiveClassTab)
                                    )
                                    .map((c) =>
                                      renderCheckboxRow(subjectSelectedChildIds.has(c.id), () => {
                                        setSubjectSelectedChildIds((prev) => {
                                          const n = new Set(prev);
                                          if (n.has(c.id)) n.delete(c.id);
                                          else n.add(c.id);
                                          return n;
                                        });
                                      }, c.name, true)
                                    )}
                                  {subjectEligibleAll.filter((c) => subjectSelectedClasses.has(c.class)).length ===
                                  0 ? (
                                    <Text style={styles.muted}>Keine berechtigten Schüler</Text>
                                  ) : null}
                                </ScrollView>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      );
                    })()}

                    <View style={styles.footerRow}>
                      <TouchableOpacity style={styles.btnSecondary} onPress={onClose}>
                        <Text style={styles.btnSecondaryText}>Abbrechen</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.btnPrimary,
                          (!subjectParentId || subjectSaving || !currentSubjectTarget) && styles.btnDisabled,
                        ]}
                        disabled={!subjectParentId || subjectSaving || !currentSubjectTarget}
                        onPress={runCreateSubject}
                      >
                        {subjectSaving ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.btnPrimaryText}>Hinzufügen</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <View style={styles.hintBox}>
                    <Text style={styles.hintText}>Bitte wählen Sie Klasse und Zeitfenster.</Text>
                  </View>
                )}
              </View>
            ) : null}
          </ScrollView>
        </View>

        {/* Date picker — same UX as Mensa Settings → Bestellschluss. Renders
            inside its own card-style sheet over a dimmed backdrop, with a
            "Fertig" header button. Replaces the previously-bare DateTimePicker
            that overlaid the modal. */}
        <DateTimePickerSheet
          visible={dateFocus !== null}
          mode="date"
          value={
            dateFocus === 'eventStart'
              ? parseYmd(eventStartDate)
              : dateFocus === 'eventEnd'
                ? parseYmd(eventEndDate)
                : dateFocus && dateFocus.kind === 'course'
                  ? parseYmd(courseSessions[dateFocus.index]?.date || formatLocalYYYYMMDD(new Date()))
                  : new Date()
          }
          onChange={(d) => {
            const ymd = formatLocalYYYYMMDD(d);
            if (dateFocus === 'eventStart') setEventStartDate(ymd);
            else if (dateFocus === 'eventEnd') setEventEndDate(ymd);
            else if (dateFocus && dateFocus.kind === 'course') {
              const i = dateFocus.index;
              setCourseSessions((prev) =>
                prev.map((row, j) => (j === i ? { ...row, date: ymd } : row))
              );
            }
          }}
          onClose={() => setDateFocus(null)}
        />

        {/* Time picker — same Bestellschluss UX. */}
        <DateTimePickerSheet
          visible={timeFocus !== null}
          mode="time"
          value={combineDateAndHm(
            timeFocus === 'eventStart'
              ? eventStartDate
              : timeFocus === 'eventEnd'
                ? eventEndDate
                : timeFocus && timeFocus.kind === 'course'
                  ? courseSessions[timeFocus.index]?.date || formatLocalYYYYMMDD(new Date())
                  : formatLocalYYYYMMDD(new Date()),
            timeFocus === 'eventStart'
              ? eventStartTime
              : timeFocus === 'eventEnd'
                ? eventEndTime
                : timeFocus && timeFocus.kind === 'course'
                  ? timeFocus.slot === 'start'
                    ? courseSessions[timeFocus.index]?.startTime || '14:00'
                    : courseSessions[timeFocus.index]?.endTime || '15:30'
                  : '00:00'
          )}
          onChange={(d) => {
            const hm = hmFromDate(d);
            if (timeFocus === 'eventStart') setEventStartTime(hm);
            else if (timeFocus === 'eventEnd') setEventEndTime(hm);
            else if (timeFocus && timeFocus.kind === 'course') {
              const i = timeFocus.index;
              const slot = timeFocus.slot;
              setCourseSessions((prev) =>
                prev.map((row, j) =>
                  j === i
                    ? {
                        ...row,
                        startTime: slot === 'start' ? hm : row.startTime,
                        endTime: slot === 'end' ? hm : row.endTime,
                      }
                    : row
                )
              );
            }
          }}
          onClose={() => setTimeFocus(null)}
        />

        {/* Option sheets */}
        <Modal visible={pickerSheet != null} transparent animationType="fade">
          <Pressable style={styles.pickBackdrop} onPress={() => setPickerSheet(null)}>
            <Pressable style={styles.pickSheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.pickTitle}>Auswahl</Text>
              <ScrollView style={{ maxHeight: 360 }}>
                {pickerSheet?.kind === 'eventRoom' || pickerSheet?.kind === 'courseRoom' ? (
                  <>
                    <TouchableOpacity
                      style={styles.pickRow}
                      onPress={() => {
                        if (pickerSheet.kind === 'eventRoom') setEventRoom('');
                        else setCourseRoom('');
                        setPickerSheet(null);
                      }}
                    >
                      <Text style={styles.pickRowText}>Raum wählen</Text>
                    </TouchableOpacity>
                    {roomOptions.map((ro) => (
                      <TouchableOpacity
                        key={ro}
                        style={styles.pickRow}
                        onPress={() => {
                          if (pickerSheet.kind === 'eventRoom') setEventRoom(ro);
                          else setCourseRoom(ro);
                          setPickerSheet(null);
                        }}
                      >
                        <Text style={styles.pickRowText}>{ro}</Text>
                      </TouchableOpacity>
                    ))}
                  </>
                ) : null}
                {pickerSheet?.kind === 'courseAudience'
                  ? AUDIENCE_OPTIONS.map((a) => (
                      <TouchableOpacity
                        key={a.value}
                        style={styles.pickRow}
                        onPress={() => {
                          setCourseAudience(a.value);
                          setPickerSheet(null);
                        }}
                      >
                        <Text style={styles.pickRowText}>{a.label}</Text>
                      </TouchableOpacity>
                    ))
                  : null}
                {pickerSheet?.kind === 'courseTax'
                  ? (['0', '7', '19'] as const).map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={styles.pickRow}
                        onPress={() => {
                          setCourseTaxRate(t);
                          setPickerSheet(null);
                        }}
                      >
                        <Text style={styles.pickRowText}>{t === '0' ? '0%' : t === '7' ? '7%' : '19%'}</Text>
                      </TouchableOpacity>
                    ))
                  : null}
                {pickerSheet?.kind === 'subjectClass'
                  ? classes.map((cls) => (
                      <TouchableOpacity
                        key={cls}
                        style={styles.pickRow}
                        onPress={() => {
                          setSubjectPrimaryClass(cls);
                          if (subjectMergeEnabled) {
                            setSubjectSelectedClasses(new Set([cls]));
                            setSubjectActiveClassTab(cls);
                            setSubjectSelectedChildIds(new Set());
                          }
                          setPickerSheet(null);
                        }}
                      >
                        <Text style={styles.pickRowText}>{cls}</Text>
                      </TouchableOpacity>
                    ))
                  : null}
                {pickerSheet?.kind === 'subjectDay'
                  ? WEEKDAYS.map((d) => (
                      <TouchableOpacity
                        key={d.value}
                        style={styles.pickRow}
                        onPress={() => {
                          setSubjectDayIndex(d.value);
                          setPickerSheet(null);
                        }}
                      >
                        <Text style={styles.pickRowText}>{d.label}</Text>
                      </TouchableOpacity>
                    ))
                  : null}
                {pickerSheet?.kind === 'subjectSlot'
                  ? timeSlotOptions.map((slot) => (
                      <TouchableOpacity
                        key={slot.start}
                        style={styles.pickRow}
                        onPress={() => {
                          setSubjectStart(slot.start);
                          setPickerSheet(null);
                        }}
                      >
                        <Text style={styles.pickRowText}>
                          {slot.start}
                          {slot.end ? ` – ${slot.end}` : ''}
                        </Text>
                      </TouchableOpacity>
                    ))
                  : null}
                {pickerSheet?.kind === 'subjectParent'
                  ? parentSubjects.map((s) => (
                      <TouchableOpacity
                        key={s.id}
                        style={styles.pickRow}
                        onPress={() => {
                          setSubjectParentId(s.id);
                          setSubjectChildId('');
                          setSubjectChildName('');
                          setSubjectMergeEnabled(false);
                          setSubjectSelectedClasses(new Set());
                          setSubjectEligibleAll([]);
                          setSubjectSelectedChildIds(new Set());
                          setPickerSheet(null);
                        }}
                      >
                        <Text style={styles.pickRowText}>{s.name}</Text>
                      </TouchableOpacity>
                    ))
                  : null}
                {pickerSheet?.kind === 'subjectChild' ? (
                  <>
                    {childSubjectsForParent.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={styles.pickRow}
                        onPress={() => {
                          setSubjectChildId(c.id);
                          setPickerSheet(null);
                        }}
                      >
                        <Text style={styles.pickRowText}>{c.name}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={styles.pickRow}
                      onPress={() => {
                        setSubjectChildId('__create__');
                        setPickerSheet(null);
                      }}
                    >
                      <Text style={styles.pickRowText}>+ Neue Unterteilung…</Text>
                    </TouchableOpacity>
                  </>
                ) : null}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullScreenRoot: { flex: 1, backgroundColor: '#fff' },
  sheet: {
    flex: 1,
    backgroundColor: '#fff',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 10,
    padding: 3,
  },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabBtnOn: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 },
  tabBtnText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  tabBtnTextOn: { color: '#111827' },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24 },
  section: { gap: 0 },
  lbl: { fontSize: 13, fontWeight: '600', color: '#111827', marginBottom: 6, marginTop: 12 },
  lblInline: { fontSize: 14, fontWeight: '600', color: '#111827' },
  subLbl: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  inputMulti: { minHeight: 90, textAlignVertical: 'top' },
  fakeInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  fakeInputDisabled: { opacity: 0.55 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  linkText: { fontSize: 14, fontWeight: '600', color: '#2563eb' },
  courseSessionCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#fafafa',
  },
  courseSessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  courseSessionTitle: { fontSize: 13, fontWeight: '700', color: '#374151' },
  courseSessionRemove: {
    fontSize: 20,
    fontWeight: '500',
    color: '#6b7280',
    lineHeight: 22,
    paddingHorizontal: 4,
    minWidth: 32,
    textAlign: 'center',
  },
  addTerminBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 2,
    marginBottom: 2,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 0,
    backgroundColor: '#111827',
    gap: 6,
  },
  addTerminBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    paddingVertical: 4,
  },
  switchRowFirst: { marginTop: 14 },
  switchLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  twoCol: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  threeCol: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  col: { width: '48%' },
  col1: { flex: 1, minWidth: 100 },
  colFull: { width: '100%' },
  classGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 8,
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '48%' },
  checkRowWide: { width: '100%' },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxOn: { backgroundColor: '#111827', borderColor: '#111827' },
  checkLabel: { fontSize: 14, color: '#111827', flex: 1 },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 20,
    marginBottom: 8,
  },
  btnPrimary: {
    backgroundColor: '#111827',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  btnSecondary: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  btnSecondaryText: { color: '#374151', fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  hintBox: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  hintText: { fontSize: 13, color: '#6b7280' },
  payBlock: { marginTop: 8, gap: 8 },
  mergeBlock: { marginTop: 8 },
  mergeDivider: { marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb', paddingTop: 12 },
  mergeInner: { marginTop: 8 },
  mergeTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 8 },
  mergeTab: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  mergeTabOn: { backgroundColor: '#111827', borderColor: '#111827' },
  mergeTabText: { fontSize: 12, color: '#374151' },
  mergeTabTextOn: { color: '#fff' },
  childList: { maxHeight: 160, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8 },
  muted: { padding: 8, fontSize: 13, color: '#6b7280' },
  pickBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 24,
  },
  pickSheet: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    maxHeight: '80%',
  },
  pickTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  pickRowText: { fontSize: 15, color: '#111827' },
});
