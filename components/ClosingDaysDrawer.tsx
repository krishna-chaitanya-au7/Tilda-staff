import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { addMonths, startOfMonth } from 'date-fns';
import ClosingDaysMonthGrid from '@/components/ClosingDaysMonthGrid';
import { saveFacilitySettingsForYear } from '@/lib/facilitySettingsYear';

type Props = {
  visible: boolean;
  onClose: () => void;
  facilityId: string;
  academicYearId: string;
  /** Current closing days when opening (full list, same as web sheet). */
  initialYmd: string[];
  onSaved: (ymd: string[]) => void | Promise<void>;
};

export default function ClosingDaysDrawer({
  visible,
  onClose,
  facilityId,
  academicYearId,
  initialYmd,
  onSaved,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const drawerW = Math.min(400, Math.floor(winW * 0.92));

  const [pendingYmd, setPendingYmd] = useState<Set<string>>(new Set());
  const [monthDisplay, setMonthDisplay] = useState(() => startOfMonth(new Date()));
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  const initialKey = useMemo(() => initialYmd.slice().sort().join(','), [initialYmd]);

  useEffect(() => {
    if (visible) {
      setPendingYmd(new Set(initialYmd.map(String)));
      setMonthDisplay(startOfMonth(new Date()));
      setCalendarExpanded(false);
    }
  }, [visible, initialKey, initialYmd]);

  const count = pendingYmd.size;
  const countLabel = useMemo(() => {
    if (count === 0) return 'Keine Tage gewählt';
    if (count === 1) return '1 Tag gewählt';
    return `${count} Tage gewählt`;
  }, [count]);

  const toggleDate = (ymd: string) => {
    setPendingYmd((prev) => {
      const n = new Set(prev);
      if (n.has(ymd)) n.delete(ymd);
      else n.add(ymd);
      return n;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const sorted = Array.from(pendingYmd).sort();
      await saveFacilitySettingsForYear(facilityId, academicYearId, { closing_days: sorted });
      await onSaved(sorted);
      onClose();
    } catch {
      Alert.alert('Fehler', 'Schließtage konnten nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.dimFlex} onPress={onClose} />
        <View
          style={[
            styles.drawer,
            {
              width: drawerW,
              paddingTop: insets.top + 8,
              paddingBottom: insets.bottom + 12,
            },
          ]}
        >
          <View style={styles.drawerHeader}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.drawerTitle}>Schließ- und Feiertag hinzufügen</Text>
              <Text style={styles.drawerSub}>
                Wähle Tage an denen die Einrichtung geschlossen ist
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Schließen">
              <Ionicons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.drawerScroll}
            contentContainerStyle={styles.drawerScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.fieldLbl}>Gewählte Tage</Text>
            <TouchableOpacity
              style={styles.countRow}
              onPress={() => setCalendarExpanded((e) => !e)}
              activeOpacity={0.7}
            >
              <Ionicons name="calendar-outline" size={22} color="#6b7280" />
              <Text style={styles.countText}>{countLabel}</Text>
              <Ionicons
                name={calendarExpanded ? 'chevron-up' : 'chevron-down'}
                size={20}
                color="#9ca3af"
                style={{ marginLeft: 'auto' }}
              />
            </TouchableOpacity>

            {calendarExpanded ? (
              <View style={styles.calSection}>
                <ClosingDaysMonthGrid
                  visibleMonth={monthDisplay}
                  selectedYmd={pendingYmd}
                  interactive
                  selectedVariant="solid"
                  onToggleDate={toggleDate}
                  onPrevMonth={() => setMonthDisplay((m) => addMonths(m, -1))}
                  onNextMonth={() => setMonthDisplay((m) => addMonths(m, 1))}
                />
              </View>
            ) : null}
          </ScrollView>

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Speichern</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  dimFlex: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  drawer: {
    backgroundColor: '#fff',
    maxWidth: '100%',
    height: '100%',
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  drawerSub: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  drawerScroll: { flex: 1 },
  drawerScrollContent: { paddingHorizontal: 16, paddingBottom: 16 },
  fieldLbl: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  countText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  calSection: { marginTop: 12 },
  saveBtn: {
    marginHorizontal: 16,
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
