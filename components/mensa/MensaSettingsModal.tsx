import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  FlatList,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import {
  getFacilitySettingsForYear,
  saveFacilitySettingsForYear,
  useFacilitiesTable,
} from '@/lib/facilitySettingsYear';

type Caterer = { id: string; name: string };
type EatingLoc = { id: string; name: string | null; facility_ids: unknown };

function parseFacilityIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseTimeStringToTodayDate(timeStr: string | undefined | null): Date {
  const d = new Date();
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

function formatTimeHm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Free typing like web `<input type="time">`: digits → HH:mm */
function normalizeTypedHm(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

const WEEKDAYS = [
  { value: 'Monday', label: 'Montag' },
  { value: 'Tuesday', label: 'Dienstag' },
  { value: 'Wednesday', label: 'Mittwoch' },
  { value: 'Thursday', label: 'Donnerstag' },
  { value: 'Friday', label: 'Freitag' },
  { value: 'Saturday', label: 'Samstag' },
  { value: 'Sunday', label: 'Sonntag' },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  facilityId: string;
  /** Web CatererSettingsDialog uses currentAcademicYear from UserContext */
  settingsYearId: string | null;
  facilityType: 'school' | 'kindergarten';
  initialCatererId: string;
  onSaved: () => void;
};

export function MensaSettingsModal({
  visible,
  onClose,
  facilityId,
  settingsYearId,
  facilityType,
  initialCatererId,
  onSaved,
}: Props) {
  const yearNum = settingsYearId != null ? Number(settingsYearId) : null;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allCaterers, setAllCaterers] = useState<Caterer[]>([]);
  const [catererSearch, setCatererSearch] = useState('');
  const [catererPickerOpen, setCatererPickerOpen] = useState(false);

  const [selectedCatererId, setSelectedCatererId] = useState('');
  const [selectedMenulines, setSelectedMenulines] = useState<string[]>([]);
  const [classPrices, setClassPrices] = useState<
    Record<string, { tax: number; price: number; price_without_tax: number }>
  >({});
  const [cutOffMealSelection, setCutOffMealSelection] = useState<{ day: string; time: string } | null>(
    null
  );
  const [skipButtonCutOff, setSkipButtonCutOff] = useState<{ time: string } | null>(null);
  const [canSkipMeals, setCanSkipMeals] = useState(false);
  const [showUserAutoSelect, setShowUserAutoSelect] = useState(false);
  const [eatingLocationOptions, setEatingLocationOptions] = useState<EatingLoc[]>([]);
  const [selectedEatingLocationId, setSelectedEatingLocationId] = useState('');
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const [cutOffTimePickerVisible, setCutOffTimePickerVisible] = useState(false);
  const [skipTimePickerVisible, setSkipTimePickerVisible] = useState(false);

  const fetchAllCaterers = useCallback(async () => {
    const { data, error } = await supabase.from('caterers').select('id, name').eq('is_deleted', false);
    if (error) throw error;
    setAllCaterers((data || []) as Caterer[]);
  }, []);

  const fetchFacilityDetails = useCallback(async () => {
    if (!settingsYearId || !facilityId) return;
    const resolved = await getFacilitySettingsForYear(facilityId, settingsYearId);
    const { data: facilityData, error: facilityError } = await supabase
      .from('facilities')
      .select('caterer_id, default_menuline, can_skip_meals, cut_off_meal_selection, skip_button_cut_off')
      .eq('id', facilityId)
      .single();
    if (facilityError) throw facilityError;

    const { data: menuLinesData, error: menuLinesError } = await supabase
      .from('facility_menuline')
      .select('menuline_id')
      .eq('facility_id', facilityId)
      .eq('is_deleted', false)
      .eq('academic_year', yearNum ?? 1);
    if (menuLinesError) throw menuLinesError;

    const catererId = resolved.caterer_id ?? facilityData?.caterer_id ?? '';
    setSelectedCatererId(String(catererId));
    setSelectedMenulines((menuLinesData || []).map((ml: { menuline_id: string }) => ml.menuline_id));

    setClassPrices((resolved.facility_settings as { class_prices?: typeof classPrices })?.class_prices || {});
    const co = facilityData?.cut_off_meal_selection as { day?: string; time?: string } | null | undefined;
    setCutOffMealSelection(
      co && typeof co === 'object'
        ? { day: String(co.day ?? 'Monday'), time: String(co.time ?? '') }
        : null
    );
    const sb = facilityData?.skip_button_cut_off as { time?: string } | null | undefined;
    setSkipButtonCutOff(
      sb && typeof sb === 'object' ? { time: String(sb.time ?? '') } : null
    );
    setCanSkipMeals(!!facilityData?.can_skip_meals);
    setShowUserAutoSelect(!!resolved.show_user_auto_select);
  }, [facilityId, settingsYearId, yearNum]);

  const resetAndLoad = useCallback(async () => {
    if (!visible) return;
    setLoading(true);
    setSelectedCatererId(initialCatererId);
    try {
      await fetchAllCaterers();
      await fetchFacilityDetails();
    } catch (e) {
      console.warn('mensa settings load', e);
    } finally {
      setLoading(false);
    }
  }, [visible, initialCatererId, fetchAllCaterers, fetchFacilityDetails]);

  useEffect(() => {
    resetAndLoad();
  }, [resetAndLoad]);

  useEffect(() => {
    if (!visible) {
      setCutOffTimePickerVisible(false);
      setSkipTimePickerVisible(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !selectedCatererId || settingsYearId == null) {
      setEatingLocationOptions([]);
      setSelectedEatingLocationId('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('eating_locations')
          .select('id, name, facility_ids')
          .eq('caterer_id', selectedCatererId)
          .eq('is_deleted', false)
          .order('name', { ascending: true })
          .eq('academic_year', settingsYearId);
        if (error) throw error;
        if (cancelled) return;
        const rows = (data || []) as EatingLoc[];
        setEatingLocationOptions(rows);
        const linked = rows.find((el) => parseFacilityIds(el.facility_ids).includes(facilityId));
        setSelectedEatingLocationId(linked?.id ?? '');
      } catch {
        if (!cancelled) {
          setEatingLocationOptions([]);
          setSelectedEatingLocationId('');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, selectedCatererId, settingsYearId, facilityId]);

  const persistEatingLocationAssignment = async (yearId: number) => {
    if (!selectedEatingLocationId) return;

    const { data: candidates, error: candError } = await supabase
      .from('eating_locations')
      .select('id, facility_ids')
      .eq('academic_year', yearId)
      .eq('is_deleted', false);
    if (candError) throw candError;

    for (const row of candidates || []) {
      const ids = parseFacilityIds(row.facility_ids);
      if (!ids.includes(facilityId)) continue;
      if (row.id === selectedEatingLocationId) continue;
      const next = ids.filter((id) => id !== facilityId);
      const { error } = await supabase.from('eating_locations').update({ facility_ids: next }).eq('id', row.id);
      if (error) throw error;
    }

    const { data: selectedRow, error: selError } = await supabase
      .from('eating_locations')
      .select('facility_ids')
      .eq('id', selectedEatingLocationId)
      .single();
    if (selError) throw selError;
    const currentIds = parseFacilityIds(selectedRow?.facility_ids);
    if (!currentIds.includes(facilityId)) {
      const { error } = await supabase
        .from('eating_locations')
        .update({ facility_ids: [...currentIds, facilityId] })
        .eq('id', selectedEatingLocationId);
      if (error) throw error;
    }
  };

  const handleSave = async () => {
    if (!selectedCatererId) return;
    if (selectedMenulines.length === 0) return;
    const yearId = yearNum ?? 1;
    const useFac = useFacilitiesTable(yearId);
    setSaving(true);
    try {
      if (useFac) {
        const { error: facilityError } = await supabase
          .from('facilities')
          .update({
            caterer_id: selectedCatererId,
            can_skip_meals: canSkipMeals,
            cut_off_meal_selection: cutOffMealSelection,
            skip_button_cut_off: skipButtonCutOff,
            show_user_auto_select: showUserAutoSelect,
          })
          .eq('id', facilityId);
        if (facilityError) throw facilityError;
      } else {
        await saveFacilitySettingsForYear(facilityId, yearId, {
          caterer_id: selectedCatererId,
          show_user_auto_select: showUserAutoSelect,
        });
        const { error: facilityError } = await supabase
          .from('facilities')
          .update({
            can_skip_meals: canSkipMeals,
            cut_off_meal_selection: cutOffMealSelection,
            skip_button_cut_off: skipButtonCutOff,
          })
          .eq('id', facilityId);
        if (facilityError) throw facilityError;
      }

      const { data: existingMenuLines, error: fetchError } = await supabase
        .from('facility_menuline')
        .select('menuline_id, is_deleted')
        .eq('facility_id', facilityId)
        .eq('academic_year', yearId);
      if (fetchError) throw fetchError;

      const existingMenuLineIds = existingMenuLines?.map((item) => item.menuline_id) || [];
      const menuLinesToAdd = selectedMenulines.filter((id) => !existingMenuLineIds.includes(id));
      if (menuLinesToAdd.length > 0) {
        const { error: insertError } = await supabase.from('facility_menuline').insert(
          menuLinesToAdd.map((menulineId) => ({
            facility_id: facilityId,
            menuline_id: menulineId,
            is_deleted: false,
            academic_year: yearId,
          }))
        );
        if (insertError) throw insertError;
      }

      const menuLinesToRemove =
        existingMenuLines?.filter(
          (item) => !selectedMenulines.includes(item.menuline_id) && !item.is_deleted
        ) || [];
      if (menuLinesToRemove.length > 0) {
        const ids = menuLinesToRemove.map((item) => item.menuline_id);
        const { error: updateError } = await supabase
          .from('facility_menuline')
          .update({ is_deleted: true })
          .in('menuline_id', ids)
          .eq('facility_id', facilityId)
          .eq('academic_year', yearId);
        if (updateError) throw updateError;
      }

      await persistEatingLocationAssignment(yearId);
      onSaved();
      onClose();
    } catch (e) {
      console.warn('save mensa settings', e);
    } finally {
      setSaving(false);
    }
  };

  const filteredCaterers = useMemo(() => {
    const q = catererSearch.trim().toLowerCase();
    if (!q) return allCaterers;
    return allCaterers.filter((c) => c.name.toLowerCase().includes(q));
  }, [allCaterers, catererSearch]);

  const selectedCatererName = allCaterers.find((c) => c.id === selectedCatererId)?.name || 'Caterer auswählen';

  const priceEntries = Object.entries(classPrices);

  const cutOffTimeDate = useMemo(
    () => parseTimeStringToTodayDate(cutOffMealSelection?.time),
    [cutOffMealSelection?.time]
  );
  const skipTimeDate = useMemo(
    () => parseTimeStringToTodayDate(skipButtonCutOff?.time),
    [skipButtonCutOff?.time]
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.settingsModalBody}>
        <View style={styles.root}>
        <View style={styles.topBar}>
          <Text style={styles.title}>Mensa-Einstellungen</Text>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Schließen"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <MaterialIcons name="close" size={26} color="#374151" />
          </TouchableOpacity>
        </View>
        <Text style={styles.sub}>
          Konfigurieren Sie die Mensa-Einstellungen für die Schule.
        </Text>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} />
        ) : (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Caterer</Text>
              <Text style={styles.hint}>Caterer auswählen</Text>
              <TouchableOpacity style={styles.fieldBtn} onPress={() => setCatererPickerOpen(true)}>
                <Text numberOfLines={1}>{selectedCatererName}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.block}>
              <Text style={styles.blockTitle}>Lieferort</Text>
              <Text style={styles.hint}>
                Essenslieferort des Caterers für diese Einrichtung (Schuljahr).
              </Text>
              {!settingsYearId ? (
                <Text style={styles.muted}>Schuljahr wird geladen…</Text>
              ) : !selectedCatererId ? (
                <Text style={styles.muted}>Bitte zuerst einen Caterer auswählen.</Text>
              ) : eatingLocationOptions.length === 0 ? (
                <Text style={styles.muted}>Keine Lieferorte für diesen Caterer in diesem Schuljahr.</Text>
              ) : (
                <>
                  <Text style={styles.hint}>Lieferort auswählen</Text>
                  {eatingLocationOptions.map((el) => (
                    <TouchableOpacity
                      key={el.id}
                      style={[styles.radio, selectedEatingLocationId === el.id && styles.radioSel]}
                      onPress={() => setSelectedEatingLocationId(el.id)}
                    >
                      <Text>{el.name?.trim() || 'Ohne Namen'}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </View>

            <View style={styles.blockRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.blockTitle}>Ausgabeterminal</Text>
                <Text style={styles.hint}>
                  Diese Einrichtung benötigt Karten zur Identifizierung der Schüler (Ausgabeterminal).
                </Text>
              </View>
              <Switch value={false} disabled />
            </View>

            {priceEntries.length > 0 && (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>
                  {facilityType === 'kindergarten' ? 'Preise je Gruppe' : 'Preise je Klasse'}
                </Text>
                <Text style={styles.hint}>
                  Die individuellen Preise müssen durch den Caterer angepasst werden.
                </Text>
                <View style={styles.tableHdr}>
                  <Text style={[styles.cell, styles.cellH]}>{facilityType === 'kindergarten' ? 'Gruppe' : 'Klasse'}</Text>
                  <Text style={[styles.cell, styles.cellH]}>Preis (€)</Text>
                  <Text style={[styles.cell, styles.cellH]}>Steuer (%)</Text>
                  <Text style={[styles.cell, styles.cellH]}>o. Steuer</Text>
                </View>
                <ScrollView style={{ maxHeight: 200 }}>
                  {priceEntries.map(([className, priceData]) => (
                    <View key={className} style={styles.tableRow}>
                      <Text style={styles.cell}>{className}</Text>
                      <Text style={styles.cell}>{priceData.price.toFixed(2)}</Text>
                      <Text style={styles.cell}>{priceData.tax}</Text>
                      <Text style={styles.cell}>{priceData.price_without_tax.toFixed(2)}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.blockRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.blockTitle}>Vorauswahl für Eltern treffen?</Text>
                <Text style={styles.hint}>
                  Eltern erhalten eine vorausgewählte Essensbestellung, die sie bis zum Bestellschluss anpassen können.*
                </Text>
              </View>
              <Switch value={showUserAutoSelect} onValueChange={setShowUserAutoSelect} />
            </View>

            <View style={styles.block}>
              <Text style={styles.blockTitle}>Bestellschluss</Text>
              <Text style={styles.hint}>
                Bis wann haben Eltern Zeit die Bestellung für die Folgewoche abzuschließen?
              </Text>
              <View style={styles.sideBySideRow}>
                <TouchableOpacity
                  style={[styles.compactField, styles.dayField]}
                  onPress={() => setDayPickerOpen(true)}
                >
                  <Text style={styles.compactFieldText} numberOfLines={1}>
                    {WEEKDAYS.find((d) => d.value === cutOffMealSelection?.day)?.label || 'Montag'}
                  </Text>
                  <MaterialIcons name="arrow-drop-down" size={22} color="#374151" />
                </TouchableOpacity>
                <View style={styles.timeWithSuffix}>
                  <View style={styles.timeFieldInner}>
                    <MaterialIcons name="schedule" size={20} color="#6b7280" style={styles.timeIcon} />
                    <TextInput
                      style={styles.cutOffTimeInput}
                      value={cutOffMealSelection?.time ?? ''}
                      onChangeText={(t) =>
                        setCutOffMealSelection((prev) =>
                          prev
                            ? { ...prev, time: normalizeTypedHm(t) }
                            : { day: 'Monday', time: normalizeTypedHm(t) }
                        )
                      }
                      placeholder="--:--"
                      placeholderTextColor="#9ca3af"
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                    />
                    <TouchableOpacity
                      onPress={() => setCutOffTimePickerVisible(true)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialIcons name="arrow-drop-down" size={24} color="#374151" />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.uhrSuffix}>Uhr</Text>
                </View>
              </View>
            </View>

            <View style={styles.block}>
              <View style={styles.blockRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.blockTitle}>Einzelne Mahlzeiten abbestellen</Text>
                  <Text style={styles.hint}>Eltern dürfen Mahlzeiten einzeln abbestellen.*</Text>
                </View>
                <Switch value={canSkipMeals} onValueChange={setCanSkipMeals} />
              </View>
              <View style={styles.skipTimeRow}>
                <View style={styles.timeFieldInnerWide}>
                  <MaterialIcons name="schedule" size={20} color="#6b7280" style={styles.timeIcon} />
                  <TextInput
                    style={styles.skipTimeInput}
                    value={skipButtonCutOff?.time ?? ''}
                    onChangeText={(t) => setSkipButtonCutOff({ time: normalizeTypedHm(t) })}
                    placeholder="--:--"
                    placeholderTextColor="#9ca3af"
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                    editable={canSkipMeals}
                  />
                  <TouchableOpacity
                    onPress={() => canSkipMeals && setSkipTimePickerVisible(true)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    disabled={!canSkipMeals}
                  >
                    <MaterialIcons name="arrow-drop-down" size={24} color={canSkipMeals ? '#374151' : '#d1d5db'} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.skipTimeSuffix}>Uhr am jeweiligen Tag</Text>
              </View>
            </View>

            <Text style={styles.footnote}>
              *Die Einstellung der Klassen „Verpflichtendes Essen“ bleibt hiervon unberührt und ist dieser
              Einstellung übergeordnet.
            </Text>

            <View style={styles.actions}>
              <TouchableOpacity style={styles.outlineBtn} onPress={onClose} disabled={saving}>
                <Text>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, (!selectedCatererId || saving) && styles.disabled]}
                onPress={handleSave}
                disabled={!selectedCatererId || saving}
              >
                <Text style={styles.saveBtnText}>{saving ? 'Speichern…' : 'Speichern'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        <Modal
          visible={catererPickerOpen}
          animationType="slide"
          onRequestClose={() => setCatererPickerOpen(false)}
          presentationStyle="fullScreen"
        >
          <SafeAreaView style={styles.catererModalRoot} edges={['top', 'left', 'right']}>
            <KeyboardAvoidingView
              style={styles.catererKb}
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
            >
              <View style={styles.catererTopBar}>
                <Text style={styles.catererModalTitle}>Caterer auswählen</Text>
                <TouchableOpacity onPress={() => setCatererPickerOpen(false)}>
                  <Text style={styles.link}>Fertig</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.catererSearchInput}
                placeholder="Suchen…"
                value={catererSearch}
                onChangeText={setCatererSearch}
                autoCorrect={false}
                autoCapitalize="none"
                clearButtonMode={Platform.OS === 'ios' ? 'while-editing' : 'never'}
              />
              <FlatList
                style={styles.catererList}
                contentContainerStyle={styles.catererListContent}
                data={filteredCaterers}
                keyExtractor={(it) => it.id}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.modalRow}
                    onPress={() => {
                      setSelectedCatererId(item.id);
                      setCatererPickerOpen(false);
                    }}
                  >
                    <Text style={styles.modalRowText}>{item.name}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles.muted}>Keine Treffer.</Text>
                }
              />
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>

        <Modal visible={dayPickerOpen} transparent animationType="fade">
          <Pressable style={styles.modalBackdrop} onPress={() => setDayPickerOpen(false)}>
            <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
              {WEEKDAYS.map((d) => (
                <TouchableOpacity
                  key={d.value}
                  style={styles.modalRow}
                  onPress={() => {
                    setCutOffMealSelection((prev) =>
                      prev ? { ...prev, day: d.value } : { day: d.value, time: '' }
                    );
                    setDayPickerOpen(false);
                  }}
                >
                  <Text>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </Pressable>
          </Pressable>
        </Modal>
      </View>

      <Modal
        visible={cutOffTimePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCutOffTimePickerVisible(false)}
      >
        <Pressable
          style={styles.timePickerBackdrop}
          onPress={() => setCutOffTimePickerVisible(false)}
        >
          <View style={styles.timePickerCard} onStartShouldSetResponder={() => true}>
            <View style={styles.timePickerOkBar}>
              <TouchableOpacity onPress={() => setCutOffTimePickerVisible(false)}>
                <Text style={styles.timePickerOkText}>Fertig</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.timePickerInner}>
              <DateTimePicker
                value={cutOffTimeDate}
                mode="time"
                is24Hour
                display="spinner"
                design="default"
                {...(Platform.OS === 'ios'
                  ? { themeVariant: 'light' as const, textColor: '#111827' }
                  : {})}
                onChange={(_, d) => {
                  if (d) {
                    const t = formatTimeHm(d);
                    setCutOffMealSelection((prev) =>
                      prev ? { ...prev, time: t } : { day: 'Monday', time: t }
                    );
                  }
                }}
                style={styles.timePickerWheel}
              />
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={skipTimePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSkipTimePickerVisible(false)}
      >
        <Pressable
          style={styles.timePickerBackdrop}
          onPress={() => setSkipTimePickerVisible(false)}
        >
          <View style={styles.timePickerCard} onStartShouldSetResponder={() => true}>
            <View style={styles.timePickerOkBar}>
              <TouchableOpacity onPress={() => setSkipTimePickerVisible(false)}>
                <Text style={styles.timePickerOkText}>Fertig</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.timePickerInner}>
              <DateTimePicker
                value={skipTimeDate}
                mode="time"
                is24Hour
                display="spinner"
                design="default"
                {...(Platform.OS === 'ios'
                  ? { themeVariant: 'light' as const, textColor: '#111827' }
                  : {})}
                onChange={(_, d) => {
                  if (d) setSkipButtonCutOff({ time: formatTimeHm(d) });
                }}
                style={styles.timePickerWheel}
              />
            </View>
          </View>
        </Pressable>
      </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  settingsModalBody: { flex: 1 },
  root: { flex: 1, paddingTop: 48, backgroundColor: '#f9fafb' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  title: { fontSize: 20, fontWeight: '700', color: '#111827', flex: 1 },
  link: { color: '#0a7ea4', fontWeight: '600' },
  sub: { fontSize: 14, color: '#6b7280', paddingHorizontal: 16, marginTop: 8, marginBottom: 8 },
  scroll: { padding: 16, paddingBottom: 48 },
  block: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 12,
  },
  blockRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 12,
  },
  blockTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  hint: { fontSize: 13, color: '#6b7280', marginTop: 6 },
  muted: { fontSize: 13, color: '#9ca3af', marginTop: 8 },
  fieldBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
  },
  radio: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    marginTop: 8,
  },
  radioSel: { borderColor: '#0a7ea4', backgroundColor: '#f0f9ff' },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  tableHdr: { flexDirection: 'row', marginTop: 8, backgroundColor: '#f8fafc', paddingVertical: 8 },
  tableRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#eef2f6', paddingVertical: 10 },
  cell: { flex: 1, fontSize: 12, color: '#374151' },
  cellH: { fontWeight: '600', color: '#6b7280' },
  footnote: { fontSize: 11, color: '#6b7280', marginTop: 8, marginBottom: 16 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  outlineBtn: { padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  saveBtn: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 8, backgroundColor: '#111827' },
  saveBtnText: { color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.5 },
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
    maxHeight: '75%',
  },
  modalRow: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  modalRowText: { fontSize: 16, color: '#111827' },
  sideBySideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  compactField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 12,
    backgroundColor: '#fff',
    minHeight: 48,
  },
  dayField: { flex: 1, minWidth: 0 },
  compactFieldText: { flex: 1, fontSize: 15, color: '#111827' },
  timeWithSuffix: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  timeFieldInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#fff',
    minHeight: 48,
    minWidth: 0,
  },
  cutOffTimeInput: {
    flex: 1,
    minWidth: 72,
    fontSize: 15,
    color: '#111827',
    paddingVertical: 8,
    paddingHorizontal: 4,
    margin: 0,
  },
  timeFieldInnerWide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#fff',
    minHeight: 48,
    minWidth: 0,
  },
  skipTimeInput: {
    flex: 1,
    minWidth: 72,
    fontSize: 15,
    color: '#111827',
    paddingVertical: 8,
    paddingHorizontal: 4,
    margin: 0,
  },
  timeIcon: { marginRight: 8 },
  uhrSuffix: { fontSize: 14, color: '#6b7280', width: 36 },
  skipTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  skipTimeSuffix: { fontSize: 14, color: '#6b7280', flex: 1, minWidth: 120 },
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
  catererModalRoot: { flex: 1, backgroundColor: '#fff' },
  catererKb: { flex: 1 },
  catererTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  catererModalTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  catererSearchInput: {
    marginHorizontal: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#f9fafb',
  },
  catererList: { flex: 1 },
  catererListContent: { paddingBottom: 24 },
});
