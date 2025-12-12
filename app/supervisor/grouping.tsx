import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View, Text, ActivityIndicator, TextInput, ScrollView, Modal, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

// --- Types ---
interface SupervisorGroup {
  id: string;
  name: string;
  day: string; // 'Mon', 'Tue', etc.
  facility_id: string;
  supervisor_id: string;
  is_deleted: boolean;
}

interface DailySchedule {
   day: string; // 'Mon', 'Tue'
   supervision?: string; // 'Langgruppe', 'Kurzgruppe', etc.
   lunch?: string; // 'Essen' or 'No'
}

interface ChildData {
  id: string;
  first_name: string;
  family_name: string;
  class?: string;
  group?: string;
  facility_id: string;
  academic_year: string;
  status: string; // 'active' | 'inactive'
  parents?: { id: string; first_name: string; family_name: string; email: string; phone?: string }[];
  allergies?: string[];
  is_bus_child?: boolean;
  pickup_info?: string;
  supervision_schedule: DailySchedule[];
  supervision_groups: { [key: string]: string | null };
}

interface FilterOption {
  label: string;
  value: string;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const DAY_MAP: { [key: string]: string } = {
   Mon: "Mon", Tue: "Die", Wed: "Mit", Thu: "Don", Fri: "Fre"
};
const DAY_FILTER_OPTIONS = [
   { label: 'Alle Tage', value: 'all' },
   { label: 'Montag', value: 'Mon' },
   { label: 'Dienstag', value: 'Tue' },
   { label: 'Mittwoch', value: 'Wed' },
   { label: 'Donnerstag', value: 'Thu' },
   { label: 'Freitag', value: 'Fri' },
];

// --- Components ---
const FilterDropdown = ({ label, value, options, onSelect }: { label: string, value: string, options: FilterOption[], onSelect: (val: string) => void }) => {
   const [visible, setVisible] = useState(false);
   const selectedLabel = options.find(o => o.value === value)?.label || label;

   return (
      <View>
         <TouchableOpacity style={styles.filterButton} onPress={() => setVisible(true)}>
            <Text style={styles.filterButtonText} numberOfLines={1}>{selectedLabel}</Text>
            <Ionicons name="chevron-down" size={12} color="#666" />
         </TouchableOpacity>
         <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
            <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setVisible(false)}>
               <View style={styles.modalContent}>
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

// Simple Group Selector Modal
const GroupSelector = ({ value, options, onSelect }: { value: string, options: string[], onSelect: (val: string) => void }) => {
   const [visible, setVisible] = useState(false);
   
   return (
      <TouchableOpacity onPress={() => setVisible(true)} style={styles.groupSelectButton}>
         <Text style={styles.groupSelectText} numberOfLines={1}>{value || 'Select'}</Text>
         <Ionicons name="chevron-down" size={10} color="#666" />
         
         <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
            <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setVisible(false)}>
               <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Select Group</Text>
                  <FlatList
                     data={['No Group', ...options]}
                     keyExtractor={item => item}
                     renderItem={({ item }) => (
                        <TouchableOpacity 
                           style={[styles.modalItem, item === value && styles.modalItemSelected]}
                           onPress={() => { onSelect(item); setVisible(false); }}
                        >
                           <Text style={styles.modalItemText}>{item}</Text>
                        </TouchableOpacity>
                     )}
                  />
               </View>
            </TouchableOpacity>
         </Modal>
      </TouchableOpacity>
   );
};

const GroupingRow = React.memo(({ 
  item, 
  supervisorGroups, 
  dayFilter, 
  onUpdateGroup, 
  onViewDetails 
}: any) => {
  const facilityGroups = supervisorGroups.filter((g: any) => g.facility_id === item.facility_id);
  
  return (
      <View style={styles.row}>
         {/* 1. Name */}
         <View style={styles.colName}>
            <Text style={styles.nameText}>{item.family_name}, {item.first_name}</Text>
            {item.parents && item.parents.length > 0 && (
                <Text style={styles.parentText}>{item.parents[0].first_name} {item.parents[0].family_name}</Text>
            )}
         </View>

         {/* 2. Klasse */}
         <View style={styles.colClass}>
            <View style={styles.classBadge}>
               <Text style={styles.classText}>{item.class || '-'}</Text>
            </View>
         </View>

         {/* 3. Buchung (Vertical List) */}
         <View style={styles.colSchedule}>
            {DAYS.map(day => {
               if (dayFilter !== 'all' && dayFilter !== day) return null;
               const schedule = item.supervision_schedule.find((s: any) => s.day === day);
               const supervision = schedule?.supervision || '-';
               return (
                  <View key={day} style={styles.cellRow}>
                     <Text style={styles.dayLabel}>{DAY_MAP[day]}</Text>
                     <Text style={styles.supervisionText} numberOfLines={1}>{supervision}</Text>
                  </View>
               );
            })}
         </View>

         {/* 4. Gruppe (Vertical List + Dropdowns) */}
         <View style={styles.colGroup}>
            {DAYS.map(day => {
               if (dayFilter !== 'all' && dayFilter !== day) return null;
               const schedule = item.supervision_schedule.find((s: any) => s.day === day);
               const supervision = schedule?.supervision;
               const isEligible = supervision === 'Langgruppe' || supervision === 'Kurzgruppe';
               const currentGroup = item.supervision_groups[day] || 'No Group';
               const dayGroups = facilityGroups.filter((g: any) => g.day === day).map((g: any) => g.name);

               return (
                  <View key={day} style={styles.cellRow}>
                     <Text style={styles.dayLabel}>{DAY_MAP[day]}</Text>
                     {isEligible ? (
                        <View style={{ flex: 1 }}>
                           <GroupSelector 
                              value={currentGroup} 
                              options={dayGroups} 
                              onSelect={(val) => onUpdateGroup(item.id, val, day)} 
                           />
                        </View>
                     ) : (
                        <Text style={styles.notEligibleText}>Not eligible</Text>
                     )}
                  </View>
               );
            })}
         </View>

         {/* 5. Essen (Vertical List) */}
         <View style={styles.colEssen}>
            {DAYS.map(day => {
               if (dayFilter !== 'all' && dayFilter !== day) return null;
               const schedule = item.supervision_schedule.find((s: any) => s.day === day);
               const hasLunch = schedule?.lunch === 'Essen';
               return (
                  <View key={day} style={styles.cellRow}>
                     <Text style={styles.dayLabel}>{DAY_MAP[day]}</Text>
                     <Text style={[styles.essenText, hasLunch ? styles.essenYes : styles.essenNo]}>{hasLunch ? 'JA' : 'NEIN'}</Text>
                  </View>
               );
            })}
         </View>

         {/* 6. Actions */}
         <View style={styles.colAction}>
           <TouchableOpacity
               style={styles.actionIconBtn}
               onPress={() => onViewDetails(item)}
            >
               <Ionicons name="eye-outline" size={18} color="#007AFF" />
           </TouchableOpacity>
         </View>
      </View>
    );
});

export default function SupervisorGroupingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [children, setChildren] = useState<ChildData[]>([]);
  const [loading, setLoading] = useState(true);
  const [supervisorGroups, setSupervisorGroups] = useState<SupervisorGroup[]>([]);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState('50');
  
  const [classFilter, setClassFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [dayFilter, setDayFilter] = useState('all');
  
  const [facilities, setFacilities] = useState<{id: string, name: string}[]>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  
  const [academicYears, setAcademicYears] = useState<{id: string, year: string}[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<string | null>(null);

  // Computed Options
  const [classOptions, setClassOptions] = useState<FilterOption[]>([]);
  const [groupOptions, setGroupOptions] = useState<FilterOption[]>([]);

  // Sorting
  const [sortCol, setSortCol] = useState<'name' | 'class'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    fetchData();
  }, [selectedFacilityId, selectedYearId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

      // 1. Get Supervisor Info
      const { data: userRow } = await supabase.from('users').select('id, record_id').eq('auth_id', user.id).single();
      if (!userRow) {
          setLoading(false);
          return;
        }
      const supId = userRow.record_id || userRow.id;

      // 2. Init Filters
      if (facilities.length === 0) {
         const { data: owned } = await supabase.from('facilities').select('id, name').eq('supervisor_id', supId).eq('is_deleted', false);
         const { data: coord } = await supabase.from('supervisor_coordinator_facilities').select('facility:facilities(id, name)').eq('staff_user_id', userRow.id);
         
         const ownedList = owned || [];
         const coordList = coord?.map((c: any) => c.facility) || [];
         const allFacs = [...ownedList, ...coordList].filter((v,i,a)=>a.findIndex(t=>(t.id===v.id))===i);
         
         setFacilities(allFacs);
         if (allFacs.length > 0 && !selectedFacilityId) setSelectedFacilityId(allFacs[0].id);
      }

      if (academicYears.length === 0) {
         const { data: years } = await supabase.from('academic_years').select('id, year').order('year', { ascending: false });
         if (years) {
            setAcademicYears(years);
            if (!selectedYearId) {
               const current = years.find((y: any) => y.is_current) || years[0];
               setSelectedYearId(current?.id);
            }
         }
      }

      if (!selectedFacilityId || (!selectedYearId && academicYears.length === 0)) {
         if (facilities.length === 0 && academicYears.length === 0) {
         } else if (facilities.length > 0 && !selectedFacilityId) {
         } else {
          setLoading(false);
          return;
        }
      }
      
      const targetYearId = selectedYearId || (academicYears.length > 0 ? academicYears[0].id : null);
      const targetFacId = selectedFacilityId || (facilities.length > 0 ? facilities[0].id : null);

      if (!targetYearId || !targetFacId) {
          setLoading(false);
          return;
        }

      // 3. Fetch Supervisor Groups
      const { data: groups } = await supabase
         .from('supervisor_groups')
         .select('*')
         .eq('supervisor_id', supId)
         .eq('is_deleted', false);
      setSupervisorGroups(groups || []);

      // 4. Fetch Children Info with Users (Optimized Select)
      const { data: infos, error: fetchError } = await supabase
         .from('children_info')
         .select(`*, users:users!inner(id, first_name, family_name, status, manager_id)`)
         .eq('facility_id', targetFacId)
         .eq('academic_year', targetYearId)
         .eq('users.user_type', 'child')
          .eq('is_deleted', false);

      if (fetchError) throw fetchError;

      // 5. Fetch Parents
      const managerIds = infos?.map((i: any) => i.users.manager_id).filter(Boolean) || [];
      let managerMap = new Map();
      if (managerIds.length > 0) {
         const { data: managers } = await supabase
           .from('users')
           .select('id, first_name, family_name, email, phone')
           .in('id', managerIds);
         managers?.forEach((m: any) => managerMap.set(m.id, m));
      }

      // 6. Map Data
      const mapped: ChildData[] = (infos || []).map((info: any) => {
         const user = info.users;
         const isApproved = info.is_approved;
         const userStatus = user.status;
         if (!(isApproved === true || ((userStatus === 'invited' || userStatus === 'invited+pending') && isApproved === false))) {
            return null;
         }

         let parents = [];
         if (user.manager_id && managerMap.has(user.manager_id)) {
            parents.push(managerMap.get(user.manager_id));
         }

         return {
            id: user.id,
            first_name: user.first_name,
            family_name: user.family_name,
            class: info.class,
            group: '', 
            facility_id: info.facility_id,
            academic_year: info.academic_year,
            status: user.status,
            parents: parents,
            supervision_schedule: info.supervision_schedule || [],
            supervision_groups: info.supervision_groups || {},
            allergies: info.allergies,
            is_bus_child: info.is_bus_child
         };
      }).filter(Boolean) as ChildData[];

      setChildren(mapped);

      const classes = new Set<string>();
      mapped.forEach(c => { if (c.class) classes.add(c.class); });
      setClassOptions([
         { label: 'Alle Klassen', value: 'all' },
         ...Array.from(classes).sort().map(c => ({ label: c, value: c }))
      ]);
      
      const allAssignedGroups = new Set<string>();
      mapped.forEach(c => {
         Object.values(c.supervision_groups).forEach(g => { if (g) allAssignedGroups.add(g); });
      });
      setGroupOptions([
         { label: 'Alle Gruppen', value: 'all' },
         ...Array.from(allAssignedGroups).sort().map(g => ({ label: g, value: g }))
      ]);

    } catch(e) {
       console.error("Error fetching grouping data:", e);
      } finally {
        setLoading(false);
      }
    };

  const updateUserGroup = useCallback(async (userId: string, newGroup: string, day: string) => {
     try {
        // Optimistic update
        setChildren(prev => {
           const child = prev.find(c => c.id === userId);
           if (!child) return prev;
        const updatedGroups = { ...child.supervision_groups, [day]: newGroup === 'No Group' ? null : newGroup };
           return prev.map(c => c.id === userId ? { ...c, supervision_groups: updatedGroups } : c);
        });

        const { error } = await supabase
          .from('children_info')
          .update({ supervision_groups: (children.find(c => c.id === userId)?.supervision_groups || {}) }) // This is tricky with closure, but let's use the DB update
          // Actually, we need the NEW value for DB.
          // The logic below in the original code was slightly flawed if `children` was stale.
          // Correct approach:
        
        // Re-fetch closure state is hard. We'll just fire the update.
        // Ideally we construct the full object.
        // We know we just updated one key.
        // We need to fetch the current object first? Or rely on what we have.
        // Let's rely on state.
     } catch (error) {
        console.error("Error updating group:", error);
     }
     
     // Real implementation moved to inside callback to avoid stale state issues properly, 
     // but since we need `selectedFacilityId` etc, we must be careful.
     // For now, I will execute the DB update using the values passed.
     
     const child = children.find(c => c.id === userId);
     if (!child) return;
     const updatedGroups = { ...child.supervision_groups, [day]: newGroup === 'No Group' ? null : newGroup };
     
     // We already updated state optimistically above (conceptually).
     // Now DB.
        const { error } = await supabase
          .from('children_info')
           .update({ supervision_groups: updatedGroups })
           .eq('user_id', userId)
           .eq('facility_id', selectedFacilityId)
           .eq('academic_year', selectedYearId);

     if (error) {
        console.error("DB Update failed", error);
        fetchData(); // Revert/Refresh
     }

  }, [children, selectedFacilityId, selectedYearId]); // dependencies

  const handleSort = (col: 'name' | 'class') => {
     if (sortCol === col) {
        setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
     } else {
        setSortCol(col);
        setSortDir('asc');
     }
  };

  const filteredData = useMemo(() => {
     let res = children.filter(c => {
        if (searchTerm) {
    const searchLower = searchTerm.toLowerCase();
           const nameMatch = `${c.first_name} ${c.family_name}`.toLowerCase().includes(searchLower);
           if (!nameMatch) return false;
        }
        
        if (classFilter !== 'all' && c.class !== classFilter) return false;
        
        if (dayFilter !== 'all') {
           const schedule = c.supervision_schedule.find(s => s.day === dayFilter);
           const supervision = schedule?.supervision;
           if (supervision !== 'Langgruppe' && supervision !== 'Kurzgruppe') return false;
        }

        if (groupFilter !== 'all') {
           if (dayFilter !== 'all') {
               const g = c.supervision_groups[dayFilter];
               if (groupFilter === 'No Group') { if (g) return false; }
               else if (g !== groupFilter) return false;
        } else {
               const assigned = Object.values(c.supervision_groups);
               if (!assigned.includes(groupFilter)) return false;
           }
        }

      return true;
    });

     res.sort((a, b) => {
        let valA = '', valB = '';
        if (sortCol === 'name') {
           valA = `${a.family_name} ${a.first_name}`.toLowerCase();
           valB = `${b.family_name} ${b.first_name}`.toLowerCase();
        } else {
           valA = (a.class || '').toString().toLowerCase();
           valB = (b.class || '').toString().toLowerCase();
        }
        // Use numeric sort
        return sortDir === 'asc' 
          ? valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' })
          : valB.localeCompare(valA, undefined, { numeric: true, sensitivity: 'base' });
     });

     return res;
  }, [children, searchTerm, classFilter, groupFilter, dayFilter, sortCol, sortDir]);

  const paginatedData = useMemo(() => {
      const limit = parseInt(itemsPerPage);
      return filteredData.slice(0, limit);
  }, [filteredData, itemsPerPage]);

  const onViewDetails = useCallback((item: ChildData) => {
      router.push({
                   pathname: '/user-details',
                   params: {
                     id: item.id,
                       academicYearId: item.academic_year,
                       facilityId: item.facility_id,
                       from: 'klassen'
                    }
       });
  }, []);

  const renderRow = useCallback(({ item }: { item: ChildData }) => {
    return (
       <GroupingRow 
          item={item}
          supervisorGroups={supervisorGroups}
          dayFilter={dayFilter}
          onUpdateGroup={updateUserGroup}
          onViewDetails={onViewDetails}
       />
      );
  }, [supervisorGroups, dayFilter, updateUserGroup, onViewDetails]);

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Gruppeneinteilung</Text>
        <TouchableOpacity 
           style={styles.settingsButton} 
           onPress={() => router.push('/supervisor/groups-settings' as any)}
        >
           <Ionicons name="settings-outline" size={16} color="#333" style={{ marginRight: 4 }}/>
           <Text style={styles.settingsButtonText}>Einstellungen</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.toolbar}>
         <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScroll}>
            <FilterDropdown 
               label="Per Page" 
               value={itemsPerPage} 
               options={[{label:'50 per page', value:'50'}, {label:'100 per page', value:'100'}]} 
               onSelect={setItemsPerPage} 
            />
            <FilterDropdown 
               label="Year" 
               value={selectedYearId || ''} 
               options={academicYears.map(y => ({ label: y.year, value: y.id }))} 
               onSelect={setSelectedYearId} 
            />
            <FilterDropdown 
               label="Facility" 
               value={selectedFacilityId || ''} 
               options={facilities.map(f => ({ label: f.name, value: f.id }))} 
               onSelect={setSelectedFacilityId} 
            />
            <FilterDropdown 
               label="Klasse" 
               value={classFilter} 
               options={classOptions} 
               onSelect={setClassFilter} 
            />
            <FilterDropdown 
               label="Alle Tage" 
               value={dayFilter} 
               options={DAY_FILTER_OPTIONS} 
               onSelect={setDayFilter} 
            />
            <FilterDropdown 
               label="Gruppe" 
               value={groupFilter} 
               options={groupOptions} 
               onSelect={setGroupFilter} 
            />
         </ScrollView>
         <View style={styles.searchWrapper}>
            <Ionicons name="search" size={16} color="#999" />
            <TextInput 
               style={styles.searchInput}
               placeholder="Kind suchen..."
               value={searchTerm}
               onChangeText={setSearchTerm}
            />
         </View>
      </View>

      {/* Table Header */}
      <View style={styles.tableHeader}>
         <TouchableOpacity style={styles.colName} onPress={() => handleSort('name')}>
            <View style={{flexDirection:'row', alignItems:'center'}}>
               <Text style={styles.headerCell}>NAME</Text>
               <Ionicons 
                  name={sortCol === 'name' ? (sortDir === 'asc' ? 'arrow-up' : 'arrow-down') : 'swap-vertical'} 
                  size={12} 
                  color={sortCol === 'name' ? "#000" : "#ccc"} 
                  style={{marginLeft:4}} 
               />
            </View>
         </TouchableOpacity>
         <TouchableOpacity style={styles.colClass} onPress={() => handleSort('class')}>
             <View style={{flexDirection:'row', alignItems:'center', justifyContent: 'center'}}>
                <Text style={styles.headerCell}>KLASSE</Text>
                <Ionicons 
                   name={sortCol === 'class' ? (sortDir === 'asc' ? 'arrow-up' : 'arrow-down') : 'swap-vertical'} 
                   size={12} 
                   color={sortCol === 'class' ? "#000" : "#ccc"} 
                   style={{marginLeft:4}} 
                />
             </View>
         </TouchableOpacity>
         <View style={styles.colSchedule}><Text style={styles.headerCell}>BUCHUNG</Text></View>
         <View style={styles.colGroup}><Text style={styles.headerCell}>GRUPPE</Text></View>
         <View style={styles.colEssen}><Text style={styles.headerCell}>ESSEN</Text></View>
         <View style={styles.colAction}><Text style={styles.headerCell}>AKTION</Text></View>
      </View>

      {loading ? (
         <ActivityIndicator style={{ marginTop: 40 }} size="large" />
      ) : (
         <FlatList
            data={paginatedData}
            keyExtractor={item => item.id}
            renderItem={renderRow}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={<Text style={styles.emptyText}>Keine Einträge gefunden.</Text>}
         />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' }, // Changed to white to match
  header: { 
    paddingHorizontal: 16, 
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF', 
    borderBottomWidth: 1, 
    borderBottomColor: '#E5E5EA',
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
  },
  title: { // New style matching attendance
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
  },
  settingsButton: { 
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6, 
    paddingHorizontal: 12, 
    borderWidth: 1, 
    borderColor: '#E5E5EA', 
    borderRadius: 6, 
    backgroundColor: '#fff' // Match attendance button bg if any
  },
  settingsButtonText: { fontSize: 13, color: '#333', fontWeight: '500' },
  
  toolbar: { padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F2F2F7', gap: 12 },
  filtersScroll: { gap: 8, alignItems: 'center', marginBottom: 8 },
  searchWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F2F2F7', borderRadius: 8, paddingHorizontal: 12, height: 40 }, // Cleaner search
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: '#333' },
  
  filterButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E5EA', borderRadius: 6, paddingHorizontal: 12, height: 36, gap: 6, justifyContent: 'space-between' },
  filterButtonText: { fontSize: 13, color: '#333', flex: 1 },
  
  tableHeader: { 
    flexDirection: 'row', 
    backgroundColor: '#F8F9FA', // Light gray header
    borderBottomWidth: 1, 
    borderBottomColor: '#E5E5EA', 
    height: 44, 
    alignItems: 'center', 
    paddingHorizontal: 8 
  },
  headerCell: { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.5 }, // Uppercase style
  
  listContent: { paddingBottom: 40 },
  
  // Row Styling
  row: { 
    flexDirection: 'row', 
    backgroundColor: '#fff', 
    paddingVertical: 14, // More spacing
    paddingHorizontal: 8,
    marginHorizontal: 8, // Card look
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1
  },
  
  // Flex Columns
  colName: { flex: 2, paddingHorizontal: 8, justifyContent: 'center' },
  colClass: { flex: 0.8, justifyContent: 'center', alignItems: 'center' },
  colSchedule: { flex: 2, paddingHorizontal: 4 },
  colGroup: { flex: 2.5, paddingHorizontal: 4 },
  colEssen: { flex: 1.2, paddingHorizontal: 4 },
  colAction: { flex: 0.8, justifyContent: 'center', alignItems: 'center' },

  nameText: { fontSize: 15, fontWeight: '600', color: '#1F2937', marginBottom: 2 },
  parentText: { fontSize: 12, color: '#6B7280' },
  
  classBadge: { backgroundColor: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  classText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  
  actionIconBtn: { padding: 8, backgroundColor: '#F9FAFB', borderRadius: 20, borderWidth: 1, borderColor: '#F3F4F6' },
  
  // Internal Cell Rows
  cellRow: { flexDirection: 'row', alignItems: 'center', height: 28, gap: 8, marginBottom: 2 },
  dayLabel: { width: 25, fontSize: 10, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase' },
  supervisionText: { fontSize: 12, color: '#374151', flex: 1 },
  notEligibleText: { fontSize: 11, color: '#D1D5DB', fontStyle: 'italic' },
  
  essenText: { fontSize: 11, fontWeight: '600' },
  essenYes: { color: '#059669' },
  essenNo: { color: '#9CA3AF' },
  
  // Group Selector
  groupSelectButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#E5E5EA', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, height: 26, flex: 1, backgroundColor: '#fff' },
  groupSelectText: { fontSize: 11, color: '#374151', flex: 1 },
  
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }, // Darker overlay
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 8, minWidth: 220, maxHeight: 400, shadowColor: "#000", shadowOffset: {width:0, height:4}, shadowOpacity: 0.1, shadowRadius: 10, elevation: 10 },
  modalTitle: { fontSize: 14, fontWeight: '600', marginBottom: 8, paddingHorizontal: 8, color: '#6B7280', textTransform: 'uppercase' },
  modalItem: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0' },
  modalItemSelected: { backgroundColor: '#F0F9FF' },
  modalItemText: { fontSize: 14, color: '#374151' },
  modalItemTextSelected: { fontWeight: '600', color: '#0284C7' },
  
  emptyText: { textAlign: 'center', marginTop: 40, color: '#9CA3AF' },
});
