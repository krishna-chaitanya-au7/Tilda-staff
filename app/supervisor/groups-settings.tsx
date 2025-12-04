import React, { useEffect, useState } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator, 
  Alert, 
  Modal, 
  FlatList 
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

// --- Types ---
interface Group {
  id: string;
  name: string;
  supervisor_id: string;
  day: string;
  facility_id: string;
  is_deleted: boolean;
}

interface Facility {
  id: string;
  name: string;
}

const DAYS = [
  { value: "Mon", label: "Montag", short: "Mon" },
  { value: "Tue", label: "Dienstag", short: "Die" },
  { value: "Wed", label: "Mittwoch", short: "Mit" },
  { value: "Thu", label: "Donnerstag", short: "Don" },
  { value: "Fri", label: "Freitag", short: "Fre" },
];

// --- Components ---
const Dropdown = ({ label, value, options, onSelect }: { label: string, value: string, options: {label: string, value: string}[], onSelect: (val: string) => void }) => {
   const [visible, setVisible] = useState(false);
   const selectedLabel = options.find(o => o.value === value)?.label || label;

   return (
      <View style={styles.dropdownContainer}>
         <TouchableOpacity style={styles.dropdownButton} onPress={() => setVisible(true)}>
            <Text style={styles.dropdownText} numberOfLines={1}>{selectedLabel}</Text>
            <Ionicons name="chevron-down" size={14} color="#666" />
         </TouchableOpacity>
         <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
            <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setVisible(false)}>
               <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>{label}</Text>
                  <FlatList
                     data={options}
                     keyExtractor={item => item.value}
                     renderItem={({ item }) => (
                        <TouchableOpacity 
                           style={[styles.modalItem, item.value === value && styles.modalItemSelected]}
                           onPress={() => { onSelect(item.value); setVisible(false); }}
                        >
                           <Text style={[styles.modalItemText, item.value === value && styles.modalItemTextSelected]}>{item.label}</Text>
                        </TouchableOpacity>
                     )}
                  />
               </View>
            </TouchableOpacity>
         </Modal>
      </View>
   );
};

export default function GroupsSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [groups, setGroups] = useState<Group[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [supervisorId, setSupervisorId] = useState<string>('');
  const [userRow, setUserRow] = useState<any>(null);

  // Create Form State
  const [newGroupName, setNewGroupName] = useState('');
  const [createDay, setCreateDay] = useState('');
  const [createFacility, setCreateFacility] = useState('');

  // Filter State
  const [filterDay, setFilterDay] = useState('all');
  const [filterFacility, setFilterFacility] = useState('all');

  useEffect(() => {
    fetchInitialData();
  }, []);

  // Realtime subscriptions
  useEffect(() => {
    if (!supervisorId) return;

    const groupsChannel = supabase.channel("groups-changes").on(
      "postgres_changes",
      { event: "*", schema: "public", table: "supervisor_groups", filter: `supervisor_id=eq.${supervisorId}` },
      (payload) => {
        if (payload.eventType === "INSERT") setGroups(prev => [payload.new as Group, ...prev]);
        if (payload.eventType === "UPDATE") {
          const newGroup = payload.new as Group;
          if (newGroup.is_deleted) {
             setGroups(prev => prev.filter(g => g.id !== newGroup.id));
          } else {
             setGroups(prev => prev.map(g => g.id === newGroup.id ? newGroup : g));
          }
        }
        if (payload.eventType === "DELETE") setGroups(prev => prev.filter(g => g.id !== payload.old.id));
      }
    ).subscribe();

    return () => { groupsChannel.unsubscribe(); };
  }, [supervisorId]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase.from('users').select('id, record_id').eq('auth_id', user.id).single();
      if (!userData) return;
      setUserRow(userData);
      const supId = userData.record_id || userData.id;
      setSupervisorId(supId);

      // Fetch Facilities
      const { data: owned } = await supabase.from('facilities').select('id, name').eq('supervisor_id', supId).eq('is_deleted', false);
      const { data: coord } = await supabase.from('supervisor_coordinator_facilities').select('facility:facilities(id, name, supervisor_id)').eq('staff_user_id', userData.id);
      
      const ownedList = owned || [];
      const coordList = coord?.map((c: any) => c.facility) || [];
      // Combine and Dedupe
      const allFacs = [...ownedList, ...coordList].filter((v,i,a)=>a.findIndex(t=>(t.id===v.id))===i);
      setFacilities(allFacs);

      // Determine effective Supervisor ID
      // If user is a coordinator (has coord facilities but no owned facilities), use the supervisor_id from the first facility.
      let effectiveSupervisorId = supId;
      if (ownedList.length === 0 && coordList.length > 0 && coordList[0]?.supervisor_id) {
        effectiveSupervisorId = coordList[0].supervisor_id;
      }
      setSupervisorId(effectiveSupervisorId);

      // Fetch Groups
      let query = supabase.from('supervisor_groups').select('*').eq('supervisor_id', effectiveSupervisorId).eq('is_deleted', false).order('created_at', { ascending: false });
      if (coordList.length > 0 && ownedList.length === 0) {
         // Coordinator only? Scope to accessible facilities?
         // Web app logic: if Coordinator, filter by accessible_facilities.
         // Here we have allFacs.
         const ids = allFacs.map(f => f.id);
         if (ids.length > 0) query = query.in('facility_id', ids);
      }
      
      const { data: groupsData } = await query;
      setGroups(groupsData || []);

    } catch (err) {
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !createDay || !createFacility) {
      Alert.alert('Error', 'Group name, day, and facility are required');
      return;
    }

    try {
      const { error } = await supabase.from('supervisor_groups').insert([{
        name: newGroupName.trim(),
        supervisor_id: supervisorId,
        day: createDay,
        facility_id: createFacility,
        is_deleted: false
      }]);

      if (error) throw error;
      
      setNewGroupName('');
      setCreateDay('');
      setCreateFacility('');
      Alert.alert('Success', 'Group created successfully');
    } catch (err) {
      Alert.alert('Error', 'Failed to create group');
    }
  };

  const handleDeleteGroup = (groupId: string, groupName: string) => {
    Alert.alert(
      'Delete Group',
      `Are you sure you want to delete "${groupName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: async () => {
            const { error } = await supabase
              .from('supervisor_groups')
              .update({ is_deleted: true })
              .eq('id', groupId);
            if (error) {
               Alert.alert('Error', 'Failed to delete group');
            } else {
               setGroups(prev => prev.filter(g => g.id !== groupId));
            }
          }
        }
      ]
    );
  };

  const filteredGroups = groups.filter(g => {
    if (filterDay !== 'all' && g.day !== filterDay) return false;
    if (filterFacility !== 'all' && g.facility_id !== filterFacility) return false;
    return true;
  });

  const getFacilityName = (id: string) => facilities.find(f => f.id === id)?.name || 'Unknown';
  const getDayLabel = (val: string) => DAYS.find(d => d.value === val)?.label || val;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Gruppeneinstellungen</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        
        {/* Create Group Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Neue Gruppe erstellen</Text>
          
          <View style={styles.formGroup}>
            <TextInput
              style={styles.input}
              placeholder="Gruppenname"
              value={newGroupName}
              onChangeText={setNewGroupName}
            />
            
            <Dropdown 
              label="Tag wählen"
              value={createDay}
              options={DAYS}
              onSelect={setCreateDay}
            />

            <Dropdown 
              label="Einrichtung wählen"
              value={createFacility}
              options={facilities.map(f => ({ label: f.name, value: f.id }))}
              onSelect={setCreateFacility}
            />

            <TouchableOpacity style={styles.createButton} onPress={handleCreateGroup}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.createButtonText}>Gruppe erstellen</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* List Section */}
        <View style={styles.card}>
          <View style={styles.listHeader}>
            <Text style={styles.cardTitle}>Vorhandene Gruppen</Text>
          </View>

          {/* Filters */}
          <View style={styles.filtersRow}>
            <View style={{ flex: 1 }}>
               <Dropdown 
                  label="Nach Einrichtung filtern"
                  value={filterFacility}
                  options={[{ label: 'Alle Einrichtungen', value: 'all' }, ...facilities.map(f => ({ label: f.name, value: f.id }))]}
                  onSelect={setFilterFacility}
               />
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
               <Dropdown 
                  label="Nach Tag filtern"
                  value={filterDay}
                  options={[{ label: 'Alle Tage', value: 'all' }, ...DAYS]}
                  onSelect={setFilterDay}
               />
            </View>
          </View>

          {/* List */}
          <View style={styles.listContainer}>
            {filteredGroups.length === 0 ? (
              <Text style={styles.emptyText}>Keine Gruppen gefunden</Text>
            ) : (
              filteredGroups.map(group => (
                <View key={group.id} style={styles.groupRow}>
                  <View style={styles.groupInfo}>
                    <Text style={styles.groupName}>{group.name}</Text>
                    <View style={styles.badges}>
                      <View style={styles.badgeGray}>
                        <Text style={styles.badgeText}>{getFacilityName(group.facility_id)}</Text>
                      </View>
                      <View style={styles.badgeGray}>
                        <Text style={styles.badgeText}>{getDayLabel(group.day)}</Text>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity 
                    style={styles.deleteButton}
                    onPress={() => handleDeleteGroup(group.id, group.name)}
                  >
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        </View>

      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 16, 
    paddingTop: 16, 
    paddingBottom: 8, 
    backgroundColor: '#fff', 
    borderBottomWidth: 1, 
    borderBottomColor: '#E5E5EA' 
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
  },
  backButton: { marginRight: 12 },
  content: { padding: 16 },
  
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: '600', marginBottom: 16, color: '#111827' },
  
  formGroup: { gap: 12 },
  input: { borderWidth: 1, borderColor: '#E5E5EA', borderRadius: 8, padding: 12, fontSize: 14, backgroundColor: '#fff' },
  
  createButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827', padding: 12, borderRadius: 8, gap: 8, marginTop: 4 },
  createButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  // Dropdown
  dropdownContainer: { marginBottom: 0 },
  dropdownButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#E5E5EA', borderRadius: 8, padding: 12, backgroundColor: '#fff' },
  dropdownText: { fontSize: 14, color: '#333' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 8, width: '80%', maxHeight: 400 },
  modalTitle: { fontSize: 16, fontWeight: '600', padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee', marginBottom: 4 },
  modalItem: { padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0' },
  modalItemSelected: { backgroundColor: '#F3F4F6' },
  modalItemText: { fontSize: 14, color: '#333' },
  modalItemTextSelected: { fontWeight: '600', color: '#007AFF' },

  // List
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  filtersRow: { flexDirection: 'row', marginBottom: 16 },
  listContainer: { gap: 8 },
  emptyText: { textAlign: 'center', color: '#999', padding: 20 },
  
  groupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: '#F9FAFB', borderRadius: 8 },
  groupInfo: { gap: 4 },
  groupName: { fontWeight: '600', fontSize: 14, color: '#1F2937' },
  badges: { flexDirection: 'row', gap: 6 },
  badgeGray: { backgroundColor: '#E5E7EB', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12 },
  badgeText: { fontSize: 10, color: '#374151' },
  
  deleteButton: { padding: 8, backgroundColor: '#FEF2F2', borderRadius: 8 },
});
