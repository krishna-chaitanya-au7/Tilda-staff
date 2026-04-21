import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addMonths, format, startOfMonth } from 'date-fns';
import { de } from 'date-fns/locale';
import ClosingDaysDrawer from '@/components/ClosingDaysDrawer';
import ClosingDaysMonthGrid from '@/components/ClosingDaysMonthGrid';
import { supabase } from '@/lib/supabase';
import { saveFacilitySettingsForYear } from '@/lib/facilitySettingsYear';
import type { PeriodRow } from '@/lib/studentPlanCalendar';

/** Same as Mensa Bestellschluss: digits → HH:mm */
function normalizeTypedHm(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function normalizeHm(raw: string): string {
  return normalizeTypedHm(raw);
}

function padTimeForDb(hm: string): string {
  const m = hm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return hm;
  const h = String(parseInt(m[1], 10)).padStart(2, '0');
  return `${h}:${m[2]}:00`;
}

const DEFAULT_WEEKDAY_APPLIES = [1, 2, 3, 4, 5];

function normalizeApplies(raw: number[] | null | undefined): number[] {
  const s = new Set(raw?.length ? raw : DEFAULT_WEEKDAY_APPLIES);
  return DEFAULT_WEEKDAY_APPLIES.filter((d) => s.has(d));
}

export type PlanSettingsDataChangedOpts = { closingDaysOverride?: string[] };

type Props = {
  onBack: () => void;
  facilityId: string;
  academicYearId: string;
  periods: PeriodRow[];
  initialClosingDaysYmd: string[];
  onDataChanged: (opts?: PlanSettingsDataChangedOpts) => void | Promise<void>;
};

export default function PlanSettingsPanel({
  onBack,
  facilityId,
  academicYearId,
  periods,
  initialClosingDaysYmd,
  onDataChanged,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const [tab, setTab] = useState<'closing' | 'timetable'>('closing');
  const [closingYmd, setClosingYmd] = useState<string[]>([]);
  const [monthDisplay, setMonthDisplay] = useState(() => startOfMonth(new Date()));
  const [savingClosing, setSavingClosing] = useState(false);
  const [addDrawerOpen, setAddDrawerOpen] = useState(false);

  const [isConfigPeriods, setIsConfigPeriods] = useState(false);
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [savingPeriod, setSavingPeriod] = useState(false);
  const [deletingPeriodId, setDeletingPeriodId] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [newBreak, setNewBreak] = useState(false);
  /** Matches web: Mo–Fr not shown in form; preserved on edit, Mon–Fri for new rows. */
  const [periodApplies, setPeriodApplies] = useState<number[]>(DEFAULT_WEEKDAY_APPLIES);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const initialClosingKey = useMemo(
    () => [...initialClosingDaysYmd].sort().join(','),
    [initialClosingDaysYmd]
  );

  useEffect(() => {
    setClosingYmd([...initialClosingDaysYmd].sort());
  }, [initialClosingKey, initialClosingDaysYmd]);

  useEffect(() => {
    setTab('closing');
    setMonthDisplay(startOfMonth(new Date()));
    setIsConfigPeriods(false);
    setEditingPeriodId(null);
  }, [facilityId, academicYearId]);

  const selectedSet = useMemo(() => new Set(closingYmd), [closingYmd]);

  const sortedPeriods = useMemo(
    () =>
      [...periods].sort((a, b) => String(a.period_start).localeCompare(String(b.period_start))),
    [periods]
  );

  const removeClosingDay = async (ymd: string) => {
    setSavingClosing(true);
    try {
      const next = closingYmd.filter((d) => d !== ymd);
      await saveFacilitySettingsForYear(facilityId, academicYearId, { closing_days: next });
      setClosingYmd(next);
      await onDataChanged({ closingDaysOverride: next });
    } catch {
      Alert.alert('Fehler', 'Schließtag konnte nicht entfernt werden.');
    } finally {
      setSavingClosing(false);
    }
  };

  const openAddDays = () => setAddDrawerOpen(true);

  const startAddPeriod = useCallback(() => {
    setEditingPeriodId(null);
    const sorted = [...periods].sort((a, b) => String(a.period_end).localeCompare(String(b.period_end)));
    const lastEnd =
      sorted.length > 0 ? String(sorted[sorted.length - 1].period_end).slice(0, 5) : null;
    setNewLabel('');
    setNewStart(lastEnd || '');
    setNewEnd('');
    setNewBreak(false);
    setPeriodApplies(DEFAULT_WEEKDAY_APPLIES);
    setIsConfigPeriods(true);
  }, [periods]);

  const startEditPeriod = (p: PeriodRow) => {
    setEditingPeriodId(p.id);
    setNewLabel(p.label || '');
    setNewStart(String(p.period_start).slice(0, 5));
    setNewEnd(String(p.period_end).slice(0, 5));
    setNewBreak(!!p.is_break);
    setPeriodApplies(normalizeApplies(p.applies_to_days));
    setIsConfigPeriods(true);
  };

  const cancelPeriod = () => {
    setIsConfigPeriods(false);
    setEditingPeriodId(null);
  };

  const savePeriod = async () => {
    if (!newStart.trim() || !newEnd.trim()) return;
    let applies = normalizeApplies(periodApplies);
    if (applies.length === 0) applies = [...DEFAULT_WEEKDAY_APPLIES];
    setSavingPeriod(true);
    try {
      const payload = {
        period_start: padTimeForDb(normalizeHm(newStart)),
        period_end: padTimeForDb(normalizeHm(newEnd)),
        is_break: newBreak,
        label: newLabel.trim() || null,
        applies_to_days: applies,
        facility_id: facilityId,
        academic_year: Number(academicYearId) || null,
      };
      if (editingPeriodId) {
        const { error } = await supabase.from('sch_facility_periods').update(payload).eq('id', editingPeriodId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('sch_facility_periods').insert(payload);
        if (error) throw error;
      }
      setIsConfigPeriods(false);
      setEditingPeriodId(null);
      await onDataChanged();
    } catch (e: any) {
      Alert.alert('Fehler', e?.message || 'Stunde konnte nicht gespeichert werden.');
    } finally {
      setSavingPeriod(false);
    }
  };

  const deletePeriod = (periodId: string) => {
    Alert.alert('Stunde löschen?', 'Diese Aktion kann nicht rückgängig gemacht werden.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          setDeletingPeriodId(periodId);
          try {
            const { error } = await supabase.from('sch_facility_periods').delete().eq('id', periodId);
            if (error) throw error;
            await onDataChanged();
          } catch (e: any) {
            Alert.alert('Fehler', e?.message || 'Löschen fehlgeschlagen.');
          } finally {
            setDeletingPeriodId(null);
          }
        },
      },
    ]);
  };

  const startPick = parseTimeStringToDate(newStart);
  const endPick = parseTimeStringToDate(newEnd);

  return (
    <>
      <View style={[styles.pageRoot, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onBack} hitSlop={12} accessibilityLabel="Zurück">
            <Ionicons name="chevron-back" size={26} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.sheetTitle}>Einstellungen</Text>
        </View>

            <View style={styles.tabs}>
              <TouchableOpacity
                style={[styles.tab, tab === 'closing' && styles.tabActive]}
                onPress={() => setTab('closing')}
              >
                <Text style={[styles.tabText, tab === 'closing' && styles.tabTextActive]}>Schließtage</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, tab === 'timetable' && styles.tabActive]}
                onPress={() => setTab('timetable')}
              >
                <Text style={[styles.tabText, tab === 'timetable' && styles.tabTextActive]}>Stundentafel</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
              keyboardShouldPersistTaps="handled"
            >
              {tab === 'closing' ? (
                <View style={styles.panel}>
                  <View style={styles.panelBar}>
                    <Text style={styles.panelTitle} />
                    <TouchableOpacity style={styles.outlineBtn} onPress={openAddDays}>
                      <Ionicons name="add" size={18} color="#374151" />
                      <Text style={styles.outlineBtnText}>Tage hinzufügen</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.closingRow, winW >= 640 && styles.closingRowWide]}>
                    <ClosingDaysMonthGrid
                      compact
                      visibleMonth={monthDisplay}
                      selectedYmd={selectedSet}
                      interactive={false}
                      selectedVariant="soft"
                      onPrevMonth={() => setMonthDisplay((m) => addMonths(m, -1))}
                      onNextMonth={() => setMonthDisplay((m) => addMonths(m, 1))}
                    />
                    <View style={[styles.listCol, winW >= 640 && { flex: 1, minWidth: 200 }]}>
                      {closingYmd.length > 0 ? (
                        <ScrollView style={styles.dateList} nestedScrollEnabled>
                          {closingYmd.map((ymd) => {
                            const [y, mo, da] = ymd.split('-').map(Number);
                            const d = new Date(y, mo - 1, da);
                            return (
                              <View key={ymd} style={styles.dateRow}>
                                <Text style={styles.dateRowText}>
                                  {format(d, 'd. MMMM yyyy', { locale: de })}
                                </Text>
                                <TouchableOpacity onPress={() => removeClosingDay(ymd)} disabled={savingClosing}>
                                  <Text style={styles.deleteLink}>löschen</Text>
                                </TouchableOpacity>
                              </View>
                            );
                          })}
                        </ScrollView>
                      ) : (
                        <View style={styles.emptyList}>
                          <Text style={styles.emptyListText}>Keine Schließtage ausgewählt</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.panel}>
                  <View style={styles.ttHeader}>
                    <Text style={styles.ttCount}>Stunden ({periods.length})</Text>
                    <TouchableOpacity style={styles.darkBtn} onPress={startAddPeriod}>
                      <Ionicons name="add" size={18} color="#fff" />
                      <Text style={styles.darkBtnText}>Stunde hinzufügen</Text>
                    </TouchableOpacity>
                  </View>

                  {isConfigPeriods ? (
                    <View style={styles.formCard}>
                      <Text style={styles.formTitle}>
                        {editingPeriodId ? 'Stunde bearbeiten' : 'Stunde hinzufügen'}
                      </Text>
                      <Text style={styles.fieldLbl}>Bezeichnung (optional)</Text>
                      <TextInput
                        style={styles.input}
                        value={newLabel}
                        onChangeText={setNewLabel}
                        placeholder="z. B. 1. Stunde oder Mittagspause"
                        placeholderTextColor="#9ca3af"
                      />
                      <View style={styles.timeRow}>
                        <View style={styles.timeCol}>
                          <Text style={styles.fieldLbl}>Startzeit</Text>
                          <TouchableOpacity
                            style={styles.timeField}
                            onPress={() => setShowStartPicker(true)}
                            activeOpacity={0.75}
                          >
                            <Ionicons name="time-outline" size={20} color="#6b7280" />
                            <Text style={styles.timeFieldText}>{newStart || '—:—'}</Text>
                          </TouchableOpacity>
                        </View>
                        <View style={styles.timeCol}>
                          <Text style={styles.fieldLbl}>Endzeit</Text>
                          <TouchableOpacity
                            style={styles.timeField}
                            onPress={() => setShowEndPicker(true)}
                            activeOpacity={0.75}
                          >
                            <Ionicons name="time-outline" size={20} color="#6b7280" />
                            <Text style={styles.timeFieldText}>{newEnd || '—:—'}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                      {Platform.OS === 'android' && showStartPicker ? (
                        <DateTimePicker
                          value={startPick}
                          mode="time"
                          display="default"
                          onChange={(_, d) => {
                            setShowStartPicker(false);
                            if (d) setNewStart(format(d, 'HH:mm'));
                          }}
                        />
                      ) : null}
                      {Platform.OS === 'android' && showEndPicker ? (
                        <DateTimePicker
                          value={endPick}
                          mode="time"
                          display="default"
                          onChange={(_, d) => {
                            setShowEndPicker(false);
                            if (d) setNewEnd(format(d, 'HH:mm'));
                          }}
                        />
                      ) : null}

                      <TouchableOpacity
                        style={styles.checkboxRow}
                        onPress={() => setNewBreak((b) => !b)}
                        activeOpacity={0.75}
                      >
                        <View style={[styles.checkboxBox, newBreak && styles.checkboxBoxOn]}>
                          {newBreak ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                        </View>
                        <Text style={styles.checkboxLabel}>Ist Pause</Text>
                      </TouchableOpacity>
                      <View style={styles.formActions}>
                        <TouchableOpacity style={styles.outlineBtn} onPress={cancelPeriod}>
                          <Text style={styles.outlineBtnText}>Abbrechen</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.darkBtn, (!newStart || !newEnd || savingPeriod) && styles.btnDisabled]}
                          disabled={!newStart || !newEnd || savingPeriod}
                          onPress={savePeriod}
                        >
                          {savingPeriod ? (
                            <ActivityIndicator color="#fff" />
                          ) : (
                            <Text style={styles.darkBtnText}>Speichern</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.periodList}>
                    {sortedPeriods.map((p) => (
                      <View key={p.id} style={styles.periodRow}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={styles.periodTime}>
                            {String(p.period_start).slice(0, 5)} – {String(p.period_end).slice(0, 5)}
                          </Text>
                          {p.label ? (
                            <Text style={styles.periodLabel} numberOfLines={2}>
                              {p.label}
                            </Text>
                          ) : null}
                          {p.is_break ? (
                            <Text style={styles.periodBreak}>Pause</Text>
                          ) : null}
                        </View>
                        <View style={styles.periodActions}>
                          <TouchableOpacity onPress={() => startEditPeriod(p)} hitSlop={8}>
                            <Ionicons name="pencil" size={20} color="#6b7280" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => deletePeriod(p.id)}
                            disabled={deletingPeriodId === p.id}
                            hitSlop={8}
                          >
                            {deletingPeriodId === p.id ? (
                              <ActivityIndicator size="small" color="#ef4444" />
                            ) : (
                              <Ionicons name="trash-outline" size={20} color="#ef4444" />
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>
      </View>

      <ClosingDaysDrawer
        visible={addDrawerOpen}
        onClose={() => setAddDrawerOpen(false)}
        facilityId={facilityId}
        academicYearId={academicYearId}
        initialYmd={closingYmd}
        onSaved={async (ymd) => {
          setClosingYmd(ymd);
          await onDataChanged({ closingDaysOverride: ymd });
        }}
      />

      <Modal
        visible={showStartPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStartPicker(false)}
      >
        <Pressable style={styles.timePickerBackdrop} onPress={() => setShowStartPicker(false)}>
          <View style={styles.timePickerCard} onStartShouldSetResponder={() => true}>
            <View style={styles.timePickerOkBar}>
              <TouchableOpacity onPress={() => setShowStartPicker(false)}>
                <Text style={styles.timePickerOkText}>Fertig</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.timePickerInner}>
              <DateTimePicker
                value={startPick}
                mode="time"
                is24Hour
                display="spinner"
                design="default"
                {...(Platform.OS === 'ios'
                  ? { themeVariant: 'light' as const, textColor: '#111827' }
                  : {})}
                onChange={(_, d) => {
                  if (d) setNewStart(format(d, 'HH:mm'));
                }}
                style={styles.timePickerWheel}
              />
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showEndPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEndPicker(false)}
      >
        <Pressable style={styles.timePickerBackdrop} onPress={() => setShowEndPicker(false)}>
          <View style={styles.timePickerCard} onStartShouldSetResponder={() => true}>
            <View style={styles.timePickerOkBar}>
              <TouchableOpacity onPress={() => setShowEndPicker(false)}>
                <Text style={styles.timePickerOkText}>Fertig</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.timePickerInner}>
              <DateTimePicker
                value={endPick}
                mode="time"
                is24Hour
                display="spinner"
                design="default"
                {...(Platform.OS === 'ios'
                  ? { themeVariant: 'light' as const, textColor: '#111827' }
                  : {})}
                onChange={(_, d) => {
                  if (d) setNewEnd(format(d, 'HH:mm'));
                }}
                style={styles.timePickerWheel}
              />
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function parseTimeStringToDate(timeStr: string | undefined | null): Date {
  const d = new Date();
  d.setSeconds(0, 0);
  if (!timeStr || !timeStr.trim()) {
    d.setHours(12, 0, 0, 0);
    return d;
  }
  const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})/);
  if (m) {
    d.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
  } else {
    d.setHours(12, 0, 0, 0);
  }
  return d;
}

const styles = StyleSheet.create({
  pageRoot: {
    flex: 1,
    backgroundColor: '#fff',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#fff',
  },
  tabActive: {
    backgroundColor: '#f3f4f6',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#9ca3af',
  },
  tabTextActive: {
    color: '#111827',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  panel: {
    marginHorizontal: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 14,
  },
  panelBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  panelTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  closingRow: {
    flexDirection: 'column',
    gap: 14,
  },
  closingRowWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  listCol: {
    flex: 1,
    minHeight: 120,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 10,
  },
  dateList: { maxHeight: 220 },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  dateRowText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  deleteLink: { fontSize: 14, color: '#dc2626', fontWeight: '600' },
  emptyList: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  emptyListText: { color: '#9ca3af', fontSize: 14 },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  outlineBtnText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  ttHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  ttCount: { fontSize: 16, fontWeight: '700', color: '#111827' },
  darkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  darkBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  btnDisabled: { opacity: 0.45 },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 12,
  },
  formTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12, color: '#111827' },
  fieldLbl: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  timeRow: { flexDirection: 'row', gap: 12 },
  timeCol: { flex: 1 },
  timeFieldInner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#fff',
    minHeight: 48,
    marginBottom: 10,
  },
  timeField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#fff',
    minHeight: 48,
    marginBottom: 10,
  },
  timeFieldText: { fontSize: 15, color: '#111827' },
  periodTimeInput: {
    flex: 1,
    minWidth: 72,
    fontSize: 15,
    color: '#111827',
    paddingVertical: 8,
    paddingHorizontal: 4,
    margin: 0,
  },
  timeIcon: { marginRight: 8 },
  timePickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timePickerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    width: '90%',
    maxWidth: 400,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  timePickerOkBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  timePickerOkText: { color: '#007AFF', fontWeight: '600', fontSize: 16 },
  timePickerInner: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
  },
  timePickerWheel: { backgroundColor: '#ffffff', height: 232, width: '100%' },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
    marginBottom: 12,
    paddingVertical: 4,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#9ca3af',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxOn: {
    borderColor: '#111827',
    backgroundColor: '#111827',
  },
  checkboxLabel: { fontSize: 15, fontWeight: '500', color: '#111827' },
  formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  periodList: { gap: 8 },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  periodTime: { fontSize: 14, fontWeight: '600', color: '#111827' },
  periodLabel: { fontSize: 13, color: '#4b5563', marginTop: 2 },
  periodBreak: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#6b7280',
    marginTop: 2,
  },
  periodActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
