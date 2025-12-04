import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View, TextInput, ActivityIndicator, Alert, Text, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

interface QRRequest {
  id: string;
  user_id: string;
  facility_id: string;
  status: string;
  print_status: string;
  requested_date: string;
  printed_date?: string;
  is_first_card: boolean;
  cost?: number;
  card_sequence_number?: number;
  requested_by?: string;
}

interface ChildRow {
  id: string;
  first_name: string;
  family_name: string;
  class: string | null;
  facility_id: string;
  facility_name?: string;
  supervision_schedule: any[];
  kindergarten_schedule?: any[];
  qr_requests?: QRRequest[];
  supervision_groups?: any;
}

// Simple Dropdown Component
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
        <Pressable style={styles.modalOverlay} onPress={() => setVisible(false)}>
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
        </Pressable>
      </Modal>
    </View>
  );
};

const QRRequestRow = React.memo(({ 
  item, 
  latest, 
  isSelected, 
  hasCard, 
  currency,
  replacementCost,
  onToggleSelect,
  onDelete 
}: any) => {
  const key = `${item.id}:${item.facility_id}`;
  const canDelete = latest?.print_status === 'requested' && latest.requested_by === 'supervisor';

  return (
    <TouchableOpacity 
      style={[styles.tableRow, isSelected && styles.tableRowSelected]}
      onPress={() => onToggleSelect(key)}
    >
       <View style={{ width: 40, alignItems: 'center' }}>
          <Ionicons 
            name={isSelected ? "checkbox" : "square-outline"} 
            size={24} 
            color={isSelected ? "#007AFF" : "#C7C7CC"} 
            style={!hasCard && !latest ? { opacity: 0.5 } : {}}
          />
       </View>
       
       <View style={{ flex: 2 }}>
          <Text style={styles.cellTextBold}>{item.family_name}, {item.first_name}</Text>
          {item.facility_name && <Text style={styles.cellTextSub}>{item.facility_name}</Text>}
          {latest?.print_status === 'requested' && (
            <View style={styles.requestedBadge}>
              <Text style={styles.requestedBadgeText}>Requested</Text>
            </View>
          )}
        </View>

        <View style={{ flex: 1 }}>
            <Text style={styles.cellText}>{item.class || '-'}</Text>
        </View>

        <View style={{ flex: 1 }}>
            <Text style={styles.cellText}>
              {latest?.printed_date || latest?.requested_date ? format(new Date(latest.printed_date || latest.requested_date), 'dd.MM.yyyy HH:mm') : '-'}
            </Text>
        </View>

        <View style={{ flex: 1 }}>
            {hasCard ? (
              <Text style={styles.cellText}>
                {(currency === 'EUR' ? '€' : '') + replacementCost.toFixed(2) + (currency !== 'EUR' ? ` ${currency}` : '')} / #{latest?.card_sequence_number ?? 0}
              </Text>
            ) : <Text style={styles.cellText}>-</Text>}
        </View>

        <View style={{ width: 60, alignItems: 'center' }}>
            {canDelete ? (
              <TouchableOpacity onPress={() => onDelete(item)}>
                <Text style={{ color: '#FF3B30', fontSize: 12 }}>Delete</Text>
              </TouchableOpacity>
            ) : <Text>-</Text>}
        </View>
    </TouchableOpacity>
  );
});

export default function SupervisorQRRequestsScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [qrRequests, setQrRequests] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('requested');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  
  // Data
  const [years, setYears] = useState<{id: string, name: string}[]>([]);
  const [supervisorGroups, setSupervisorGroups] = useState<{name: string}[]>([]);
  const [facilitiesOwned, setFacilitiesOwned] = useState<string[]>([]);
  const [supervisorId, setSupervisorId] = useState<string>('');
  const [currentUserId, setCurrentUserId] = useState<string>('');

  // Settings for cost
  const [replacementCost, setReplacementCost] = useState<number>(5.0);
  const [currency, setCurrency] = useState('EUR');

  const latestByKey = useMemo(() => {
      const map = new Map<string, any>();
      (qrRequests || []).forEach((r: any) => {
          const key = `${r.user_id}:${r.facility_id}`;
          const prev = map.get(key);
          if (!prev) map.set(key, r);
          else {
              const prevDate = prev.requested_date ? new Date(prev.requested_date).getTime() : 0;
              const curDate = r.requested_date ? new Date(r.requested_date).getTime() : 0;
              if (curDate >= prevDate) map.set(key, r);
          }
      });
      return map;
  }, [qrRequests]);

  const childIdToMaxSeq = useMemo(() => {
      const map = new Map<string, number>();
      (qrRequests || []).forEach((r: any) => {
          const key = `${r.user_id}:${r.facility_id}`;
          const prev = map.get(key) ?? 0;
          const seq = Number(r.card_sequence_number ?? 0);
          if (seq > prev) map.set(key, seq);
      });
      return map;
  }, [qrRequests]);

  const childIdHasAnyCard = useMemo(() => {
      const set = new Set<string>();
      (qrRequests || []).forEach((r: any) => {
          if (r.card_sequence_number != null) set.add(`${r.user_id}:${r.facility_id}`);
      });
      return set;
  }, [qrRequests]);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userRow } = await supabase.from('users').select('id, record_id').eq('auth_id', user.id).single();
      if (!userRow) return;

      setCurrentUserId(user.id);

      const userId = userRow.id;
      const recordId = userRow.record_id;
      const svId = recordId || userId;
      setSupervisorId(svId);

      // Get city name for settings
      let cityName: string | null = null;
      if (recordId) {
         const { data: svData } = await supabase.from('supervisor').select('city_name').eq('id', recordId).single();
         if (svData) cityName = svData.city_name;
      }

      // Fetch Years
      const { data: yearData } = await supabase
        .from('academic_years')
        .select('id, year, is_current')
        .order('year', { ascending: false });
      
      if (yearData) {
        const mapped = yearData.map((y: any) => ({ id: y.id, name: y.year }));
        setYears(mapped);
        const current = yearData.find((y: any) => y.is_current);
        if (current) setSelectedYear(current.id);
        else if (mapped.length > 0) setSelectedYear(mapped[0].id);
      }

      // Fetch Facilities
      // 1. Coordinator/Staff Access (Explicit links)
      const { data: coordinatorLinks } = await supabase
          .from("supervisor_coordinator_facilities")
          .select("facility_id")
          .eq("staff_user_id", userId);
      
      const coordinatorFacilityIds = (coordinatorLinks || []).map((l: any) => l.facility_id);

      // 2. Direct Ownership (Supervisor ID match)
      const { data: ownedFacilities } = await supabase
          .from("facilities")
          .select("id")
          .eq("is_deleted", false)
          .eq("supervisor_id", svId);
      
      const ownedFacilityIds = (ownedFacilities || []).map((f: any) => f.id);

      const fids = Array.from(new Set([...coordinatorFacilityIds, ...ownedFacilityIds]));
      setFacilitiesOwned(fids);

      // Fetch Supervisor Groups
      if (fids.length > 0) {
        const { data: groups } = await supabase
          .from('supervisor_groups')
          .select('name, facility_id')
          .in('facility_id', fids)
          .eq('is_deleted', false)
          .order('name', { ascending: true });
        
        const uniqueNames = Array.from(new Set((groups || []).map((g: any) => g.name?.trim()).filter(Boolean)));
        setSupervisorGroups(uniqueNames.map(n => ({ name: n })));
      } else {
        setSupervisorGroups([]);
      }

      // Settings
      const tryTables = ["qr_card_settings", "qr_car_settigns"];
      let settingsFound = false;
      for (const table of tryTables) {
          if (settingsFound) break;
          if (cityName) {
             const { data, error } = await supabase
               .from(table)
               .select("replacement_cost, currency")
               .eq("city_name", cityName)
               .limit(1)
               .maybeSingle();
             if (!error && data) {
                if (data.replacement_cost != null) setReplacementCost(Number(data.replacement_cost));
                if (data.currency) setCurrency(String(data.currency));
                settingsFound = true;
                continue;
             }
          }
          const { data, error } = await supabase
             .from(table)
             .select("replacement_cost, currency")
             .limit(1)
             .maybeSingle();
           if (!error && data) {
             if (data.replacement_cost != null) setReplacementCost(Number(data.replacement_cost));
             if (data.currency) setCurrency(String(data.currency));
             settingsFound = true;
           }
      }

    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const channel = supabase.channel('qr-requests-supervisor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qr_cards' }, () => {
          setRefreshTrigger(p => p + 1);
      })
      .subscribe();
      return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (selectedYear && facilitiesOwned.length > 0) {
      fetchChildren();
    } else if (selectedYear && facilitiesOwned.length === 0) {
       // If no facilities owned, we can't fetch children, stop loading
       setLoading(false);
    }
  }, [selectedYear, facilitiesOwned, refreshTrigger]);

  const fetchChildren = async () => {
    if (facilitiesOwned.length === 0) {
      setChildren([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: childrenData, error } = await supabase
        .from('children_info')
        .select(`
          user_id, 
          class, 
          facility_id, 
          is_approved, 
          status,
          supervision_schedule,
          kindergarten_schedule,
          supervision_groups,
          users:users!inner(id, first_name, family_name, is_deleted),
          facilities:facility_id(id, name)
        `)
        .in('facility_id', facilitiesOwned)
        .eq('is_deleted', false)
        .eq('academic_year', selectedYear!)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // We need to manually map the result because we used aliases
      // However, the JS client might return the structure respecting aliases.
      // If aliases are used, data might look like: { users: {...}, facilities: {...} }
      // Standard postgrest returns exactly that.
      
      const rowsData = (childrenData || []) as any[];

      const userIds = Array.from(new Set(rowsData.map((c: any) => c.users?.id).filter(Boolean)));
      
      // Fetch QR Cards (batched)
      let qrData: any[] = [];
      if (userIds.length > 0) {
          const batchSize = 100;
          for (let i = 0; i < userIds.length; i += batchSize) {
              const batch = userIds.slice(i, i + batchSize);
              const { data } = await supabase
                  .from('qr_cards')
                  .select('*')
                  .in('user_id', batch)
                  .in('facility_id', facilitiesOwned)
                  .or('is_deleted.is.null,is_deleted.eq.false')
                  .order('requested_date', { ascending: false });
              if (data) qrData.push(...data);
          }
      }
      
      setQrRequests(qrData);

      const parseGroupRecord = (raw: any) => {
        if (!raw) return null;
        if (typeof raw === "object" && !Array.isArray(raw)) return raw;
        try {
            const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
        } catch {
            return null;
        }
      };

      const rows: ChildRow[] = rowsData
        .filter((c: any) => {
          if (!c.users || c.users.is_deleted) return false;
          const approved = c.is_approved === true;
          const st = String(c.status || "").toLowerCase();
          const invited = st === "invited" || st === "invited+pending";
          return approved || invited;
        })
        .map((c: any) => {
          return {
          id: c.users.id,
          first_name: c.users.first_name,
          family_name: c.users.family_name,
          class: c.class,
          facility_id: c.facility_id,
            facility_name: c.facilities?.name,
          supervision_schedule: c.supervision_schedule,
          kindergarten_schedule: c.kindergarten_schedule,
            supervision_groups: parseGroupRecord(c.supervision_groups)
          };
        });

      setChildren(rows);

    } catch (err) {
      console.error('Error fetching children:', err);
    } finally {
      setLoading(false);
    }
  };

    const normalizeGroupName = (value: any) =>
        typeof value === "string" ? value.trim().toLowerCase() : "";

    const filteredChildren = useMemo(() => {
    return children.filter(c => {
      // Search
      if (searchTerm) {
         const fullName = `${c.family_name} ${c.first_name}`.toLowerCase();
         const className = (c.class || '').toLowerCase();
         const fName = (c.facility_name || '').toLowerCase();
         const term = searchTerm.toLowerCase();
         if (!fullName.includes(term) && !className.includes(term) && !fName.includes(term)) return false;
      }

      // Lunch
      const chosen = (c.supervision_schedule && Array.isArray(c.supervision_schedule) && c.supervision_schedule.length > 0)
          ? c.supervision_schedule
          : (c.kindergarten_schedule && Array.isArray(c.kindergarten_schedule) && c.kindergarten_schedule.length > 0)
              ? c.kindergarten_schedule
              : [];
      const hasLunch = chosen.some((s: any) => String(s.lunch || '').toLowerCase() === 'essen');
      if (!hasLunch) return false;

      // Group Filter
      if (groupFilter !== 'all') {
        const values = c.supervision_groups ? Object.values(c.supervision_groups).map((v: any) => normalizeGroupName(v)) : [];
        const normalizedFilter = normalizeGroupName(groupFilter);

        if (normalizedFilter === normalizeGroupName('No Group')) {
           if (values.length > 0) return false;
         } else {
           if (!values.includes(normalizedFilter)) return false;
        }
      }

      const latest = latestByKey.get(`${c.id}:${c.facility_id}`);
      if (statusFilter === 'all') return true;
      if (statusFilter === 'requested') {
         if (!latest) return false;
         return latest.print_status === 'requested';
      }
      if (!latest) return false;
      return latest.print_status === statusFilter;
    });
  }, [children, searchTerm, statusFilter, groupFilter, latestByKey]);

  const handleToggleSelect = useCallback((key: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
      return next;
    });
  }, []);

  const handleRequestReplacement = async () => {
    if (selectedIds.size === 0) return;
    try {
      const selectedChildren = children.filter(c => selectedIds.has(`${c.id}:${c.facility_id}`));

      // Check server side state
      const selChildIds = Array.from(new Set(selectedChildren.map((c) => c.id)));
      const selFacilityIds = Array.from(new Set(selectedChildren.map((c) => c.facility_id)));
      
      const { data: existingPairs, error: pairsErr } = await supabase
          .from("qr_cards")
          .select("user_id,facility_id,card_sequence_number")
          .in("user_id", selChildIds)
          .in("facility_id", selFacilityIds)
          .or("is_deleted.is.null,is_deleted.eq.false");
      if (pairsErr) throw pairsErr;

      const serverHasAny = new Set<string>();
      const serverMaxSeq = new Map<string, number>();
      (existingPairs || []).forEach((r: any) => {
          const key = `${r.user_id}:${r.facility_id}`;
          serverHasAny.add(key);
          const prev = serverMaxSeq.get(key) ?? 0;
          const seq = Number(r.card_sequence_number ?? 0);
          if (seq > prev) serverMaxSeq.set(key, seq);
      });

      // Fetch eating locations
      const selectedFacilityIds = Array.from(new Set(selectedChildren.map(c => c.facility_id)));
      
      const { data: eatingLocs, error: elErr } = await supabase
          .from("eating_locations")
          .select("id, facility_ids, has_qr_card, is_deleted")
          .or("is_deleted.is.null,is_deleted.eq.false")
          .eq("has_qr_card", true);
      
      if (elErr) throw elErr;

      const facilityToEating = new Map<string, string | null>();
      selectedFacilityIds.forEach((fid) => {
          const match = (eatingLocs || []).find((el: any) => {
              const arr = Array.isArray(el.facility_ids) ? el.facility_ids : [];
              return arr.map(String).includes(String(fid));
          });
          facilityToEating.set(fid, match ? match.id : null);
      });

      const payload = selectedChildren.map(c => {
        const key = `${c.id}:${c.facility_id}`;
        const hasCard = childIdHasAnyCard.has(key) || serverHasAny.has(key);
        if (!hasCard) return null;

        const nextSeq = ((serverMaxSeq.get(key) ?? childIdToMaxSeq.get(key) ?? 0) + 1);

        return {
        user_id: c.id,
        facility_id: c.facility_id,
        eating_location_id: facilityToEating.get(c.facility_id) || null,
        status: 'requested',
        print_status: 'requested',
        requested_date: new Date().toISOString(),
          is_first_card: false,
          requested_by: 'supervisor', 
          qr_code_data: c.id, 
          card_sequence_number: nextSeq,
          cost: replacementCost,
          payment_status: 'pending',
          academic_year: selectedYear,
          is_deleted: false,
          class: c.class,
          requested_by_user_id: currentUserId
        };
      }).filter(Boolean) as any[];

      if (payload.length === 0) {
         Alert.alert("Nothing to request", "Selected children have no existing card yet");
         return;
      }

      const { error } = await supabase.from('qr_cards').insert(payload);
      if (error) throw error;
      
      // Optimistic update or refetch
      // Ideally refetch to get server timestamps etc, but for now just trigger refresh
      // setQrRequests(prev => [...payload, ...prev]); // simplified
      
      Alert.alert('Success', `${payload.length} requests created.`);
      setSelectedIds(new Set());
      setRefreshTrigger(prev => prev + 1);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleDelete = async (child: ChildRow) => {
    const latest = child.qr_requests?.[0];
    if (!latest) return;
    Alert.alert('Delete Request', 'Are you sure you want to delete this request?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          const { error } = await supabase
            .from('qr_cards')
            .update({ is_deleted: true })
            .eq('id', latest.id);
          if (error) throw error;
          setRefreshTrigger(p => p + 1);
        } catch(e: any) {
          Alert.alert('Error', e.message);
    }
      }}
    ]);
  };

  const renderItem = useCallback(({ item }: { item: ChildRow }) => {
    const key = `${item.id}:${item.facility_id}`;
    const latest = latestByKey.get(key);
    const isSelected = selectedIds.has(key);
    const hasCard = childIdHasAnyCard.has(key);

    return (
      <QRRequestRow
        item={item}
        latest={latest}
        isSelected={isSelected}
        hasCard={hasCard}
        currency={currency}
        replacementCost={replacementCost}
        onToggleSelect={handleToggleSelect}
        onDelete={handleDelete}
      />
    );
  }, [selectedIds, latestByKey, childIdHasAnyCard, currency, replacementCost, handleToggleSelect, handleDelete]);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header with Title and Year */}
      <View style={styles.topHeader}>
        <Text style={styles.title}>Mensa Karten</Text>
        <View style={{ width: 140 }}>
          <Dropdown 
             label="Year" 
             value={selectedYear} 
             options={years.map(y => ({ label: y.name, value: y.id }))}
             onSelect={setSelectedYear}
             style={styles.yearDropdown}
           />
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {/* Filter Row */}
        <View style={styles.filtersRow}>
           <View style={styles.searchContainer}>
             <Ionicons name="search" size={18} color="#999" />
             <TextInput 
               style={styles.searchInput}
               placeholder="Search by name, class or facility..." 
               value={searchTerm}
               onChangeText={setSearchTerm}
             />
           </View>

           {/* Group Dropdown */}
           <Dropdown 
             label="Alle Gruppen"
             value={groupFilter}
             options={[
               { label: "Alle Gruppen", value: 'all' },
               { label: "Ohne Gruppe", value: 'No Group' },
               ...supervisorGroups.map(g => ({ label: g.name, value: g.name }))
             ]}
             onSelect={(v) => setGroupFilter(v as string)}
             style={{ width: 160 }}
           />

           {/* Status Dropdown */}
           <Dropdown 
             label="Status"
             value={statusFilter}
             options={[
               { label: "Requested", value: 'requested' },
               { label: "Pending Print", value: 'pending_print' },
               { label: "Printed", value: 'printed' },
               { label: "All", value: 'all' },
             ]}
             onSelect={(v) => setStatusFilter(v as string)}
             style={{ width: 140 }}
           />

                <TouchableOpacity 
             style={[styles.actionButton, selectedIds.size === 0 && styles.actionButtonDisabled]} 
             onPress={handleRequestReplacement}
             disabled={selectedIds.size === 0}
                >
              <Text style={styles.actionButtonText}>Request Replacement</Text>
                </TouchableOpacity>
        </View>
        
        {/* Table Header */}
        <View style={styles.tableHeader}>
           <View style={{ width: 40, alignItems: 'center' }}>
             {/* Checkbox header placeholder */}
           </View> 
           <Text style={[styles.headerCell, { flex: 2 }]}>Name</Text>
           <Text style={[styles.headerCell, { flex: 1 }]}>Class</Text>
           <Text style={[styles.headerCell, { flex: 1 }]}>Last Print</Text>
           <Text style={[styles.headerCell, { flex: 1 }]}>Price / Count</Text>
           <Text style={[styles.headerCell, { width: 60 }]}>Actions</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={filteredChildren}
          keyExtractor={item => `${item.id}:${item.facility_id}`}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.emptyText}>No children found</Text>}
          renderItem={renderItem}
        />
      )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
  },
  filtersRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 8,
    paddingHorizontal: 16,
  },
  searchContainer: {
    flexGrow: 1,
    minWidth: 200,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 40,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    height: '100%',
    marginLeft: 8,
  },
  yearDropdown: {
    width: '100%',
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    justifyContent: 'space-between',
    gap: 4,
  },
  dropdownText: {
    fontSize: 14,
    color: '#000',
    flex: 1,
  },
  actionButton: {
    backgroundColor: '#666',
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
    marginTop: 8,
    paddingHorizontal: 16,
  },
  headerCell: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
  },
  listContent: {
    paddingBottom: 40,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
  },
  tableRowSelected: {
    backgroundColor: '#F0F8FF',
  },
  cellTextBold: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  cellTextSub: {
    fontSize: 12,
    color: '#8E8E93',
  },
  cellText: {
    fontSize: 14,
    color: '#333',
  },
  requestedBadge: {
    marginTop: 2,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  requestedBadgeText: {
    fontSize: 10,
    color: '#333',
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
    minWidth: 250,
    maxHeight: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
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
    fontSize: 16,
    color: '#000',
  },
  modalItemTextSelected: {
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#666',
    fontSize: 16,
  },
});
