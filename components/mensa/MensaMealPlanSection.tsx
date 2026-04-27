import { useCallback, useEffect, useMemo, useState } from 'react';
import { startOfMonth } from 'date-fns';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  FlatList,
  Pressable,
  TextInput,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { addWeeks, subWeeks } from 'date-fns';
import {
  addDays,
  addMonths,
  endOfWeek,
  fetchAvailableMenulines,
  fetchMealPlanData,
  getFilteredDates,
  startOfWeek,
  subMonths,
  toYmd,
  type DayMenulines,
  type FilterType,
} from '@/components/mensa/mensaMealPlan';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { printOrShareSpeiseplan } from '@/components/mensa/mensaPdf';
import { useIsMobile } from '@/hooks/use-is-mobile';

type Props = {
  facilityId: string;
  /** Header-selected academic year for Speiseplan (matches web MealPlanSection). */
  selectedHeaderYearId: number | null;
  onDayInfo: (day: Date) => void;
};

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'current_week', label: 'Wochenansicht' },
  { value: 'current_month', label: 'Aktueller Monat' },
  { value: 'date_range', label: 'Zeitraum' },
];

export function MensaMealPlanSection({ facilityId, selectedHeaderYearId, onDayInfo }: Props) {
  const isMobile = useIsMobile();
  const [filterType, setFilterType] = useState<FilterType>('current_week');
  const [selectedMenulineId, setSelectedMenulineId] = useState('all');
  const [currentWeek, setCurrentWeek] = useState(() => new Date());
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date } | null>(null);

  const [availableMenulines, setAvailableMenulines] = useState<{ id: string; name: string }[]>([]);
  const [dayMenulines, setDayMenulines] = useState<DayMenulines[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);

  const [menulinePickerOpen, setMenulinePickerOpen] = useState(false);
  const [filterPickerOpen, setFilterPickerOpen] = useState(false);
  const [rangeModalOpen, setRangeModalOpen] = useState(false);
  const [rangeDraftFrom, setRangeDraftFrom] = useState('');
  const [rangeDraftTo, setRangeDraftTo] = useState('');

  const weekDays = useMemo(
    () => [0, 1, 2, 3, 4].map((i) => addDays(startOfWeek(currentWeek, { weekStartsOn: 1 }), i)),
    [currentWeek]
  );

  const reloadMenulines = useCallback(async () => {
    if (!facilityId) {
      setAvailableMenulines([]);
      return;
    }
    try {
      const m = await fetchAvailableMenulines(facilityId, selectedHeaderYearId);
      setAvailableMenulines(m);
    } catch {
      setAvailableMenulines([]);
    }
  }, [facilityId, selectedHeaderYearId]);

  const reloadPlan = useCallback(async () => {
    if (!facilityId) {
      setDayMenulines([]);
      return;
    }
    setLoading(true);
    try {
      const dates = getFilteredDates({
        filterType,
        currentWeek,
        currentMonth,
        dateRange,
      });
      const data = await fetchMealPlanData({
        facilityId,
        selectedHeaderYearId,
        dates,
        selectedMenulineId,
      });
      setDayMenulines(data);
    } catch (e) {
      console.warn('meal plan', e);
      setDayMenulines([]);
    } finally {
      setLoading(false);
    }
  }, [
    facilityId,
    selectedHeaderYearId,
    filterType,
    currentWeek,
    currentMonth,
    dateRange,
    selectedMenulineId,
  ]);

  useEffect(() => {
    reloadMenulines();
  }, [reloadMenulines]);

  useEffect(() => {
    if (filterType === 'current_month') {
      setCurrentWeek(startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 }));
    }
  }, [filterType, currentMonth]);

  useEffect(() => {
    if (filterType === 'date_range' && dateRange?.from) {
      setCurrentWeek(startOfWeek(dateRange.from, { weekStartsOn: 1 }));
    }
  }, [filterType, dateRange]);

  useEffect(() => {
    reloadPlan();
  }, [reloadPlan]);

  const weekBanner = useMemo(() => {
    const s = startOfWeek(currentWeek, { weekStartsOn: 1 });
    const e = endOfWeek(currentWeek, { weekStartsOn: 1 });
    const kw = format(s, 'II');
    return `KW ${kw} – ${format(s, 'dd.MM.', { locale: de })} - ${format(e, 'dd.MM.yyyy', { locale: de })}`;
  }, [currentWeek]);

  const menulineLabel =
    selectedMenulineId === 'all'
      ? 'Alle Menülinien'
      : availableMenulines.find((m) => m.id === selectedMenulineId)?.name || 'Menülinie';

  const maxMenus = Math.max(0, ...weekDays.map((d) => dayMenulines.find((x) => x.date === toYmd(d))?.menulines.length || 0));

  const tableRows = useMemo(() => {
    const dayMap = new Map(dayMenulines.map((d) => [d.date, d]));
    const rows = [
      { key: 'starter', label: 'Vorspeise' },
      ...Array.from({ length: maxMenus }, (_, i) => ({ key: `menu-${i + 1}`, label: `Menü ${i + 1}` })),
      { key: 'dessert', label: 'Nachspeise' },
    ];
    return { dayMap, rows };
  }, [dayMenulines, maxMenus, weekDays]);

  const onExportPdf = async () => {
    if (!dayMenulines.length) return;
    setPdfBusy(true);
    try {
      await printOrShareSpeiseplan(dayMenulines);
    } finally {
      setPdfBusy(false);
    }
  };

  const applyDateRange = () => {
    const parse = (s: string) => {
      const p = s.trim().split(/[.\-/]/).map(Number);
      if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return null;
      const [d, mo, y] = p.length === 3 && p[0] <= 31 ? [p[0], p[1], p[2]] : [p[2], p[1], p[0]];
      return new Date(y, mo - 1, d);
    };
    const from = parse(rangeDraftFrom);
    const to = parse(rangeDraftTo);
    if (from && to && from <= to) {
      setDateRange({ from, to });
      setRangeModalOpen(false);
    }
  };

  if (loading && !dayMenulines.length) {
    return (
      <View style={styles.section}>
        <Text style={styles.h2Loading}>Speiseplan</Text>
        <ActivityIndicator style={{ marginVertical: 16 }} />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      {isMobile ? (
        <>
          <Text style={styles.mobileTitle}>Speiseplan</Text>
          <View style={styles.mobileFiltersRow}>
            <TouchableOpacity style={styles.mobileSelectBtn} onPress={() => setMenulinePickerOpen(true)}>
              <Text style={styles.selectBtnText} numberOfLines={1}>
                {menulineLabel}
              </Text>
              <MaterialIcons name="arrow-drop-down" size={22} color="#374151" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.mobileSelectBtn} onPress={() => setFilterPickerOpen(true)}>
              <Text style={styles.selectBtnText} numberOfLines={1}>
                {FILTER_OPTIONS.find((f) => f.value === filterType)?.label}
              </Text>
              <MaterialIcons name="arrow-drop-down" size={22} color="#374151" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.pdfBtnMobile, (!dayMenulines.length || pdfBusy) && styles.pdfBtnDisabled]}
            onPress={onExportPdf}
            disabled={!dayMenulines.length || pdfBusy}
          >
            <MaterialIcons name="file-download" size={18} color="#fff" />
            <Text style={styles.pdfBtnText}>{pdfBusy ? '…' : 'PDF exportieren'}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={styles.titleRow}>
            <Text style={styles.h2Centered} numberOfLines={1}>
              Speiseplan
            </Text>
            <View style={styles.filtersRight}>
              <TouchableOpacity style={styles.selectBtn} onPress={() => setMenulinePickerOpen(true)}>
                <Text style={styles.selectBtnText} numberOfLines={1}>
                  {menulineLabel}
                </Text>
                <MaterialIcons name="arrow-drop-down" size={22} color="#374151" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.selectBtn} onPress={() => setFilterPickerOpen(true)}>
                <Text style={styles.selectBtnText} numberOfLines={1}>
                  {FILTER_OPTIONS.find((f) => f.value === filterType)?.label}
                </Text>
                <MaterialIcons name="arrow-drop-down" size={22} color="#374151" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.pdfRow}>
            <TouchableOpacity
              style={[styles.pdfBtn, (!dayMenulines.length || pdfBusy) && styles.pdfBtnDisabled]}
              onPress={onExportPdf}
              disabled={!dayMenulines.length || pdfBusy}
            >
              <MaterialIcons name="file-download" size={18} color="#fff" />
              <Text style={styles.pdfBtnText}>{pdfBusy ? '…' : 'Als PDF exportieren'}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {filterType === 'current_month' && (
        <View style={styles.monthNav}>
          <TouchableOpacity
            style={styles.dateChevronBtn}
            onPress={() => setCurrentMonth((m) => subMonths(m, 1))}
            hitSlop={8}
          >
            <MaterialIcons name="chevron-left" size={26} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.monthTitle}>{format(currentMonth, 'MMMM yyyy', { locale: de })}</Text>
          <TouchableOpacity
            style={styles.dateChevronBtn}
            onPress={() => setCurrentMonth((m) => addMonths(m, 1))}
            hitSlop={8}
          >
            <MaterialIcons name="chevron-right" size={26} color="#111827" />
          </TouchableOpacity>
        </View>
      )}

      {filterType === 'current_week' && (
        <View style={styles.kwNav}>
          <TouchableOpacity
            style={styles.dateChevronBtn}
            onPress={() => setCurrentWeek((w) => subWeeks(w, 1))}
            hitSlop={8}
          >
            <MaterialIcons name="chevron-left" size={26} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.kwText}>{weekBanner}</Text>
          <TouchableOpacity
            style={styles.dateChevronBtn}
            onPress={() => setCurrentWeek((w) => addWeeks(w, 1))}
            hitSlop={8}
          >
            <MaterialIcons name="chevron-right" size={26} color="#111827" />
          </TouchableOpacity>
        </View>
      )}

      {filterType === 'date_range' && (
        <TouchableOpacity style={styles.rangeBtn} onPress={() => setRangeModalOpen(true)}>
          <Text style={styles.rangeBtnText}>
            {dateRange
              ? `${format(dateRange.from, 'dd.MM.yyyy')} – ${format(dateRange.to, 'dd.MM.yyyy')}`
              : 'Zeitraum wählen'}
          </Text>
        </TouchableOpacity>
      )}

      {isMobile ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          style={styles.tableScroll}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <View style={[styles.table, { minWidth: 80 + 5 * 120 }]}>
            <View style={styles.tr}>
              <View style={[styles.th, styles.thCorner, styles.cornerMobile]} />
              {weekDays.map((day, idx) => (
                <View key={toYmd(day)} style={[styles.th, styles.dayColMobile]}>
                  <View style={styles.thInner}>
                    <Text style={styles.thText}>{['Mo', 'Di', 'Mi', 'Do', 'Fr'][idx]}</Text>
                    <TouchableOpacity onPress={() => onDayInfo(day)} hitSlop={8}>
                      <MaterialIcons name="info-outline" size={14} color="#6b7280" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
            {maxMenus === 0 ? (
              <View style={styles.tr}>
                <View style={[styles.tdLabel, styles.cornerMobile]} />
                <View style={[styles.td, { flexGrow: 1, borderLeftWidth: 1, borderColor: '#eaecef' }]}>
                  <Text style={styles.emptyText}>Kein Speiseplan im gewählten Zeitraum gefunden</Text>
                </View>
              </View>
            ) : (
              tableRows.rows.map((row) => (
                <View key={row.key} style={styles.tr}>
                  <View style={[styles.tdLabel, styles.cornerMobile]}>
                    <Text style={styles.tdLabelText}>{row.label}</Text>
                  </View>
                  {weekDays.map((day) => {
                    const dayData = tableRows.dayMap.get(toYmd(day));
                    const menus = dayData?.menulines || [];
                    let value = '—';
                    if (row.key === 'starter') value = menus[0]?.starter?.title || '—';
                    else if (row.key === 'dessert') value = menus[0]?.dessert?.title || '—';
                    else {
                      const index = Number(row.key.replace('menu-', '')) - 1;
                      value = menus[index]?.mainCourse?.title || '—';
                    }
                    const secondary = row.key === 'starter' || row.key === 'dessert';
                    return (
                      <View key={`${row.key}-${toYmd(day)}`} style={[styles.td, styles.dayColMobile]}>
                        <Text style={[styles.tdText, secondary && styles.tdSecondary, { fontSize: 12 }]} numberOfLines={8}>
                          {value}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.tableScroll}>
          <View style={styles.table}>
            <View style={styles.tr}>
              <View style={[styles.th, styles.thCorner]} />
              {weekDays.map((day, idx) => (
                <View key={toYmd(day)} style={styles.th}>
                  <View style={styles.thInner}>
                    <Text style={styles.thText}>{['Mo', 'Di', 'Mi', 'Do', 'Fr'][idx]}</Text>
                    <TouchableOpacity onPress={() => onDayInfo(day)} hitSlop={8}>
                      <MaterialIcons name="info-outline" size={14} color="#6b7280" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
            {maxMenus === 0 ? (
              <View style={styles.tr}>
                <View style={styles.tdLabel} />
                <View style={[styles.td, { flex: 5, borderLeftWidth: 1, borderColor: '#eaecef' }]}>
                  <Text style={styles.emptyText}>Kein Speiseplan im gewählten Zeitraum gefunden</Text>
                </View>
              </View>
            ) : (
              tableRows.rows.map((row) => (
                <View key={row.key} style={styles.tr}>
                  <View style={styles.tdLabel}>
                    <Text style={styles.tdLabelText}>{row.label}</Text>
                  </View>
                  {weekDays.map((day) => {
                    const dayData = tableRows.dayMap.get(toYmd(day));
                    const menus = dayData?.menulines || [];
                    let value = '—';
                    if (row.key === 'starter') value = menus[0]?.starter?.title || '—';
                    else if (row.key === 'dessert') value = menus[0]?.dessert?.title || '—';
                    else {
                      const index = Number(row.key.replace('menu-', '')) - 1;
                      value = menus[index]?.mainCourse?.title || '—';
                    }
                    const secondary = row.key === 'starter' || row.key === 'dessert';
                    return (
                      <View key={`${row.key}-${toYmd(day)}`} style={styles.td}>
                        <Text style={[styles.tdText, secondary && styles.tdSecondary]} numberOfLines={8}>
                          {value}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ))
            )}
          </View>
        </View>
      )}

      <Modal visible={menulinePickerOpen} transparent animationType="slide">
        <Pressable style={styles.modalBackdrop} onPress={() => setMenulinePickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Menülinie</Text>
            <FlatList
              data={[{ id: 'all', name: 'Alle Menülinien' }, ...availableMenulines]}
              keyExtractor={(it) => it.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalRow}
                  onPress={() => {
                    setSelectedMenulineId(item.id);
                    setMenulinePickerOpen(false);
                  }}
                >
                  <Text>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={filterPickerOpen} transparent animationType="slide">
        <Pressable style={styles.modalBackdrop} onPress={() => setFilterPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Ansicht</Text>
            {FILTER_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={styles.modalRow}
                onPress={() => {
                  setFilterType(opt.value);
                  setFilterPickerOpen(false);
                }}
              >
                <Text>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={rangeModalOpen} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setRangeModalOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Zeitraum (dd.MM.yyyy)</Text>
            <TextInput
              style={styles.input}
              placeholder="Von z.B. 01.04.2026"
              value={rangeDraftFrom}
              onChangeText={setRangeDraftFrom}
            />
            <TextInput
              style={styles.input}
              placeholder="Bis z.B. 30.04.2026"
              value={rangeDraftTo}
              onChangeText={setRangeDraftTo}
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={applyDateRange}>
              <Text style={styles.primaryBtnText}>Übernehmen</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignSelf: 'stretch',
  },
  h2Loading: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    width: '100%',
  },
  titleRow: {
    position: 'relative',
    minHeight: 40,
    justifyContent: 'center',
  },
  h2Centered: {
    ...StyleSheet.absoluteFillObject,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    lineHeight: 40,
  },
  filtersRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 1,
  },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    maxWidth: 148,
    backgroundColor: '#fff',
  },
  selectBtnText: { fontSize: 13, color: '#111827', flex: 1 },
  pdfRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 10,
    width: '100%',
  },
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#111827',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  pdfBtnDisabled: { opacity: 0.5 },
  pdfBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  mobileTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
  },
  mobileFiltersRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  mobileSelectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  pdfBtnMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#111827',
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 4,
  },
  monthTitle: { fontSize: 15, fontWeight: '600', color: '#111827', paddingHorizontal: 4 },
  dateChevronBtn: { padding: 2 },
  kwNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 4,
  },
  kwText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    paddingHorizontal: 4,
    flexShrink: 1,
  },
  rangeBtn: {
    marginTop: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
  },
  rangeBtnText: { fontSize: 14, color: '#374151' },
  tableScroll: { marginTop: 12, width: '100%', alignSelf: 'stretch' },
  table: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    overflow: 'hidden',
  },
  tr: { flexDirection: 'row', alignItems: 'stretch' },
  th: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 6,
    backgroundColor: '#fcfcfd',
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderColor: '#eaecef',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  thCorner: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 108,
    width: 108,
    minHeight: 48,
    borderLeftWidth: 0,
  },
  cornerMobile: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 80,
    width: 80,
    minHeight: 48,
    borderLeftWidth: 0,
  },
  dayColMobile: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 120,
    width: 120,
  },
  thInner: { flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'center' },
  thText: { fontSize: 11, fontWeight: '600', color: '#6b7280' },
  tdLabel: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 108,
    width: 108,
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: '#fcfcfd',
    borderBottomWidth: 1,
    borderColor: '#eaecef',
    justifyContent: 'center',
    minHeight: 64,
  },
  tdLabelText: { fontSize: 12, fontWeight: '600', color: '#111827' },
  td: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderColor: '#eaecef',
    justifyContent: 'center',
    backgroundColor: '#fff',
    minHeight: 64,
  },
  tdText: { fontSize: 13, color: '#111827', fontWeight: '500', textAlign: 'center' },
  tdSecondary: { fontSize: 12, fontStyle: 'italic', color: '#6b7280' },
  emptyRow: { padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '70%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  modalRow: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    fontSize: 16,
  },
  primaryBtn: { backgroundColor: '#111827', padding: 14, borderRadius: 10, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
});
