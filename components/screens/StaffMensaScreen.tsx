/**
 * Mensa screen: Speiseplan uses header-selected academic year; settings use getCurrentAcademicYearId()
 * (same split as bissfest_tool eating-locations page vs CatererSettingsDialog).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  FlatList,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { getCurrentAcademicYearId } from '@/lib/facilityPermissions';
import { canEditMensaSettings } from '@/lib/mensaPermissions';
import type { SingleFacilityScope, SupervisorFacilityScope } from '@/lib/staffFacilityScope';
import { MensaStatsCards } from '@/components/mensa/MensaStatsCards';
import { MensaMealPlanSection } from '@/components/mensa/MensaMealPlanSection';
import { MensaDayDeliveryModal } from '@/components/mensa/MensaDayDeliveryModal';
import { MensaSettingsModal } from '@/components/mensa/MensaSettingsModal';
import { SCREEN_HEADER_TOP_PAD } from '@/constants/theme';

type Scope = SingleFacilityScope | SupervisorFacilityScope;

export type AcademicYearRow = {
  id: string;
  year?: string | number | null;
  is_current?: boolean | null;
  start_date?: string | null;
  end_date?: string | null;
};

function primaryFacilityIdFromScope(s: Scope): string {
  return s.mode === 'supervisor' ? s.primaryFacilityId : s.facilityId;
}

function formatAcademicYearLabel(ay: AcademicYearRow): string {
  const yStr = ay.year != null ? String(ay.year).trim() : '';
  if (yStr.length > 0) return yStr;
  if (ay.start_date && ay.end_date) {
    return `${new Date(ay.start_date).getFullYear()}/${new Date(ay.end_date).getFullYear()}`;
  }
  return `Year ${ay.id}`;
}

export default function StaffMensaScreen({
  scopeLoader,
}: {
  scopeLoader: () => Promise<Scope | null>;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [scope, setScope] = useState<Scope | null>(null);
  /** Web: selectedAcademicYearId in header — drives Speiseplan / eating_location check coalesce */
  const [selectedHeaderYearId, setSelectedHeaderYearId] = useState<string | null>(null);
  /** Web UserContext currentAcademicYear — drives CatererSettingsDialog + TodaysDeliveryTable children_info */
  const [settingsYearId, setSettingsYearId] = useState<string | null>(null);

  const [activeFacilityId, setActiveFacilityId] = useState<string | null>(null);
  const activeFacilityRef = useRef<string | null>(null);
  activeFacilityRef.current = activeFacilityId;
  const [facilityTitle, setFacilityTitle] = useState('');
  const [facilityType, setFacilityType] = useState<'school' | 'kindergarten' | null>(null);
  const [academicYears, setAcademicYears] = useState<AcademicYearRow[]>([]);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [facilityPickerOpen, setFacilityPickerOpen] = useState(false);

  const [hasEatingLocation, setHasEatingLocation] = useState<boolean | null>(null);
  const [checkingLocation, setCheckingLocation] = useState(false);

  const [catererId, setCatererId] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [canEditSettings, setCanEditSettings] = useState(false);

  const [deliveryDay, setDeliveryDay] = useState<Date | null>(null);
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statsTick, setStatsTick] = useState(0);

  const selectedHeaderYearNum = useMemo(() => {
    if (selectedHeaderYearId == null) return null;
    const n = Number(selectedHeaderYearId);
    return Number.isFinite(n) ? n : null;
  }, [selectedHeaderYearId]);

  const fetchAcademicYears = useCallback(async () => {
    const { data, error: yErr } = await supabase
      .from('academic_years')
      .select('id, year, is_current, start_date, end_date')
      .order('start_date', { ascending: false });
    if (yErr) throw yErr;
    const years = (data || []) as AcademicYearRow[];
    setAcademicYears(years);
    return years;
  }, []);

  const pickDefaultHeaderYear = useCallback((years: AcademicYearRow[], hint: string | null) => {
    if (hint && years.some((y) => String(y.id) === String(hint))) return String(hint);
    const today = new Date();
    const byCurrent = years.find((y) => y.is_current);
    const byRange = years.find((y) => {
      if (!y.start_date || !y.end_date) return false;
      const s = new Date(y.start_date);
      const e = new Date(y.end_date);
      return today >= s && today <= e;
    });
    const fallback = byCurrent || byRange || years[0];
    return fallback?.id != null ? String(fallback.id) : null;
  }, []);

  const checkEatingLocation = useCallback(
    async (facilityId: string, headerYear: string | null, settingsYear: string | null) => {
      setCheckingLocation(true);
      try {
        const yearId = headerYear ?? settingsYear ?? '1';
        const { data, error: locErr } = await supabase
          .from('eating_locations')
          .select('id')
          .eq('is_deleted', false)
          .eq('academic_year', yearId)
          .contains('facility_ids', JSON.stringify([facilityId]))
          .limit(1);
        if (locErr) throw locErr;
        setHasEatingLocation(!!data?.length);
      } catch {
        setHasEatingLocation(false);
      } finally {
        setCheckingLocation(false);
      }
    },
    []
  );

  const fetchCatererId = useCallback(async (facilityId: string) => {
    try {
      const { data, error } = await supabase
        .from('facilities')
        .select('caterer_id')
        .eq('is_deleted', false)
        .eq('id', facilityId)
        .single();
      if (error) throw error;
      setCatererId(data?.caterer_id ? String(data.caterer_id) : '');
    } catch {
      setCatererId('');
    }
  }, []);

  const resolvePermissions = useCallback(
    async (s: Scope, facilityId: string) => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) {
        setCanEditSettings(false);
        return;
      }
      const { data: userRow } = await supabase
        .from('users')
        .select('id, user_type, record_id')
        .eq('auth_id', authUser.id)
        .maybeSingle();
      if (!userRow) {
        setCanEditSettings(false);
        return;
      }
      const supervisorContext =
        s.mode === 'supervisor'
          ? { supervisorId: s.supervisorId, facilityIds: s.facilityIds }
          : null;
      const ok = await canEditMensaSettings({
        facilityId,
        staffUserId: userRow.id,
        authUserId: authUser.id,
        userType: String(userRow.user_type || ''),
        recordId: userRow.record_id,
        supervisorContext,
      });
      setCanEditSettings(ok);
    },
    []
  );

  const load = useCallback(async () => {
    setError(null);
    const s = await scopeLoader();
    setScope(s);
    if (!s?.facilityIds?.length) {
      setActiveFacilityId(null);
      setHasEatingLocation(null);
      return;
    }

    const settingsY = await getCurrentAcademicYearId();
    setSettingsYearId(settingsY);

    const primary = primaryFacilityIdFromScope(s);
    const prev = activeFacilityRef.current;
    const active = prev && s.facilityIds.includes(prev) ? prev : primary;
    if (active !== prev) setActiveFacilityId(active);

    const years = await fetchAcademicYears();
    const headerY =
      selectedHeaderYearId && years.some((y) => String(y.id) === selectedHeaderYearId)
        ? selectedHeaderYearId
        : pickDefaultHeaderYear(years, s.academicYearId);
    if (headerY !== selectedHeaderYearId) setSelectedHeaderYearId(headerY);

    await checkEatingLocation(active, headerY, settingsY);

    const { data: facMeta } = await supabase
      .from('facilities')
      .select('name, type')
      .eq('id', active)
      .maybeSingle();
    setFacilityTitle(facMeta?.name ? String(facMeta.name) : '');
    setFacilityType(
      String(facMeta?.type || '').toLowerCase() === 'kindergarten' ? 'kindergarten' : 'school'
    );

    await fetchCatererId(active);
    await resolvePermissions(s, active);
  }, [
    scopeLoader,
    fetchAcademicYears,
    selectedHeaderYearId,
    pickDefaultHeaderYear,
    checkEatingLocation,
    fetchCatererId,
    resolvePermissions,
    activeFacilityId,
  ]);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      try {
        await load();
      } catch (e: unknown) {
        if (!c) setError(e instanceof Error ? e.message : 'Mensa konnte nicht geladen werden');
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await fetchAcademicYears();
      await load();
      setStatsTick((t) => t + 1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Mensa konnte nicht geladen werden');
    }
    setRefreshing(false);
  };

  const selectedYearLabel = useMemo(() => {
    const y = academicYears.find((a) => String(a.id) === String(selectedHeaderYearId));
    if (!y) return '—';
    return formatAcademicYearLabel(y) + (y.is_current ? ' (aktuell)' : '');
  }, [academicYears, selectedHeaderYearId]);

  const multiFacility = scope && scope.facilityIds.length > 1;

  const openDayDelivery = (day: Date) => {
    setDeliveryDay(day);
    setDeliveryModalOpen(true);
  };

  if (!scope?.facilityIds.length && !loading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + SCREEN_HEADER_TOP_PAD }]}>
        <Text style={styles.h1}>Mensa</Text>
        <Text style={styles.muted}>Keine Einrichtung geladen.</Text>
      </View>
    );
  }

  const fid = activeFacilityId || (scope ? primaryFacilityIdFromScope(scope) : null);

  return (
    <View style={[styles.root, { paddingTop: insets.top + SCREEN_HEADER_TOP_PAD, paddingBottom: insets.bottom + 8 }]}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.scrollPad}
      >
        <View style={styles.headerRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.h1}>Mensa</Text>
            {facilityTitle ? <Text style={styles.facilityName}>{facilityTitle}</Text> : null}
          </View>
          <View style={styles.headerActions}>
            {multiFacility ? (
              <TouchableOpacity style={styles.iconBtn} onPress={() => setFacilityPickerOpen(true)}>
                <MaterialIcons name="business" size={22} color="#374151" />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.yearCompact} onPress={() => setYearPickerOpen(true)}>
              <Text style={styles.yearCompactText} numberOfLines={1}>
                {selectedYearLabel}
              </Text>
              <MaterialIcons name="arrow-drop-down" size={22} color="#374151" />
            </TouchableOpacity>
            {canEditSettings ? (
              <TouchableOpacity style={styles.iconBtn} onPress={() => setShowSettings(true)}>
                <MaterialIcons name="settings" size={22} color="#374151" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {error ? <Text style={styles.err}>{error}</Text> : null}

        {checkingLocation ? (
          <Text style={styles.muted}>Essensbereich wird geprüft…</Text>
        ) : hasEatingLocation === false ? (
          <View style={styles.warnBox}>
            <Text style={styles.warnTitle}>Kein Essensbereich konfiguriert</Text>
            <Text style={styles.warnBody}>
              Für diese Einrichtung und dieses Schuljahr ist noch kein Eating-Location-Eintrag hinterlegt.
            </Text>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} />
        ) : fid ? (
          <View style={isWide ? styles.scrollWide : undefined}>
            <MensaStatsCards
              key={`${fid}-${statsTick}`}
              facilityId={fid}
              facilityType={facilityType}
            />
            <MensaMealPlanSection
              key={`${fid}-${selectedHeaderYearId}-${statsTick}`}
              facilityId={fid}
              selectedHeaderYearId={selectedHeaderYearNum}
              onDayInfo={openDayDelivery}
            />
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={yearPickerOpen} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setYearPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Schuljahr</Text>
            <FlatList
              data={academicYears}
              keyExtractor={(it) => String(it.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalRow}
                  onPress={() => {
                    setSelectedHeaderYearId(String(item.id));
                    setYearPickerOpen(false);
                  }}
                >
                  <Text style={styles.modalRowText}>
                    {formatAcademicYearLabel(item)}
                    {item.is_current ? ' (aktuell)' : ''}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={facilityPickerOpen} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setFacilityPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Einrichtung</Text>
            <FlatList
              data={scope?.facilityIds || []}
              keyExtractor={(id) => id}
              renderItem={({ item }) => (
                <FacilityPickerRow
                  id={item}
                  selected={item === fid}
                  onPick={async () => {
                    activeFacilityRef.current = item;
                    setActiveFacilityId(item);
                    setFacilityPickerOpen(false);
                    setLoading(true);
                    try {
                      await load();
                    } finally {
                      setLoading(false);
                    }
                  }}
                />
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <MensaDayDeliveryModal
        visible={deliveryModalOpen}
        onClose={() => setDeliveryModalOpen(false)}
        facilityId={fid || ''}
        settingsYearId={settingsYearId}
        day={deliveryDay}
      />

      {fid && settingsYearId ? (
        <MensaSettingsModal
          visible={showSettings}
          onClose={() => setShowSettings(false)}
          facilityId={fid}
          settingsYearId={settingsYearId}
          facilityType={facilityType || 'school'}
          initialCatererId={catererId}
          onSaved={() => {
            fetchCatererId(fid);
            load();
          }}
        />
      ) : null}
    </View>
  );
}

function FacilityPickerRow({
  id,
  selected,
  onPick,
}: {
  id: string;
  selected: boolean;
  onPick: () => void;
}) {
  const [name, setName] = useState(id);
  useEffect(() => {
    let c = false;
    (async () => {
      const { data } = await supabase.from('facilities').select('name').eq('id', id).maybeSingle();
      if (!c && data?.name) setName(String(data.name));
    })();
    return () => {
      c = true;
    };
  }, [id]);
  return (
    <TouchableOpacity style={[styles.modalRow, selected && styles.modalRowSel]} onPress={onPick}>
      <Text style={styles.modalRowText}>{name}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16, backgroundColor: '#f9fafb' },
  scrollPad: { paddingBottom: 32 },
  scrollWide: { maxWidth: 900, alignSelf: 'center', width: '100%' },
  headerRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  titleBlock: { flex: 1, minWidth: 0 },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    marginLeft: 'auto',
  },
  h1: { fontSize: 20, fontWeight: '700', color: '#111827' },
  facilityName: { fontSize: 15, color: '#374151', marginTop: 4 },
  yearCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 140,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: '#fff',
  },
  yearCompactText: { fontSize: 13, color: '#111827', fontWeight: '500', flexShrink: 1 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  muted: { color: '#6b7280', marginTop: 8 },
  warnBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  warnTitle: { fontWeight: '700', color: '#854d0e' },
  warnBody: { color: '#713f12', marginTop: 6, fontSize: 14 },
  err: { color: '#111827', marginBottom: 8 },
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
  modalRowSel: { backgroundColor: '#F8FAFC' },
  modalRowText: { fontSize: 16, color: '#111827' },
});
