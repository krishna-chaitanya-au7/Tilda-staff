import { useEffect, useState, useMemo } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { ThemedText } from '@/components/themed-text';
import { supabase } from '@/lib/supabase';

interface Leave {
  id: string;
  date: string;
  date_to?: string;
  note: string;
  status: string;
  leave_type: 'days' | 'hours';
  hourly_from?: string;
  hourly_to?: string;
}

interface SickLeaveListProps {
  userId: string;
}

export default function SickLeaveList({ userId }: SickLeaveListProps) {
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('Alle');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('Alle');

  useEffect(() => {
    const fetchLeaves = async () => {
      if (!userId) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('child_leaves')
          .select('id, date, date_to, leave_type, status, note, hourly_from, hourly_to')
          .eq('child_id', userId)
          .order('date', { ascending: false });

        if (error) throw error;
        setLeaves(data || []);
      } catch (error) {
        console.error('Error fetching leaves:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaves();
  }, [userId]);

  const filteredLeaves = useMemo(() => {
     return leaves.filter(l => {
        if (statusFilter !== 'Alle' && l.status !== statusFilter) return false;
        if (leaveTypeFilter !== 'Alle') {
           if (leaveTypeFilter === 'Ganztägig' && l.leave_type !== 'days') return false;
           if (leaveTypeFilter === 'Stündlich' && l.leave_type !== 'hours') return false;
        }
        return true;
     });
  }, [leaves, statusFilter, leaveTypeFilter]);

  const renderFilterChip = (label: string, selected: boolean, onPress: () => void, key: string) => (
     <TouchableOpacity 
        key={key}
        style={[styles.chip, selected && styles.chipSelected]}
        onPress={onPress}
     >
        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
     </TouchableOpacity>
  );

  const formatTime = (isoString?: string) => {
      if (!isoString) return '';
      try {
          return format(parseISO(isoString), 'HH:mm');
      } catch (e) {
          return '';
      }
  };

  const renderItem = ({ item }: { item: Leave }) => (
    <View style={styles.card}>
       <View style={styles.cardHeader}>
          <Text style={styles.dateText}>
             {format(parseISO(item.date), 'dd.MM.yyyy', { locale: de })}
             {item.leave_type === 'days' && item.date_to && item.date_to !== item.date 
                ? ` - ${format(parseISO(item.date_to), 'dd.MM.yyyy', { locale: de })}` 
                : ''}
          </Text>
          <View style={[
              styles.badge, 
              item.status === 'approved' ? styles.badgeGreen : 
              item.status === 'rejected' ? styles.badgeRed : styles.badgeOrange
          ]}>
             <Text style={[
                 styles.badgeText, 
                 item.status === 'approved' ? styles.textGreen : 
                 item.status === 'rejected' ? styles.textRed : styles.textOrange
             ]}>
                {item.status === 'approved' ? 'Genehmigt' : 
                 item.status === 'pending_approval' ? 'Ausstehend' : 
                 item.status === 'rejected' ? 'Abgelehnt' : item.status}
             </Text>
          </View>
       </View>
       
       <View style={styles.row}>
          <Text style={styles.label}>Typ:</Text>
          <Text style={styles.value}>{item.leave_type === 'days' ? 'Ganztägig' : 'Stündlich'}</Text>
       </View>

       {item.leave_type === 'hours' && (
          <View style={styles.row}>
             <Text style={styles.label}>Zeit:</Text>
             <Text style={styles.value}>
                {formatTime(item.hourly_from)} - {formatTime(item.hourly_to)}
             </Text>
          </View>
       )}

       {item.note && (
          <View style={styles.row}>
             <Text style={styles.label}>Grund:</Text>
             <Text style={styles.value}>{item.note}</Text>
          </View>
       )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <ThemedText>Loading abmeldungen...</ThemedText>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
       {/* Filters */}
       <View style={styles.filtersContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
             {['Alle', 'approved', 'pending_approval', 'rejected'].map(s => 
                renderFilterChip(
                    s === 'approved' ? 'Genehmigt' : 
                    s === 'pending_approval' ? 'Ausstehend' : 
                    s === 'rejected' ? 'Abgelehnt' : s, 
                statusFilter === s, 
                () => setStatusFilter(s),
                s)
             )}
             <View style={styles.divider} />
             {['Alle', 'Ganztägig', 'Stündlich'].map(t => 
                renderFilterChip(t, leaveTypeFilter === t, () => setLeaveTypeFilter(t), t)
             )}
          </ScrollView>
       </View>

       <FlatList
         data={filteredLeaves}
         keyExtractor={item => item.id}
         renderItem={renderItem}
         contentContainerStyle={styles.list}
         scrollEnabled={false}
         ListEmptyComponent={
            <View style={styles.center}>
               <Text style={styles.emptyText}>Keine Abmeldungen gefunden</Text>
            </View>
         }
       />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#666',
  },
  filtersContainer: {
    marginBottom: 12,
    flexDirection: 'row',
  },
  divider: {
    width: 1,
    backgroundColor: '#ccc',
    marginHorizontal: 8,
    height: 20,
    alignSelf: 'center',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#fff',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  chipSelected: {
    backgroundColor: '#E5E5EA',
    borderColor: '#ccc',
  },
  chipText: {
    fontSize: 12,
    color: '#666',
  },
  chipTextSelected: {
    color: '#000',
    fontWeight: '600',
  },
  list: {
    paddingBottom: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dateText: {
    fontSize: 14,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  badgeGreen: { backgroundColor: '#E8F5E9' },
  textGreen: { color: '#2E7D32' },
  badgeOrange: { backgroundColor: '#FFF3E0' },
  textOrange: { color: '#EF6C00' },
  badgeRed: { backgroundColor: '#FFEBEE' },
  textRed: { color: '#C62828' },
  row: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  label: {
    width: 60,
    fontSize: 12,
    color: '#666',
  },
  value: {
    fontSize: 12,
    color: '#333',
    flex: 1,
  },
});
