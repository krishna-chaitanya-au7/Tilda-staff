import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, ScrollView } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { supabase } from '@/lib/supabase';

interface ScheduleItem {
  id: string;
  subject: string;
  color: string;
  day: string;
  from: string;
  to: string;
}

interface StundenplanTabProps {
  userId: string;
}

export default function StundenplanTab({ userId }: StundenplanTabProps) {
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSchedule = async () => {
      if (!userId) return;

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('child_time_table')
          .select('*')
          .eq('child_id', userId);

        if (error) throw error;
        setSchedule(data || []);
      } catch (error) {
        console.error('Error fetching schedule:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSchedule();
  }, [userId]);

  const weekdays = [
    { en: 'Monday', de: 'Montag' },
    { en: 'Tuesday', de: 'Dienstag' },
    { en: 'Wednesday', de: 'Mittwoch' },
    { en: 'Thursday', de: 'Donnerstag' },
    { en: 'Friday', de: 'Freitag' }
  ];

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <ThemedText>Lädt Stundenplan...</ThemedText>
      </View>
    );
  }

  if (schedule.length === 0) {
    return (
      <View style={styles.center}>
        <ThemedText style={styles.emptyText}>Kein Stundenplan vorhanden</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {weekdays.map((dayObj) => {
        const dayItems = schedule
          .filter((item) => item.day === dayObj.en)
          .sort((a, b) => a.from.localeCompare(b.from));

        if (dayItems.length === 0) return null;

        return (
          <View key={dayObj.en} style={styles.dayCard}>
            <ThemedText style={styles.dayTitle}>{dayObj.de}</ThemedText>
            {dayItems.map((item) => (
              <View key={item.id} style={[styles.item, { borderLeftColor: item.color || '#ccc' }]}>
                <View style={styles.timeContainer}>
                  <ThemedText style={styles.time}>{item.from.slice(0,5)}</ThemedText>
                  <ThemedText style={styles.time}>-</ThemedText>
                  <ThemedText style={styles.time}>{item.to.slice(0,5)}</ThemedText>
                </View>
                <ThemedText style={styles.subject}>{item.subject}</ThemedText>
              </View>
            ))}
          </View>
        );
      })}
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
  dayCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  dayTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#111827',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F9FAFB',
    marginBottom: 4,
    borderRadius: 4,
    borderLeftWidth: 4,
  },
  timeContainer: {
    width: 90,
    flexDirection: 'row',
    gap: 4,
  },
  time: {
    fontSize: 13,
    color: '#6B7280',
    fontVariant: ['tabular-nums'],
  },
  subject: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
});
