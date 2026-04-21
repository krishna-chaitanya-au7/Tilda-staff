import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  ScrollView,
  Pressable,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { fetchMensaMealStats, type MensaAllergyDetail } from '@/components/mensa/mensaStats';

type Props = {
  facilityId: string;
  facilityType: 'school' | 'kindergarten' | null;
};

export function MensaStatsCards({ facilityId, facilityType }: Props) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalEaters: 0,
    todayEaters: 0,
    canceledMeals: 0,
    allergicMeals: 0,
  });
  const [canceledNames, setCanceledNames] = useState<string[]>([]);
  const [allergyDetails, setAllergyDetails] = useState<MensaAllergyDetail[]>([]);
  const [infoModal, setInfoModal] = useState<'canceled' | 'allergy' | null>(null);

  const load = useCallback(async () => {
    if (!facilityId) return;
    setLoading(true);
    try {
      const r = await fetchMensaMealStats({ facilityId, facilityType });
      setStats(r.stats);
      setCanceledNames(r.canceledUserNames);
      setAllergyDetails(r.allergyDetails);
    } catch (e) {
      console.warn('mensa stats', e);
      setStats({ totalEaters: 0, todayEaters: 0, canceledMeals: 0, allergicMeals: 0 });
      setCanceledNames([]);
      setAllergyDetails([]);
    } finally {
      setLoading(false);
    }
  }, [facilityId, facilityType]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      <StatCard
        title="Esser Gesamt"
        value={stats.totalEaters}
        icon={<MaterialIcons name="restaurant" size={20} color="#6b7280" />}
      />
      <StatCard
        title="Esser (Heute)"
        value={stats.todayEaters}
        icon={<MaterialIcons name="people" size={20} color="#6b7280" />}
      />
      <StatCard
        title="Abmeldungen (Heute)"
        value={stats.canceledMeals}
        icon={<MaterialIcons name="cancel" size={20} color="#6b7280" />}
        showInfo
        onInfo={() => setInfoModal('canceled')}
      />
      <StatCard
        title="Allergiker (Heute)"
        value={stats.allergicMeals}
        icon={<MaterialIcons name="warning" size={20} color="#6b7280" />}
        showInfo
        onInfo={() => setInfoModal('allergy')}
      />

      <Modal visible={infoModal !== null} transparent animationType="fade">
        <Pressable style={styles.backdrop} onPress={() => setInfoModal(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>
              {infoModal === 'canceled' ? 'Abmeldungen' : 'Allergiker'}
            </Text>
            <ScrollView style={styles.sheetScroll}>
              {infoModal === 'canceled' ? (
                canceledNames.length ? (
                  canceledNames
                    .slice()
                    .sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }))
                    .map((name, idx) => (
                      <Text key={idx} style={styles.sheetLine}>
                        {name}
                      </Text>
                    ))
                ) : (
                  <Text style={styles.muted}>Keine Abmeldungen heute</Text>
                )
              ) : allergyDetails.length ? (
                allergyDetails
                  .slice()
                  .sort((a, b) =>
                    a.childName.localeCompare(b.childName, 'de', { sensitivity: 'base' })
                  )
                  .map((detail, index) => (
                    <View key={index} style={styles.allergyBlock}>
                      <Text style={styles.allergyName}>{detail.childName}</Text>
                      {detail.allergicMeals.map((meal, mealIndex) => (
                        <Text key={mealIndex} style={styles.allergyMeal}>
                          {detail.allergyTypes[mealIndex]}: {meal}
                        </Text>
                      ))}
                    </View>
                  ))
              ) : (
                <Text style={styles.muted}>Keine Allergien heute</Text>
              )}
            </ScrollView>
            <TouchableOpacity onPress={() => setInfoModal(null)} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>Schließen</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function StatCard({
  title,
  value,
  icon,
  showInfo,
  onInfo,
}: {
  title: string;
  value: number;
  icon: ReactNode;
  showInfo?: boolean;
  onInfo?: () => void;
}) {
  return (
    <View style={styles.card}>
      {showInfo && onInfo ? (
        <TouchableOpacity style={styles.infoBtn} onPress={onInfo} hitSlop={12}>
          <MaterialIcons name="info-outline" size={16} color="#9ca3af" />
        </TouchableOpacity>
      ) : null}
      <View style={styles.cardInner}>
        <View style={styles.iconWrap}>{icon}</View>
        <View style={styles.cardText}>
          <Text style={styles.val}>{value}</Text>
          <Text style={styles.title}>{title}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { paddingVertical: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  card: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    position: 'relative',
  },
  cardInner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1 },
  val: { fontSize: 28, fontWeight: '600', color: '#111827' },
  title: { fontSize: 13, color: '#6b7280', fontWeight: '500', marginTop: 4 },
  infoBtn: { position: 'absolute', top: 8, right: 8, zIndex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    maxHeight: '70%',
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  sheetScroll: { maxHeight: 360 },
  sheetLine: { fontSize: 14, color: '#374151', marginBottom: 6 },
  muted: { fontSize: 14, color: '#9ca3af' },
  allergyBlock: { marginBottom: 12 },
  allergyName: { fontWeight: '600', fontSize: 14, color: '#111827' },
  allergyMeal: { fontSize: 13, color: '#4b5563', marginTop: 2 },
  closeBtn: { marginTop: 12, alignSelf: 'center' },
  closeBtnText: { color: '#0a7ea4', fontWeight: '700' },
});
