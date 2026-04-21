import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, ScrollView } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { supabase } from '@/lib/supabase';

interface SupervisionScheduleItem {
  day: string;
  supervision: string;
  lunch: string;
}

interface KindergartenScheduleItem {
  day: string;
  lunch: string;
  drop_time: string;
  pickup_time: string;
}

interface BetreuungsplanTabProps {
  childId: string;
  facilityId: string;
  academicYearId: string;
  /** 'kindergarten_schedule' for facility/kindergarten, 'supervision_schedule' for school */
  scheduleField?: 'supervision_schedule' | 'kindergarten_schedule';
}

export default function BetreuungsplanTab({
  childId,
  facilityId,
  academicYearId,
  scheduleField = 'supervision_schedule',
}: BetreuungsplanTabProps) {
  const [schedule, setSchedule] = useState<SupervisionScheduleItem[]>([]);
  const [kgSchedule, setKgSchedule] = useState<KindergartenScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSchedule = async () => {
      if (!childId || !facilityId || !academicYearId) return;

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('children_info')
          .select('supervision_schedule, kindergarten_schedule')
          .eq('user_id', childId)
          .eq('facility_id', facilityId)
          .eq('academic_year', academicYearId)
          .maybeSingle();

        if (error) throw error;
        setSchedule(data?.supervision_schedule || []);
        setKgSchedule(data?.kindergarten_schedule || []);
      } catch (error) {
        console.error('Error fetching betreuungsplan:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSchedule();
  }, [childId, facilityId, academicYearId]);

  const germanDayMap: Record<string, string> = {
    Mon: 'Montag',
    Tue: 'Dienstag',
    Wed: 'Mittwoch',
    Thu: 'Donnerstag',
    Fri: 'Freitag',
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <ThemedText>Loading betreuungsplan...</ThemedText>
      </View>
    );
  }

  const displaySchedule = scheduleField === 'kindergarten_schedule' ? kgSchedule : schedule;
  if (displaySchedule.length === 0) {
    return (
      <View style={styles.center}>
        <ThemedText style={styles.emptyText}>Kein Betreuungsplan vorhanden</ThemedText>
      </View>
    );
  }

  if (scheduleField === 'kindergarten_schedule') {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.header}>
            <ThemedText style={styles.headerCell}>Tag</ThemedText>
            <ThemedText style={styles.headerCell}>Bringzeit</ThemedText>
            <ThemedText style={styles.headerCell}>Abholzeit</ThemedText>
            <ThemedText style={styles.headerCell}>Essen</ThemedText>
          </View>
          {kgSchedule.map((item, index) => (
            <View key={index} style={styles.row}>
              <ThemedText style={styles.cell}>{germanDayMap[item.day] || item.day}</ThemedText>
              <ThemedText style={styles.cell}>{item.drop_time || '-'}</ThemedText>
              <ThemedText style={styles.cell}>{item.pickup_time || '-'}</ThemedText>
              <View style={styles.cell}>
                <View style={[styles.badge, item.lunch === 'kein Essen' ? styles.bgGray : styles.bgAmber]}>
                  <ThemedText style={[styles.badgeText, item.lunch === 'kein Essen' ? styles.textGray : styles.textAmber]}>
                    {item.lunch || '-'}
                  </ThemedText>
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.header}>
          <ThemedText style={styles.headerCell}>Tag</ThemedText>
          <ThemedText style={styles.headerCell}>Betreuung</ThemedText>
          <ThemedText style={styles.headerCell}>Essen</ThemedText>
        </View>
        {schedule.map((item, index) => (
          <View key={index} style={styles.row}>
            <ThemedText style={styles.cell}>
              {germanDayMap[item.day] || item.day}
            </ThemedText>
            <View style={styles.cell}>
              <View
                style={[
                  styles.badge,
                  item.supervision === 'keine Betreuung'
                    ? styles.bgGray
                    : item.supervision === 'Kurzgruppe'
                    ? styles.bgBlue
                    : styles.bgGreen,
                ]}
              >
                <ThemedText
                  style={[
                    styles.badgeText,
                    item.supervision === 'keine Betreuung'
                      ? styles.textGray
                      : item.supervision === 'Kurzgruppe'
                      ? styles.textBlue
                      : styles.textGreen,
                  ]}
                >
                  {item.supervision}
                </ThemedText>
              </View>
            </View>
            <View style={styles.cell}>
              <View
                style={[
                  styles.badge,
                  item.lunch === 'kein Essen' ? styles.bgGray : styles.bgAmber,
                ]}
              >
                <ThemedText
                  style={[
                    styles.badgeText,
                    item.lunch === 'kein Essen'
                      ? styles.textGray
                      : styles.textAmber,
                  ]}
                >
                  {item.lunch}
                </ThemedText>
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: 8,
  },
  center: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#666',
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerCell: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    alignItems: 'center',
  },
  cell: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  bgGray: { backgroundColor: '#F3F4F6' },
  textGray: { color: '#374151' },
  bgBlue: { backgroundColor: '#DBEAFE' },
  textBlue: { color: '#1E40AF' },
  bgGreen: { backgroundColor: '#DCFCE7' },
  textGreen: { color: '#15803D' },
  bgAmber: { backgroundColor: '#FEF3C7' },
  textAmber: { color: '#92400E' },
});







