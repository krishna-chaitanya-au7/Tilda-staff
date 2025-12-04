import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, ActivityIndicator, RefreshControl, TouchableOpacity, Text, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

// Dashboard Card Component
const DashboardCard = ({ title, value, icon, color, bgColor, onPress }: any) => (
  <TouchableOpacity 
    style={[styles.card, { backgroundColor: bgColor || '#fff' }]} 
    onPress={onPress}
    activeOpacity={onPress ? 0.7 : 1}
  >
    <View style={[styles.iconContainer, { backgroundColor: color ? `${color}20` : '#f0f0f0' }]}>
      <Ionicons name={icon} size={24} color={color || '#333'} />
    </View>
    <View style={styles.cardContent}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={[styles.cardValue, { color: color || '#000' }]}>{value}</Text>
    </View>
  </TouchableOpacity>
);

export default function SupervisorDashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isLandscape = width > 768;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [stats, setStats] = useState({
    children: 0,
    facilities: 0,
    groups: 0,
    users: 0,
    tickets: 0,
    caterers: 0
  });

  const [currentAcademicYear, setCurrentAcademicYear] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get Supervisor Profile
      const { data: userRow } = await supabase
        .from('users')
        .select('id, first_name, family_name, record_id')
        .eq('auth_id', user.id)
        .single();

      const supervisorId = userRow?.record_id || userRow?.id;

      // Fetch Academic Year
      const { data: years } = await supabase
        .from('academic_years')
        .select('id, is_current')
        .order('year', { ascending: false });
      
      let ayId = null;
      if (years && years.length > 0) {
         const current = years.find(y => y.is_current);
         ayId = current ? current.id : years[0].id;
         setCurrentAcademicYear(ayId);
      }

      // 1. Resolve Facilities (Coordinator + Owned)
      const { data: coordinatorLinks } = await supabase
         .from('supervisor_coordinator_facilities')
         .select('facility_id')
         .eq('staff_user_id', userRow?.id);
         
      const coordinatorIds = coordinatorLinks?.map((l: any) => l.facility_id) || [];

      const { data: ownedFacilities } = await supabase
         .from('facilities')
         .select('id, caterer_id')
         .eq('supervisor_id', supervisorId)
         .eq('is_deleted', false);

      const ownedIds = ownedFacilities?.map(f => f.id) || [];
      const allFacilityIds = Array.from(new Set([...coordinatorIds, ...ownedIds]));
      
      // Stats
      
      // Facilities
      const facilityCount = allFacilityIds.length;
      
      // Caterers
      const catererIds = new Set(ownedFacilities?.map(f => f.caterer_id).filter(Boolean));
      const catererCount = catererIds.size;

      if (allFacilityIds.length > 0 && ayId) {
          // Children (Updated Logic)
          const { count: childCount } = await supabase
            .from('children_info')
            .select('*', { count: 'exact', head: true })
            .in('facility_id', allFacilityIds)
            .eq('academic_year', ayId)
            .eq('is_active', true)
            .eq('is_approved', true)
            .eq('is_deleted', false);

          // Users (Fetch unique user_ids)
          const { data: childrenUsers } = await supabase
            .from('children_info')
            .select('user_id')
            .in('facility_id', allFacilityIds)
            .eq('academic_year', ayId)
            .eq('is_active', true)
            .eq('is_approved', true)
            .eq('is_deleted', false);
            
          const uniqueUsers = new Set(childrenUsers?.map(c => c.user_id) || []);
          
          // Groups (Classes)
          const { data: facilitiesData } = await supabase
            .from('facilities')
            .select('facility_settings')
            .in('id', allFacilityIds);
            
          let groupCount = 0;
          facilitiesData?.forEach((f: any) => {
             if (f.facility_settings?.classes) {
                groupCount += f.facility_settings.classes.length;
             }
          });

          // Tickets (New)
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          const { count: ticketCount } = await supabase
             .from('ticket_assignees')
             .select('ticket_id, tickets!inner(created_at, status)', { count: 'exact', head: true })
             .eq('supervisor_id', supervisorId)
             .gte('tickets.created_at', sevenDaysAgo.toISOString())
             .eq('tickets.status', 'open');

          setStats({
             children: childCount || 0,
             facilities: facilityCount,
             groups: groupCount,
             users: uniqueUsers.size,
             tickets: ticketCount || 0,
             caterers: catererCount
          });
      } else {
          setStats({ children: 0, facilities: 0, groups: 0, users: 0, tickets: 0, caterers: 0 });
      }

    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerContainer}>
        <ThemedText style={styles.headerTitle}>Übersicht</ThemedText>
      </View>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <View style={styles.grid}>
            <DashboardCard 
              title="Kinder" 
              value={stats.children} 
              icon="people" 
              color="#3B82F6" // blue-500
              bgColor="#EFF6FF" // blue-50
              onPress={() => router.push('/supervisor/attendance')}
            />
            <DashboardCard 
              title="Einrichtungen" 
              value={stats.facilities} 
              icon="business" 
              color="#22C55E" // green-500
              bgColor="#F0FDF4" // green-50
              // onPress={() => router.push('/supervisor/facilities')} // No route yet
            />
             <DashboardCard 
              title="Neue Tickets" 
              value={stats.tickets} 
              icon="ticket" 
              color="#F59E0B" // amber-500
              bgColor="#FFFBEB" // amber-50
              // onPress={() => router.push('/supervisor/tickets')} // No route yet
            />
            <DashboardCard 
              title="Gruppen" 
              value={stats.groups} 
              icon="school" 
              color="#10B981" // emerald-500
              bgColor="#ECFDF5" // emerald-50
              onPress={() => router.push('/supervisor/grouping')}
            />
            <DashboardCard 
              title="Caterer" 
              value={stats.caterers} 
              icon="restaurant" 
              color="#06B6D4" // cyan-500
              bgColor="#ECFEFF" // cyan-50
            />
            <DashboardCard 
              title="Benutzer" 
              value={stats.users} 
              icon="person" 
              color="#14B8A6" // teal-500
              bgColor="#F0FDFA" // teal-50
            />
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  center: {
    padding: 40,
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  card: {
    width: '47%', // roughly half minus gap
    padding: 16,
    borderRadius: 16,
    minHeight: 120,
    justifyContent: 'space-between',
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardContent: {
    gap: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  cardValue: {
    fontSize: 24,
    fontWeight: '700',
  },
});
