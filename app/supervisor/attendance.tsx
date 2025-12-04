import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, TouchableOpacity, View, Text, Modal, TextInput, Alert, ScrollView, useWindowDimensions, TouchableWithoutFeedback } from 'react-native';
import { format, addDays, subDays, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import AttendanceLogsPanel from '@/components/AttendanceLogsPanel';
import SendMessageDialog from '@/components/SendMessageDialog';

// --- Types ---

interface Facility {
  id: string;
  name: string;
}

interface ChildAttendance {
  id: string;
  user_id: string;
  status: 'Present' | 'Absent' | 'Pending';
  date: string;
  facility_id: string;
  is_leave?: boolean;
  attendance_note?: any[];
}

interface MealSelection {
  id: string;
  user_id: string;
  date: string;
  menuline?: { id: string; name: string };
  main_meal_allergy?: boolean;
  starter_allergy?: boolean;
  dessert_allergy?: boolean;
  is_skipped?: boolean;
  is_deleted?: boolean;
}

interface ChildRecord {
  id: string;
  first_name: string;
  family_name: string;
  attendance?: ChildAttendance;
  is_leave?: boolean;
  children_info?: {
    class?: string;
    supervision_schedule?: any[];
    supervision_groups?: any;
    allergies?: string[];
    secondary_allergies?: (string | number)[];
    is_bus_child?: boolean;
    facility_id?: string;
  };
}

interface SupervisorGroup {
  id: string;
  name: string;
  facility_id: string;
  day: string;
}

// --- Components ---

const Dropdown = ({ label, value, options, onSelect, style }: { label: string, value: string | null, options: {label: string, value: string | null}[], onSelect: (val: string | null) => void, style?: any }) => {
  const [visible, setVisible] = useState(false);
  const selectedLabel = options.find(o => o.value === value)?.label || label;

  return (
    <View style={style}>
      <TouchableOpacity style={styles.dropdownButton} onPress={() => setVisible(true)}>
        <Text style={styles.dropdownText} numberOfLines={1}>{selectedLabel}</Text>
        <Ionicons name="chevron-down" size={16} color="#666" />
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setVisible(false)}>
          <View style={styles.modalContent}>
            <FlatList
               data={options}
               keyExtractor={(item, index) => index.toString()}
               renderItem={({ item: opt }) => (
                <TouchableOpacity 
                  style={[styles.modalItem, opt.value === value && styles.modalItemSelected]}
                  onPress={() => { onSelect(opt.value); setVisible(false); }}
                >
                  <Text style={[styles.modalItemText, opt.value === value && styles.modalItemTextSelected]}>{opt.label}</Text>
                </TouchableOpacity>
               )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const StatsCard = ({ title, value, color = '#000', bgColor = '#F5F5F5', showInfoIcon = false, onInfoPress, style }: any) => (
  <View style={[styles.statCard, { backgroundColor: bgColor }, style]}>
    {showInfoIcon && (
      <TouchableOpacity 
        onPress={onInfoPress}
        style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
      >
        <Ionicons name="information-circle-outline" size={20} color={color} />
      </TouchableOpacity>
    )}
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color }]}>{title}</Text>
    </View>
  </View>
);

const ChildAttendanceRow = React.memo(({ 
  item, 
  isSelected, 
  attendanceRecord, 
  mealSelection, 
  facilityName, 
  selectedFacility,
  onToggleSelection,
  onStatusUpdate,
  onViewChild,
  onViewParent,
  getGroup 
}: any) => {
  const hasMeal = mealSelection && !mealSelection.is_deleted && !mealSelection.is_skipped;
  const mealName = hasMeal ? mealSelection?.menuline?.name || 'Menu' : '-';
  const hasAllergy = hasMeal && (mealSelection?.main_meal_allergy || mealSelection?.starter_allergy || mealSelection?.dessert_allergy);

  return (
    <View style={[styles.card, isSelected && styles.cardSelected]}>
      <TouchableOpacity 
          onPress={() => onToggleSelection(item.id)}
          style={styles.checkboxContainer}
      >
          <Ionicons 
              name={isSelected ? "checkbox" : "square-outline"} 
              size={24} 
              color={isSelected ? "#007AFF" : "#ccc"} 
          />
      </TouchableOpacity>

      <View style={{ flex: 2 }}>
         <Text style={styles.nameText}>{item.family_name}, {item.first_name}</Text>
         <Text style={styles.subText}>{getGroup(item)}</Text>
         {selectedFacility === 'all' && facilityName ? (
           <Text style={styles.facilityText}>{facilityName}</Text>
         ) : null}
         {item.is_leave && <View style={styles.badgeRed}><Text style={styles.badgeTextRed}>Krank</Text></View>}
      </View>

      <View style={{ flex: 1 }}>
         <Text style={styles.cellText}>{item.children_info?.class || '-'}</Text>
      </View>

      <View style={{ flex: 1.5 }}>
         <Text style={[styles.cellText, hasAllergy && { color: '#D32F2F', fontWeight: 'bold' }]}>
           {mealName} {hasAllergy && '!'}
         </Text>
      </View>

      <View style={styles.actions}>
         {attendanceRecord?.is_leave ? (
            <Text style={{ color: '#C62828', fontSize: 12 }}>On Leave</Text>
         ) : (
           <>
             <TouchableOpacity onPress={() => onStatusUpdate(item.id, 'Present')} style={{ opacity: attendanceRecord?.status === 'Present' ? 1 : 0.3 }}>
                <Ionicons name="checkmark-circle" size={28} color="#4CAF50" />
             </TouchableOpacity>
             <TouchableOpacity onPress={() => onStatusUpdate(item.id, 'Absent')} style={{ opacity: attendanceRecord?.status === 'Absent' ? 1 : 0.3 }}>
                <Ionicons name="close-circle" size={28} color="#F44336" />
             </TouchableOpacity>
           </>
         )}
      </View>

      <View style={styles.actionButtons}>
        <TouchableOpacity 
          style={styles.actionBtn}
          onPress={() => onViewChild(item.id, item.children_info?.facility_id)}
        >
          <Text style={styles.actionBtnText}>View child</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.actionBtn}
          onPress={() => onViewParent(item.id, item.children_info?.facility_id)}
        >
          <Text style={styles.actionBtnText}>View parent</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

// --- Dashboard Component (Memoized) ---
const AttendanceDashboard = React.memo(({ 
    isLandscape, 
    stats, 
    onInfoPressSick,
    onInfoPressBus,
    currentAcademicYear, 
    selectedFacility, 
    selectedDate, 
    supervisorId, 
    isCoordinator, 
    accessibleFacilities 
}: any) => {
    return (
        <View style={[styles.dashboardRow, isLandscape && styles.dashboardRowLandscape]}>
            {/* Stats Grid */}
            <View style={[styles.statsContainer, isLandscape && { flex: 1.1, marginRight: 16 }]}>
              <View style={styles.statsGrid}>
                <StatsCard 
                  title="Kinder mit Betreuung" 
                  value={stats.total} 
                  bgColor="#E3F2FD" color="#1565C0" 
                  style={{ width: '48%', minHeight: 140 }}
                />
                <StatsCard 
                  title="Kinder Heute (ohne Krank)" 
                  value={stats.active} 
                  bgColor="#E8F5E9" color="#2E7D32" 
                  style={{ width: '48%', minHeight: 140 }}
                />
                <StatsCard 
                  title="Kinder Krank Heute" 
                  value={stats.sick} 
                  bgColor="#FFEBEE" color="#C62828" 
                  showInfoIcon={stats.sick > 0}
                  onInfoPress={onInfoPressSick}
                  style={{ width: '48%', minHeight: 140 }}
                />
                <StatsCard 
                  title="Bus Kinder Heute" 
                  value={stats.bus} 
                  bgColor="#FFF3E0" color="#EF6C00"
                  showInfoIcon={stats.bus > 0}
                  onInfoPress={onInfoPressBus}
                  style={{ width: '48%', minHeight: 140 }}
                />
              </View>
            </View>

            {/* Logs Panel */}
            <View style={[styles.logsContainer, isLandscape && { flex: 1 }]}>
              {currentAcademicYear && (
                <AttendanceLogsPanel 
                  selectedAcademicYearId={currentAcademicYear}
                  selectedFacilityId={selectedFacility || 'all'}
                  selectedDate={format(selectedDate, 'yyyy-MM-dd')}
                  supervisorId={supervisorId}
                  isCoordinator={isCoordinator}
                  accessibleFacilities={accessibleFacilities}
                />
              )}
            </View>
        </View>
    );
});

// --- Main Screen ---

export default function SupervisorAttendanceScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const isLandscape = width > 768;

  const [loading, setLoading] = useState(true);
  
  // Data
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [selectedFacility, setSelectedFacility] = useState<string | null>(null);
  const [currentAcademicYear, setCurrentAcademicYear] = useState<string | null>(null);
  
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<ChildAttendance[]>([]);
  const [mealSelections, setMealSelections] = useState<MealSelection[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [classFilter, setClassFilter] = useState<string>('all');

  // Computed Options
  const [supervisorGroups, setSupervisorGroups] = useState<SupervisorGroup[]>([]);
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);

  // Supervisor Context
  const [supervisorId, setSupervisorId] = useState<string>('');
  const [isCoordinator, setIsCoordinator] = useState(false);
  const [accessibleFacilities, setAccessibleFacilities] = useState<string[]>([]);

  // Messages
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sendMessageOpen, setSendMessageOpen] = useState(false);

  // Sorting
  const [sortCol, setSortCol] = useState<'name' | 'class'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (col: 'name' | 'class') => {
    if (sortCol === col) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  // --- Init ---

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
           setLoading(false);
           return;
        }

        // 1. Fetch Supervisor
        const { data: userRow } = await supabase
          .from('users')
          .select('id, record_id')
          .eq('auth_id', user.id)
          .maybeSingle();
        
        if (!userRow) {
           setLoading(false);
           return;
        }
        
        // Store Supervisor Context
        const supId = userRow.record_id || userRow.id;
        setSupervisorId(supId);

        // 2. Fetch Facilities (Owned + Coordinated - Matching Dashboard Logic)
        // 1) Check supervisor_coordinator_facilities
        const { data: coordinatorLinks } = await supabase
          .from('supervisor_coordinator_facilities')
          .select('facility_id')
          .eq('staff_user_id', userRow.id);

        let coordinatorIds: string[] = [];
        if (coordinatorLinks) {
           coordinatorIds = coordinatorLinks.map((l: any) => l.facility_id);
        }
        // setIsCoordinator(coordinatorIds.length > 0); // moved below

        // 2) Check owned facilities
        const { data: ownedFacilities } = await supabase
          .from('facilities')
          .select('id')
          .eq('supervisor_id', supId)
          .eq('is_deleted', false);
        
        let ownedIds: string[] = [];
        if (ownedFacilities) {
           ownedIds = ownedFacilities.map(f => f.id);
        }

        // Combine for total access
        const allIds = Array.from(new Set([...coordinatorIds, ...ownedIds]));
        
        // FIX: accessibleFacilities should include EVERYTHING this user can see, not just coordinated ones.
        setAccessibleFacilities(allIds); 
        setIsCoordinator(coordinatorIds.length > 0);

        if (allIds.length > 0) {
          const { data: allFacilities } = await supabase
            .from('facilities')
            .select('id, name')
            .in('id', allIds)
            .eq('is_deleted', false);
          
          setFacilities(allFacilities || []);
          // Default to "all" if multiple, or the single one
          if (allFacilities && allFacilities.length > 0) {
             setSelectedFacility(allFacilities.length > 1 ? 'all' : allFacilities[0].id);
          }
        }

        // 3. Fetch Academic Year (Robust)
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

        // 4. Fetch Supervisor Groups
        let groupQuery = supabase
          .from('supervisor_groups')
          .select('id, name, facility_id, day')
          .eq('is_deleted', false)
          .order('name', { ascending: true });

        if (allIds.length > 0) {
           groupQuery = groupQuery.in('facility_id', allIds);
        } else {
           groupQuery = groupQuery.eq('supervisor_id', supId);
        }

        const { data: groups } = await groupQuery;
        setSupervisorGroups(groups || []);

        // Stop loading if we can't proceed
        if (!allIds.length || !ayId) {
           setLoading(false);
        }

      } catch (err) {
        console.error('Init error:', err);
        setLoading(false);
      }
    };

    init();
  }, []);

  // --- Fetch Data ---

  useEffect(() => {
    const fetchData = async () => {
      if (!selectedFacility || !currentAcademicYear) {
         return; 
      }

      setLoading(true);
      try {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');

        // 1. Fetch Children Info
        const targetFacilityIds = selectedFacility === 'all' ? facilities.map(f => f.id) : [selectedFacility];

        const { data: childrenData, error: childrenError } = await supabase
          .from('children_info')
          .select('*, users:users!inner(id, status, is_deleted)')
          .in('facility_id', targetFacilityIds)
          .eq('academic_year', currentAcademicYear)
          .eq('is_deleted', false);

        if (childrenError) throw childrenError;

        // Filter valid users
        const validChildrenInfos = (childrenData || []).filter((c: any) => !c.users.is_deleted);
        const userIds = validChildrenInfos.map((c: any) => c.users.id);

        if (userIds.length === 0) {
           setChildren([]);
           setAttendanceRecords([]);
           setMealSelections([]);
           setLoading(false);
           return;
        }

        // 2. Fetch User Details
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('*')
          .in('id', userIds)
          .eq('is_deleted', false);
        
        if (usersError) throw usersError;

        const usersMap = new Map(usersData?.map(u => [u.id, u]));

        // 3. Fetch Attendance
        const { data: attData, error: attError } = await supabase
          .from('child_attendance')
          .select('*')
          .in('facility_id', targetFacilityIds)
          .eq('academic_year', currentAcademicYear)
          .eq('date', dateStr)
          .in('user_id', userIds);
        
        if (attError) throw attError;
        setAttendanceRecords(attData || []);

        // 4. Fetch Meal Selections
        const { data: mealData } = await supabase
          .from('meal_selections')
          .select('*, menuline:menu_lines(id, name)')
          .in('facility_id', targetFacilityIds)
          .eq('date', dateStr)
          .in('user_id', userIds)
          .eq('is_deleted', false);
        
        setMealSelections(mealData || []);

        // 5. Prepare Child Records
        const mapped: ChildRecord[] = validChildrenInfos.map((c: any) => {
          const user = usersMap.get(c.users.id);
          return {
            id: c.users.id,
            first_name: user?.first_name || 'Unknown',
            family_name: user?.family_name || 'User',
            children_info: c // Pass the whole object as web app does
          };
        });

        setChildren(mapped);

      } catch (err) {
        console.error('Fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedFacility, selectedDate, currentAcademicYear, refreshTrigger]);

  // --- Helpers ---

  const getCurrentDayAbbreviation = () => {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return dayNames[selectedDate.getDay()];
  };

  const getGroup = useCallback((child: ChildRecord) => {
    const groups = child.children_info?.supervision_groups || {};
    const raw = groups[getCurrentDayAbbreviation()];
    return (typeof raw === 'string' ? raw.trim() : '') || "No Group";
  }, [selectedDate]);

  const hasSupervisionToday = (child: ChildRecord) => {
    if (!child.children_info?.supervision_schedule) return false;
    const day = getCurrentDayAbbreviation();
    const todaySchedule = child.children_info.supervision_schedule.find((s: any) => s.day === day);
    return todaySchedule && todaySchedule.supervision !== 'keine Betreuung';
  };

  const isSickLeave = (child: ChildRecord) => {
    const rec = attendanceRecords.find(r => r.user_id === child.id);
    return rec?.is_leave || false;
  };

  const isBusChild = (child: ChildRecord) => child.children_info?.is_bus_child || false;

  const getAttendanceStatus = (child: ChildRecord) => {
    return attendanceRecords.find(r => r.user_id === child.id);
  };

  const getFacilityName = (facilityId?: string) => {
    if (!facilityId) return '';
    return facilities.find(f => f.id === facilityId)?.name || '';
  };

  // --- Updates ---

  useEffect(() => {
    const classes = new Set<string>();
    children.filter(c => hasSupervisionToday(c)).forEach(c => {
      if (c.children_info?.class) classes.add(c.children_info.class);
    });
    setAvailableClasses(Array.from(classes).sort());
  }, [children, selectedDate]);

  useEffect(() => {
    setGroupFilter('all');
  }, [selectedDate]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedFacility, selectedDate, groupFilter, classFilter, statusFilter, searchTerm]);

  const getFilteredGroupOptions = () => {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const currentDay = dayNames[selectedDate.getDay()];
    
    const filteredGroups = supervisorGroups.filter(group => {
      if (group.day !== currentDay) return false;
      if (selectedFacility && selectedFacility !== 'all') {
        return group.facility_id === selectedFacility;
      }
      return true;
    });

    return [
      { label: 'Alle Gruppen', value: 'all' },
      { label: 'Ohne Gruppe', value: 'No Group' },
      ...filteredGroups.map(g => ({ label: g.name, value: g.name }))
    ];
  };

  const handleStatusUpdate = useCallback(async (childId: string, status: 'Present' | 'Absent' | 'Pending') => {
    if (!selectedFacility || !currentAcademicYear) return;
    
    let targetFacility = selectedFacility;
    if (selectedFacility === 'all') {
       const child = children.find(c => c.id === childId);
       if (child?.children_info?.facility_id) {
         targetFacility = child.children_info.facility_id;
       } else {
         console.warn("Child has no facility_id, skipping update");
         return;
       }
    }

    const dateStr = format(selectedDate, 'yyyy-MM-dd');

    try {
       const existing = attendanceRecords.find(r => r.user_id === childId);
       
       if (existing) {
         await supabase
           .from('child_attendance')
           .update({ status, updated_at: new Date().toISOString() })
           .eq('id', existing.id);
       } else {
         await supabase.from('child_attendance').insert({
           user_id: childId,
           status,
           date: dateStr,
           facility_id: targetFacility,
           academic_year: currentAcademicYear,
           is_leave: false
         });
       }
       setRefreshTrigger(p => p + 1);
    } catch (err) {
      console.error('Update error:', err);
      Alert.alert('Error', 'Failed to update attendance');
    }
  }, [selectedFacility, currentAcademicYear, children, attendanceRecords, selectedDate]);

  const handleViewChild = useCallback((childId: string, childFacilityId?: string) => {
    const targetFacility = childFacilityId && childFacilityId !== 'all' ? childFacilityId : selectedFacility;
    if (!targetFacility || targetFacility === 'all') {
      Alert.alert('Error', 'Unable to determine facility for this child');
      return;
    }
    
    router.push({
      pathname: '/user-details',
      params: {
        id: childId,
        facilityId: targetFacility,
        academicYearId: currentAcademicYear,
        from: 'attendance'
      }
    });
  }, [selectedFacility, currentAcademicYear]);

  const handleViewParent = useCallback(async (childId: string, childFacilityId?: string) => {
    const targetFacility = childFacilityId && childFacilityId !== 'all' ? childFacilityId : selectedFacility;
    if (!targetFacility || targetFacility === 'all') {
      Alert.alert('Error', 'Unable to determine facility');
      return;
    }

    try {
      const { data: childData, error } = await supabase
        .from("users")
        .select("manager_id")
        .eq("id", childId)
        .single();

      if (error || !childData?.manager_id) {
        Alert.alert("Error", "Parent not found for this child");
        return;
      }

      router.push({
        pathname: '/user-details',
        params: {
          id: childData.manager_id,
          facilityId: targetFacility,
          academicYearId: currentAcademicYear,
          from: 'attendance'
        }
      });
    } catch (e: any) {
      Alert.alert("Error", "Failed to fetch parent information");
    }
  }, [selectedFacility, currentAcademicYear]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
        const newSet = new Set(prev);
    if (newSet.has(id)) {
        newSet.delete(id);
    } else {
        newSet.add(id);
    }
        return newSet;
    });
  }, []);

  // --- Filtered Data ---

  const filteredData = useMemo(() => {
    return children
      .filter(c => {
        // 1. Supervision
        if (!hasSupervisionToday(c)) return false;

        // 2. Search
        if (searchTerm) {
           const name = `${c.family_name} ${c.first_name}`.toLowerCase();
           if (!name.includes(searchTerm.toLowerCase())) return false;
        }

        // 3. Class
        if (classFilter !== 'all' && c.children_info?.class !== classFilter) return false;

        // 4. Group
        if (groupFilter !== 'all') {
          const g = getGroup(c);
          if (groupFilter === 'No Group') {
            if (g !== 'No Group') return false;
          } else {
             if (g !== groupFilter) return false;
          }
        }

        // 5. Status
        if (statusFilter !== 'all') {
          const rec = getAttendanceStatus(c);
          if (statusFilter === 'on_leave') return Boolean(rec?.is_leave);
          if (statusFilter === 'pending') return !rec || rec.status === 'Pending';
          if (!rec) return false; // Should be pending if no record, handled above
          return rec.status.toLowerCase() === statusFilter.toLowerCase();
        }

        return true;
      })
      .sort((a, b) => {
        let valA = '', valB = '';
        if (sortCol === 'name') {
           valA = `${a.family_name} ${a.first_name}`.toLowerCase();
           valB = `${b.family_name} ${b.first_name}`.toLowerCase();
        } else {
           valA = (a.children_info?.class || '').toString().toLowerCase();
           valB = (b.children_info?.class || '').toString().toLowerCase();
        }
        // Use numeric sort to handle "Class 1" vs "Class 10" correctly
        return sortDir === 'asc' 
          ? valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' })
          : valB.localeCompare(valA, undefined, { numeric: true, sensitivity: 'base' });
      });
  }, [children, searchTerm, classFilter, groupFilter, statusFilter, attendanceRecords, sortCol, sortDir]);

  // --- Stats ---

  const stats = useMemo(() => {
    // 1. Base Filter (Supervision Today)
    let relevantChildren = children.filter(hasSupervisionToday);

    // 2. Apply Group Filter
    if (groupFilter !== 'all') {
       relevantChildren = relevantChildren.filter(c => {
         const g = getGroup(c);
         if (groupFilter === 'No Group') return g === 'No Group';
         return g === groupFilter;
       });
    }

    // 3. Apply Class Filter (to match list behavior)
    if (classFilter !== 'all') {
      relevantChildren = relevantChildren.filter(c => c.children_info?.class === classFilter);
    }

    const sick = relevantChildren.filter(isSickLeave);
    const bus = relevantChildren.filter(isBusChild);
    const active = relevantChildren.filter(c => !isSickLeave(c));

    return {
      total: relevantChildren.length,
      active: active.length,
      sick: sick.length,
      bus: bus.length
    };
  }, [children, attendanceRecords, groupFilter, classFilter]);

  // --- Render Row ---

  const renderRow = useCallback(({ item }: { item: ChildRecord }) => {
    const att = getAttendanceStatus(item);
    const meal = mealSelections.find(m => m.user_id === item.id);
    const facilityName = getFacilityName(item.children_info?.facility_id);
    const isSelected = selectedIds.has(item.id);

    return (
      <ChildAttendanceRow 
         item={item}
         isSelected={isSelected}
         attendanceRecord={att}
         mealSelection={meal}
         facilityName={facilityName}
         selectedFacility={selectedFacility}
         onToggleSelection={toggleSelection}
         onStatusUpdate={handleStatusUpdate}
         onViewChild={handleViewChild}
         onViewParent={handleViewParent}
         getGroup={getGroup}
      />
    );
  }, [selectedIds, mealSelections, attendanceRecords, facilities, selectedFacility, getGroup]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <FlatList
        data={loading ? [] : filteredData}
        extraData={[sortCol, sortDir, loading, selectedIds, filteredData]}
        keyExtractor={item => item.id}
        renderItem={renderRow}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={false}
        ListHeaderComponent={
          <View>
            {/* Header Container */}
            <View style={styles.header}>
              {/* Top: Title & Facility */}
              <View>
                <Text style={styles.title}>Ganztag</Text>
                <View style={styles.facilityContextRow}>
                    <Text style={styles.facilityContextText}>
                    Facility : {selectedFacility === 'all' ? 'Alle Einrichtungen' : getFacilityName(selectedFacility || undefined)}
                    </Text>
                </View>
              </View>

              {/* Facility Picker */}
              {facilities.length > 1 && (
                <View style={styles.facilityRow}>
                    <Dropdown 
                      label="Facility"
                      value={selectedFacility}
                      options={[
                        { label: "All Facilities", value: 'all' },
                        ...facilities.map(f => ({ label: f.name, value: f.id }))
                      ]}
                      onSelect={setSelectedFacility}
                      style={{ width: 200 }}
                    />
                </View>
              )}

              {/* Stats & Logs */}
              <View style={[styles.dashboardRow, isLandscape && styles.dashboardRowLandscape]}>
                {/* Stats Grid - Reduced width relative to logs */}
                <View style={[styles.statsContainer, isLandscape && { flex: 1.1, marginRight: 16 }]}>
                  <View style={styles.statsGrid}>
                    <StatsCard 
                      title="Kinder mit Betreuung" 
                      value={stats.total} 
                      bgColor="#E3F2FD" color="#1565C0" 
                      style={{ width: '48%', minHeight: 140 }}
                    />
                    <StatsCard 
                      title="Kinder Heute (ohne Krank)" 
                      value={stats.active} 
                      bgColor="#E8F5E9" color="#2E7D32" 
                      style={{ width: '48%', minHeight: 140 }}
                    />
                    <StatsCard 
                      title="Kinder Krank Heute" 
                      value={stats.sick} 
                      bgColor="#FFEBEE" color="#C62828" 
                      showInfoIcon={stats.sick > 0}
                      onInfoPress={() => Alert.alert('Kranke Kinder', children.filter(c => hasSupervisionToday(c) && isSickLeave(c)).map(c => `${c.first_name} ${c.family_name}`).join('\n'))}
                      style={{ width: '48%', minHeight: 140 }}
                    />
                    <StatsCard 
                      title="Bus Kinder Heute" 
                      value={stats.bus} 
                      bgColor="#FFF3E0" color="#EF6C00"
                      showInfoIcon={stats.bus > 0}
                      onInfoPress={() => Alert.alert('Bus Kinder', children.filter(c => hasSupervisionToday(c) && isBusChild(c)).map(c => `${c.first_name} ${c.family_name}`).join('\n'))}
                      style={{ width: '48%', minHeight: 140 }}
                    />
                  </View>
                </View>

                {/* Logs Panel - Increased width */}
                <View style={[styles.logsContainer, isLandscape && { flex: 1 }]}>
                  {currentAcademicYear && (
                    <AttendanceLogsPanel 
                      selectedAcademicYearId={currentAcademicYear}
                      selectedFacilityId={selectedFacility || 'all'}
                      selectedDate={format(selectedDate, 'yyyy-MM-dd')}
                      supervisorId={supervisorId}
                      isCoordinator={isCoordinator}
                      accessibleFacilities={accessibleFacilities}
                    />
                  )}
                </View>
              </View>

              {/* Navigation Row: Anwesenheit Title + Date + Message Button */}
              <View style={styles.navigationSection}>
                  {/* Row 1: Title & Message Button */}
                  <View style={styles.titleRow}>
                      <Text style={styles.sectionTitle}>Anwesenheit</Text>
                      <TouchableOpacity 
                        style={[styles.messageButton, selectedIds.size === 0 && styles.messageButtonDisabled]}
                        disabled={selectedIds.size === 0}
                        onPress={() => setSendMessageOpen(true)}
                      >
                          <Ionicons name="mail-outline" size={18} color="#fff" />
                          <Text style={styles.messageButtonText}>Nachricht senden</Text>
                      </TouchableOpacity>
                  </View>
                  
                  {/* Row 2: Date Controls */}
                  <View style={styles.dateControls}>
                    <TouchableOpacity onPress={() => setSelectedDate(subDays(selectedDate, 1))} style={styles.navButton}>
                      <Ionicons name="chevron-back" size={20} color="#333" />
                      <Text style={styles.navButtonText}>Vorheriger Tag</Text>
                    </TouchableOpacity>
                    
                    <Text style={styles.dateDisplay}>
                      {(() => {
                        const date = new Date(selectedDate);
                        const dayNames = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
                        const dayName = dayNames[date.getDay()];
                        const formattedDate = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
                        return `${dayName}, ${formattedDate}`;
                      })()}
                    </Text>

                    <TouchableOpacity onPress={() => setSelectedDate(addDays(selectedDate, 1))} style={styles.navButton}>
                      <Text style={styles.navButtonText}>Nächster Tag</Text>
                      <Ionicons name="chevron-forward" size={20} color="#333" />
                    </TouchableOpacity>
                  </View>
              </View>
            </View>

            {/* Filters */}
            <View style={styles.filterContainer}>
              <View style={styles.searchBox}>
                <Ionicons name="search" size={16} color="#999" />
                <TextInput 
                  style={styles.searchInput} 
                  placeholder="Suche..." 
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                />
              </View>

              <Dropdown 
                label="Gruppe"
                value={groupFilter}
                options={getFilteredGroupOptions()}
                onSelect={(val) => setGroupFilter(val || 'all')}
                style={{ width: 140 }}
              />

              <Dropdown 
                label="Status" 
                value={statusFilter}
                options={[
                  { label: 'Alle Status', value: 'all' },
                  { label: 'Anwesend', value: 'present' },
                  { label: 'Abwesend', value: 'absent' },
                  { label: 'Ausstehend', value: 'pending' },
                  { label: 'On Leave', value: 'on_leave' },
                ]}
                onSelect={(val) => setStatusFilter(val || 'all')}
                style={{ width: 110 }}
              />

              <Dropdown 
                label="Klasse"
                value={classFilter}
                options={[{ label: 'Alle Klassen', value: 'all' }, ...availableClasses.map(c => ({ label: c, value: c }))]}
                onSelect={(val) => setClassFilter(val || 'all')}
                style={{ width: 110 }}
              />
            </View>

            {/* Header Row */}
            <View style={styles.tableHeader}>
              <View style={{ width: 40 }} /> 
              
              <TouchableOpacity 
                style={{ flex: 2, flexDirection: 'row', alignItems: 'center' }}
                onPress={() => handleSort('name')}
              >
                <Text style={styles.headerCell}>Name / Gruppe</Text>
                <Ionicons 
                  name={sortCol === 'name' ? (sortDir === 'asc' ? 'arrow-up' : 'arrow-down') : 'swap-vertical'} 
                  size={12} 
                  color={sortCol === 'name' ? "#000" : "#ccc"} 
                  style={{ marginLeft: 4 }}
                />
              </TouchableOpacity>

              <TouchableOpacity 
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                onPress={() => handleSort('class')}
              >
                <Text style={styles.headerCell}>Klasse</Text>
                <Ionicons 
                  name={sortCol === 'class' ? (sortDir === 'asc' ? 'arrow-up' : 'arrow-down') : 'swap-vertical'} 
                  size={12} 
                  color={sortCol === 'class' ? "#000" : "#ccc"} 
                  style={{ marginLeft: 4 }}
                />
              </TouchableOpacity>

              <Text style={[styles.headerCell, { flex: 1.5 }]}>Essen</Text>
              <Text style={[styles.headerCell, { width: 80 }]}>Status</Text>
              <Text style={[styles.headerCell, { width: 160, textAlign: 'center' }]}>Aktion</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" />
            </View>
          ) : (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Text style={styles.emptyText}>Keine Kinder gefunden</Text>
              <Text style={{ color: '#999', fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
                {children.length === 0 
                  ? "Keine Daten geladen." 
                  : `Am ${format(selectedDate, 'EEEE', { locale: de })} ist keine Betreuung geplant,\noder alle Kinder sind ausgefiltert.`
                }
              </Text>
            </View>
          )
        }
      />

      <SendMessageDialog
        open={sendMessageOpen}
        onOpenChange={setSendMessageOpen}
        supervisorId={supervisorId}
        selectedChildIds={Array.from(selectedIds)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4, // Reduced margin
  },
  facilityRow: {
    marginBottom: 12,
  },
  facilityContextRow: {
    marginBottom: 16,
  },
  facilityContextText: {
    fontSize: 16,
    color: '#666',
  },
  dashboardRow: {
    flexDirection: 'column',
    gap: 16,
    marginBottom: 24, // Spacing after dashboard
  },
  dashboardRowLandscape: {
    flexDirection: 'row',
    minHeight: 400, // Increased height
  },
  statsContainer: {},
  logsContainer: {},
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statCard: {
    padding: 16, 
    borderRadius: 8,
    marginBottom: 4,
    // justifyContent: 'space-between', // Removed to allow centering logic
  },
  statHeader: {
    // Removed as logic changed
  },
  statValue: {
    fontSize: 42, // Increased size
    fontWeight: '700',
    textAlign: 'center', // Center text
  },
  statLabel: {
    fontSize: 13,
    marginTop: 4,
    fontWeight: '500',
  },
  
  // New Navigation Row Styles
  navigationSection: {
    marginTop: 8,
    marginBottom: 16,
    gap: 12,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  dateControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // backgroundColor: '#F9FAFB', // Removed background
    // borderRadius: 8, // Removed border radius
    padding: 8,
    // borderWidth: 1, // Removed border width
    // borderColor: '#E5E5EA', // Removed border color
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  navButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
    marginHorizontal: 4,
  },
  dateDisplay: {
    flex: 1,
    textAlign: 'center',
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  
  // Message Button
  messageButton: {
    backgroundColor: '#111',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  messageButtonDisabled: {
    opacity: 0.5,
  },
  messageButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },

  filterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
    alignItems: 'center',
  },
  searchBox: {
    flex: 1,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 40,
  },
  searchInput: {
    flex: 1,
    marginLeft: 6,
    fontSize: 14,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#F9FAFB',
  },
  headerCell: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  listContent: {
    paddingBottom: 40,
  },
  card: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
    alignItems: 'center',
  },
  cardSelected: {
    backgroundColor: '#F0F9FF',
  },
  checkboxContainer: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  subText: {
    fontSize: 12,
    color: '#666',
  },
  facilityText: {
    fontSize: 11,
    color: '#007AFF',
    marginTop: 2,
  },
  cellText: {
    fontSize: 13,
    color: '#333',
  },
  actions: {
    flexDirection: 'row',
    width: 80,
    justifyContent: 'flex-end',
    gap: 12,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 16,
    minWidth: 160,
    justifyContent: 'center',
  },
  actionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
  },
  actionBtnText: {
    fontSize: 11,
    color: '#333',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#666',
  },
  // Dropdown
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 40,
    justifyContent: 'space-between',
  },
  dropdownText: {
    fontSize: 12,
    color: '#333',
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 8,
    width: 200,
    maxHeight: 400,
  },
  modalItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  modalItemSelected: {
    backgroundColor: '#F2F2F7',
  },
  modalItemText: {
    fontSize: 14,
    color: '#000',
  },
  modalItemTextSelected: {
    fontWeight: '600',
  },
  badgeRed: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  badgeTextRed: {
    color: '#C62828',
    fontSize: 10,
    fontWeight: 'bold'
  },
});
