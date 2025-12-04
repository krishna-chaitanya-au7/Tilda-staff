import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

interface Metrics {
  totalChildren: number;
  newTickets: number;
  pendingApprovals: number;
  totalClasses: number;
  newSickApprovals: number;
  totalSickChildrenToday: number;
}

export default function FacilityHomeScreen() {
  const [facilityName, setFacilityName] = useState<string | null>(null);
  const [cityName, setCityName] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics>({
    totalChildren: 0,
    newTickets: 0,
    pendingApprovals: 0,
    totalClasses: 0,
    newSickApprovals: 0,
    totalSickChildrenToday: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setError('Not authenticated');
          setLoading(false);
          return;
        }

        // Find facility access for this user
        const { data: accessRow, error: accessError } = await supabase
          .from('user_access')
          .select('resource_id, facility_id')
          .eq('user_id', user.id)
          .eq('resource_type', 'facility')
          .maybeSingle<{ resource_id: string; facility_id?: string }>();

        if (accessError || !accessRow) {
          setError('No facility access found for this account.');
          setLoading(false);
          return;
        }

        const facilityId = accessRow.resource_id || accessRow.facility_id;
        if (!facilityId) {
          setError('Facility ID missing in user access.');
          setLoading(false);
          return;
        }

        // Load facility basic info
        const { data: facility, error: facilityError } = await supabase
          .from('facilities')
          .select('name, city_name, facility_settings')
          .eq('id', facilityId)
          .maybeSingle<{ name: string | null; city_name: string | null; facility_settings: any }>();

        if (facilityError || !facility) {
          setError('Failed to load facility information.');
          setLoading(false);
          return;
        }

        setFacilityName(facility.name);
        setCityName(facility.city_name);

        // For now, we don’t load academic year; this will be wired later.
        // Use a simple query that ignores academic_year to get approximate counts,
        // mirroring the structure of the web SchoolDashboard.

        const today = new Date().toISOString().split('T')[0];
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const [
          approvedChildren,
          pendingApprovals,
          openTicketsLast7Days,
          sickPendingLast7Days,
          sickToday,
        ] = await Promise.all([
          supabase
            .from('children_info')
            .select('id')
            .eq('facility_id', facilityId)
            .eq('is_active', true)
            .eq('is_approved', true)
            .eq('is_deleted', false),
          supabase
            .from('children_info')
            .select('id')
            .eq('facility_id', facilityId)
            .eq('is_approved', false)
            .eq('is_deleted', false),
          supabase
            .from('ticket_assignees')
            .select('ticket_id, tickets!inner(created_at, status)')
            .eq('facility_id', facilityId)
            .gte('tickets.created_at', sevenDaysAgo.toISOString())
            .eq('tickets.status', 'open'),
          supabase
            .from('child_leaves')
            .select('id')
            .eq('facility_id', facilityId)
            .eq('status', 'pending')
            .gte('created_at', sevenDaysAgo.toISOString()),
          supabase
            .from('child_leaves')
            .select('id')
            .eq('facility_id', facilityId)
            .eq('status', 'approved')
            .lte('date', today)
            .gte('date_to', today),
        ]);

        const totalClasses = Array.isArray(facility.facility_settings?.classes)
          ? facility.facility_settings.classes.length
          : 0;

        setMetrics({
          totalChildren: approvedChildren.data?.length || 0,
          pendingApprovals: pendingApprovals.data?.length || 0,
          newTickets: openTicketsLast7Days.data?.length || 0,
          totalClasses,
          newSickApprovals: sickPendingLast7Days.data?.length || 0,
          totalSickChildrenToday: sickToday.data?.length || 0,
        });
      } catch (err) {
        console.error('Error loading facility dashboard:', err);
        setError('Failed to load dashboard.');
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
        <ThemedText style={styles.loadingText}>Loading facility dashboard…</ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>{error}</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        Dashboard Overview
      </ThemedText>
      <ThemedText style={styles.subtitle}>
        {facilityName || 'Unknown facility'}
        {cityName ? ` – ${cityName}` : ''}
      </ThemedText>

      <View style={styles.grid}>
        <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>Kinder</ThemedText>
          <ThemedText style={styles.cardValue}>{metrics.totalChildren}</ThemedText>
        </View>
        <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>Ausstehende Bewilligungen</ThemedText>
          <ThemedText style={styles.cardValue}>{metrics.pendingApprovals}</ThemedText>
        </View>
        <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>Neue Tickets (7 Tage)</ThemedText>
          <ThemedText style={styles.cardValue}>{metrics.newTickets}</ThemedText>
        </View>
        <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>Gruppen</ThemedText>
          <ThemedText style={styles.cardValue}>{metrics.totalClasses}</ThemedText>
        </View>
        <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>Ausstehende Befreiungen (7 Tage)</ThemedText>
          <ThemedText style={styles.cardValue}>{metrics.newSickApprovals}</ThemedText>
        </View>
        <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>Abgemeldete Kinder (heute)</ThemedText>
          <ThemedText style={styles.cardValue}>{metrics.totalSickChildrenToday}</ThemedText>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  title: {
    marginBottom: 8,
  },
  subtitle: {
    marginBottom: 16,
    fontSize: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 16,
  },
  card: {
    width: '48%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  cardTitle: {
    fontSize: 14,
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 28,
    fontWeight: '700',
  },
});


