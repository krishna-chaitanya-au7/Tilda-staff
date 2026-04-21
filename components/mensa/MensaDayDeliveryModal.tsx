import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

type MealRow = {
  id: string;
  childName: string;
  className?: string;
  starter?: string;
  main?: string;
  dessert?: string;
  allergies: string[];
};

type Props = {
  visible: boolean;
  onClose: () => void;
  facilityId: string;
  /** Web TodaysDeliveryTable uses currentAcademicYear from UserContext */
  settingsYearId: string | null;
  day: Date | null;
};

export function MensaDayDeliveryModal({ visible, onClose, facilityId, settingsYearId, day }: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<MealRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const ymd = day ? format(day, 'yyyy-MM-dd') : '';

  const load = useCallback(async () => {
    if (!facilityId || !ymd || !settingsYearId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: mealSelectionsData, error: mealSelectionsError } = await supabase
        .from('meal_selections')
        .select(
          `
          id,
          user_id,
          date,
          menuline_id,
          main_meal_allergy,
          dessert_allergy,
          starter_allergy,
          facility_id,
          user:user_id ( id, first_name, family_name )
        `
        )
        .eq('date', ymd)
        .eq('facility_id', facilityId)
        .eq('is_deleted', false)
        .eq('is_skipped', false)
        .not('user_id', 'is', null);

      if (mealSelectionsError) throw mealSelectionsError;
      if (!mealSelectionsData?.length) {
        setRows([]);
        return;
      }

      const menulineIds = [...new Set(mealSelectionsData.map((s: { menuline_id: string }) => s.menuline_id))];
      const menulineDetailsMap = new Map<string, unknown>();
      await Promise.all(
        menulineIds.map(async (menulineId) => {
          const uniqueId = `${ymd}-${menulineId}`;
          const { data } = await supabase
            .from('menuline_details')
            .select(
              `
              menuline_id,
              starter_recipe:starter(title),
              main_course_recipe:main_course(title),
              dessert_recipe:dessert(title)
            `
            )
            .eq('unique_id', uniqueId)
            .maybeSingle();
          if (data) menulineDetailsMap.set(menulineId, data);
        })
      );

      const out: MealRow[] = [];
      for (const selection of mealSelectionsData as any[]) {
        const menulineDetail = menulineDetailsMap.get(selection.menuline_id) as any;
        const u = Array.isArray(selection.user) ? selection.user[0] : selection.user;
        const childName = u
          ? [u.first_name, u.family_name].filter(Boolean).join(' ') || 'Kind'
          : 'Kind';

        const { data: classData } = await supabase
          .from('children_info')
          .select('class')
          .eq('facility_id', selection.facility_id)
          .eq('user_id', selection.user_id)
          .eq('academic_year', settingsYearId)
          .maybeSingle();

        const allergies: string[] = [];
        if (selection.starter_allergy) allergies.push('Vorspeise');
        if (selection.main_meal_allergy) allergies.push('Hauptgericht');
        if (selection.dessert_allergy) allergies.push('Dessert');

        const sr = menulineDetail?.starter_recipe;
        const mr = menulineDetail?.main_course_recipe;
        const dr = menulineDetail?.dessert_recipe;

        out.push({
          id: selection.id,
          childName,
          className: classData?.class || undefined,
          starter: Array.isArray(sr) ? sr[0]?.title : sr?.title,
          main: Array.isArray(mr) ? mr[0]?.title : mr?.title,
          dessert: Array.isArray(dr) ? dr[0]?.title : dr?.title,
          allergies,
        });
      }
      setRows(out);
    } catch (e: any) {
      setError(e?.message || 'Laden fehlgeschlagen');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [facilityId, ymd, settingsYearId]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const title = day
    ? format(day, 'EEEE, d. MMMM yyyy', { locale: de })
    : 'Tagesdetails';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.close}>Schließen</Text>
          </TouchableOpacity>
        </View>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={styles.err}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>Keine Essensauswahl für diesen Tag.</Text>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {rows.map((r) => (
              <View key={r.id} style={styles.card}>
                <Text style={styles.name}>{r.childName}</Text>
                {r.className ? <Text style={styles.meta}>Klasse/Gruppe: {r.className}</Text> : null}
                {r.allergies.length > 0 ? (
                  <Text style={styles.allergy}>Allergie: {r.allergies.join(', ')}</Text>
                ) : null}
                {r.starter ? <Text style={styles.line}>Vorspeise: {r.starter}</Text> : null}
                {r.main ? <Text style={styles.line}>Hauptgericht: {r.main}</Text> : null}
                {r.dessert ? <Text style={styles.line}>Dessert: {r.dessert}</Text> : null}
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingTop: 48, paddingHorizontal: 16, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827', flex: 1 },
  close: { color: '#0a7ea4', fontWeight: '600' },
  err: { color: '#b91c1c' },
  empty: { color: '#6b7280', marginTop: 24, textAlign: 'center' },
  list: { paddingBottom: 32 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  name: { fontSize: 16, fontWeight: '600', color: '#111827' },
  meta: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  allergy: { fontSize: 13, color: '#b45309', marginTop: 8, fontWeight: '600' },
  line: { fontSize: 14, color: '#374151', marginTop: 6 },
});
