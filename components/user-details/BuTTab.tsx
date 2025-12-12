import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, ScrollView } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { supabase } from '@/lib/supabase';

interface ChildMandate {
  id: string;
  created_at: string;
  child_id: string;
  facility_id: string;
  begin: string;
  expires: string;
  billing_account: string;
  is_current: boolean | null;
  document_url: string | null;
  document_metadata: any | null;
  is_deleted: boolean;
}

interface BuTTabProps {
  childId: string;
  facilityId: string;
}

export default function BuTTab({ childId, facilityId }: BuTTabProps) {
  const [mandates, setMandates] = useState<ChildMandate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMandates = async () => {
      if (!childId || !facilityId) return;

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('child_mandates')
          .select('*')
          .eq('child_id', childId)
          .eq('facility_id', facilityId)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setMandates(data || []);
      } catch (error) {
        console.error('Error fetching mandates:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMandates();
  }, [childId, facilityId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <ThemedText>Loading mandates...</ThemedText>
      </View>
    );
  }

  if (mandates.length === 0) {
    return (
      <View style={styles.center}>
        <ThemedText style={styles.emptyText}>Kein Mandat vorhanden</ThemedText>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {mandates.map((mandate) => (
        <View key={mandate.id} style={styles.card}>
          <View style={styles.header}>
            <ThemedText style={styles.title}>Mandate</ThemedText>
            {mandate.is_current && (
              <View style={styles.badge}>
                <ThemedText style={styles.badgeText}>Active</ThemedText>
              </View>
            )}
          </View>
          
          <View style={styles.row}>
            <ThemedText style={styles.label}>Start:</ThemedText>
            <ThemedText style={styles.value}>
              {new Date(mandate.begin).toLocaleDateString('de-DE')}
            </ThemedText>
          </View>
          
          <View style={styles.row}>
            <ThemedText style={styles.label}>Ende:</ThemedText>
            <ThemedText style={styles.value}>
              {new Date(mandate.expires).toLocaleDateString('de-DE')}
            </ThemedText>
          </View>

          {mandate.document_url && (
            <View style={styles.row}>
              <ThemedText style={styles.label}>Dokument:</ThemedText>
              <ThemedText style={styles.link}>View Document</ThemedText>
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
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  badge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  badgeText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '500',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  label: {
    width: 80,
    fontSize: 14,
    color: '#6B7280',
  },
  value: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
  link: {
    color: '#2563EB',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
















