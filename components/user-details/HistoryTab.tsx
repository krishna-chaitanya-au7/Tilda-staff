import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, ScrollView } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { supabase } from '@/lib/supabase';

interface ChildHistoryData {
  id: string;
  user_id: string;
  facility_id: string;
  academic_year: string;
  class?: string;
  supervision_schedule?: Array<{
    day: string;
    supervision: string;
    lunch: string;
  }>;
  kindergarten_schedule?: Array<{
    day: string;
    lunch: string;
    drop_time: string;
    pickup_time: string;
  }>;
  facility?: {
    name: string;
    facility_type: string;
  };
  academic_years?: {
    year: string;
  };
}

interface HistoryTabProps {
  childId: string;
  currentAcademicYearId: string;
}

export default function HistoryTab({ childId, currentAcademicYearId }: HistoryTabProps) {
  const [historyData, setHistoryData] = useState<ChildHistoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistoryData = async () => {
      if (!childId || !currentAcademicYearId) return;

      setLoading(true);
      try {
        // 1. Get all academic years to find previous one
        const { data: academicYears, error: yearsError } = await supabase
          .from('academic_years')
          .select('*')
          .order('year', { ascending: false });

        if (yearsError) throw yearsError;

        const currentYearIndex = academicYears.findIndex(y => y.id === currentAcademicYearId);
        const previousYear = academicYears[currentYearIndex + 1];

        if (!previousYear) {
          setError('No previous academic year found');
          setLoading(false);
          return;
        }

        // 2. Fetch child info for previous year
        const { data, error: historyError } = await supabase
          .from('children_info')
          .select(`
            *,
            facility:facilities(name, facility_type),
            academic_years:academic_years(year)
          `)
          .eq('user_id', childId)
          .eq('academic_year', previousYear.id);

        if (historyError) throw historyError;
        setHistoryData(data || []);
      } catch (err: any) {
        console.error('Error fetching history:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchHistoryData();
  }, [childId, currentAcademicYearId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <ThemedText>Loading history...</ThemedText>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <ThemedText style={styles.errorText}>{error}</ThemedText>
      </View>
    );
  }

  if (historyData.length === 0) {
    return (
      <View style={styles.center}>
        <ThemedText style={styles.emptyText}>No historical data available</ThemedText>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {historyData.map((data, index) => (
        <View key={data.id} style={styles.card}>
          <View style={styles.header}>
            <ThemedText style={styles.title}>
              Academic Year: {data.academic_years?.year || 'Unknown'}
            </ThemedText>
          </View>

          <View style={styles.section}>
            <ThemedText style={styles.label}>Facility</ThemedText>
            <ThemedText style={styles.value}>{data.facility?.name || '-'}</ThemedText>
            <ThemedText style={styles.value}>{data.facility?.facility_type || '-'}</ThemedText>
            <ThemedText style={styles.value}>Class: {data.class || '-'}</ThemedText>
          </View>

          {data.supervision_schedule && data.supervision_schedule.length > 0 && (
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Supervision Schedule</ThemedText>
              {data.supervision_schedule.map((item, idx) => (
                <View key={idx} style={styles.scheduleRow}>
                  <ThemedText style={styles.day}>{item.day}</ThemedText>
                  <View style={styles.tags}>
                    <View style={styles.tag}>
                      <ThemedText style={styles.tagText}>{item.supervision}</ThemedText>
                    </View>
                    <View style={styles.tag}>
                      <ThemedText style={styles.tagText}>{item.lunch}</ThemedText>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      ))}
    </ScrollView>
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
  errorText: {
    color: '#B91C1C',
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  header: {
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#374151',
  },
  label: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  value: {
    fontSize: 14,
    color: '#111827',
    marginBottom: 4,
  },
  scheduleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  day: {
    fontSize: 13,
    width: 80,
    color: '#374151',
  },
  tags: {
    flexDirection: 'row',
    gap: 4,
  },
  tag: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 11,
    color: '#4B5563',
  },
});











