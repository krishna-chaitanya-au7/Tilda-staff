import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  View,
  Text,
  Modal,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, addDays, subDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { useIsMobile } from '@/hooks/use-is-mobile';
import AttendanceEmbeddedWeekCalendar from '@/components/AttendanceEmbeddedWeekCalendar';
import AttendanceLogsPanel from '@/components/AttendanceLogsPanel';
import SendMessageDialog from '@/components/SendMessageDialog';
import AttendanceEventDialog, { AttendanceEventType } from '@/components/AttendanceEventDialog';
import { SCREEN_HEADER_TOP_PAD } from '@/constants/theme';

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
  children_info?: {
    class?: string;
    supervision_schedule?: any[];
    kindergarten_schedule?: any[];
    facility_id?: string;
    is_bus_child?: boolean;
  };
}

const StatsCard = ({ title, value, color = '#000', bgColor = '#F5F5F5', showInfoIcon = false, onInfoPress, style }: any) => (
  <View style={[styles.statCard, { backgroundColor: bgColor }, style]}>
    {showInfoIcon && (
      <TouchableOpacity onPress={onInfoPress} style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}>
        <Ionicons name="information-circle-outline" size={20} color={color} />
      </TouchableOpacity>
    )}
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color }]}>{title}</Text>
    </View>
  </View>
);

const MobileStatsStrip = ({ stats, onInfoPressSick, onInfoPressBus }: any) => (
  <View style={mobileStyles.statGrid}>
    <View style={[mobileStyles.statPill, { backgroundColor: '#E3F2FD' }]}>
      <Text style={[mobileStyles.statPillValue, { color: '#1565C0' }]}>{stats.total}</Text>
      <Text style={[mobileStyles.statPillLabel, { color: '#1565C0' }]}>Betreuung</Text>
    </View>
    <View style={[mobileStyles.statPill, { backgroundColor: '#E8F5E9' }]}>
      <Text style={[mobileStyles.statPillValue, { color: '#2E7D32' }]}>{stats.active}</Text>
      <Text style={[mobileStyles.statPillLabel, { color: '#2E7D32' }]}>Heute</Text>
    </View>
    <TouchableOpacity
      onPress={stats.sick > 0 ? onInfoPressSick : undefined}
      activeOpacity={stats.sick > 0 ? 0.7 : 1}
      style={[mobileStyles.statPill, { backgroundColor: '#FFEBEE' }]}
    >
      <Text style={[mobileStyles.statPillValue, { color: '#C62828' }]}>{stats.sick}</Text>
      <Text style={[mobileStyles.statPillLabel, { color: '#C62828' }]}>Krank</Text>
    </TouchableOpacity>
    <TouchableOpacity
      onPress={stats.bus > 0 ? onInfoPressBus : undefined}
      activeOpacity={stats.bus > 0 ? 0.7 : 1}
      style={[mobileStyles.statPill, { backgroundColor: '#FFF3E0' }]}
    >
      <Text style={[mobileStyles.statPillValue, { color: '#EF6C00' }]}>{stats.bus}</Text>
      <Text style={[mobileStyles.statPillLabel, { color: '#EF6C00' }]}>Bus</Text>
    </TouchableOpacity>
  </View>
);

const mobileStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: 8,
    marginVertical: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardSelected: { borderColor: '#111827', backgroundColor: '#F8FAFC' },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 15, fontWeight: '700', color: '#111827' },
  body: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  metaText: { fontSize: 12, color: '#64748B' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  pillText: { fontSize: 11, fontWeight: '600' },
  actions: { alignItems: 'flex-end', gap: 4 },
  statusBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    minWidth: 72, justifyContent: 'center',
  },
  statusBtnText: { fontSize: 13, fontWeight: '700' },
  quickStatus: { flexDirection: 'row', gap: 8 },
  quickBtn: { padding: 2 },
  statGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 8, marginBottom: 12, gap: 8,
  },
  statPill: {
    width: '48%', flexGrow: 1, paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 14, alignItems: 'center',
  },
  statPillValue: { fontSize: 22, fontWeight: '800' },
  statPillLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
});

const mobileStyles2 = StyleSheet.create({
  dateNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginHorizontal: 8,
  },
  chevBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  dateText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  msgBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#111827',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  msgBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});

const ChildMobileRow = React.memo(({
  item, isSelected, attendanceRecord, mealSelection,
  onToggleSelection, onStatusUpdate, onViewChild, onShowOptions,
}: any) => {
  const hasMeal = mealSelection && !mealSelection.is_deleted && !mealSelection.is_skipped;
  const mealName = hasMeal ? mealSelection?.menuline?.name || 'Menu' : null;
  const hasAllergy = hasMeal && (mealSelection?.main_meal_allergy || mealSelection?.starter_allergy || mealSelection?.dessert_allergy);
  const status = attendanceRecord?.status;
  const onLeave = attendanceRecord?.is_leave;
  const initials = `${(item.first_name || '')[0] || ''}${(item.family_name || '')[0] || ''}`.toUpperCase();

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onToggleSelection(item.id)}
      onLongPress={() => onViewChild(item.id)}
      style={[mobileStyles.card, isSelected && mobileStyles.cardSelected]}
    >
      <View style={mobileStyles.avatar}>
        <Text style={mobileStyles.avatarText}>{initials || '?'}</Text>
      </View>
      <View style={mobileStyles.body}>
        <Text style={mobileStyles.name} numberOfLines={1}>
          {item.first_name} {item.family_name}
        </Text>
        <View style={mobileStyles.metaRow}>
          {item.children_info?.class ? (
            <Text style={mobileStyles.metaText}>Klasse {item.children_info.class}</Text>
          ) : null}
        </View>
        <View style={mobileStyles.badgeRow}>
          {mealName ? (
            <View style={[mobileStyles.pill, { backgroundColor: hasAllergy ? '#F1F5F9' : '#F1F5F9' }]}>
              <Ionicons name="restaurant" size={11} color={hasAllergy ? '#111827' : '#64748B'} />
              <Text style={[mobileStyles.pillText, { color: hasAllergy ? '#111827' : '#334155' }]} numberOfLines={1}>
                {mealName}{hasAllergy ? ' !' : ''}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={mobileStyles.actions}>
        {onLeave ? (
          <View style={[mobileStyles.statusBtn, { backgroundColor: '#F1F5F9' }]}>
            <Text style={[mobileStyles.statusBtnText, { color: '#111827' }]}>Krank</Text>
          </View>
        ) : status && status !== 'Pending' ? (
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation?.(); onShowOptions(item.id); }}
            style={[mobileStyles.statusBtn, { backgroundColor: status === 'Present' ? '#F1F5F9' : '#F1F5F9' }]}
          >
            <Text style={[mobileStyles.statusBtnText, { color: status === 'Present' ? '#111827' : '#111827' }]}>
              {status === 'Present' ? 'Da' : 'Fehlt'}
            </Text>
            <Ionicons name="chevron-down" size={12} color={status === 'Present' ? '#111827' : '#111827'} />
          </TouchableOpacity>
        ) : (
          <View style={mobileStyles.quickStatus}>
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation?.(); onStatusUpdate(item.id, 'Present'); }}
              hitSlop={8}
            >
              <Ionicons name="checkmark-circle" size={30} color="#4CAF50" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation?.(); onStatusUpdate(item.id, 'Absent'); }}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={30} color="#F44336" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

const StatusOptionsModal = ({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (val: string) => void;
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
      <View style={[styles.modalContent, { width: 250 }]}>
        <Text style={styles.modalTitle}>Status ändern</Text>
        <TouchableOpacity style={styles.modalItem} onPress={() => onSelect('came_late')}>
          <Text style={styles.modalItemText}>Verspätet</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.modalItem} onPress={() => onSelect('left_early')}>
          <Text style={styles.modalItemText}>Früher gegangen</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modalItem, styles.modalItemBorder]} onPress={() => onSelect('reset')}>
          <Text style={[styles.modalItemText, { color: '#111827' }]}>Zurücksetzen (Pending)</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  </Modal>
);

const ClassDropdown = ({
  value,
  options,
  onSelect,
}: {
  value: string;
  options: { label: string; value: string }[];
  onSelect: (val: string) => void;
}) => {
  const [visible, setVisible] = useState(false);
  const label = options.find((o) => o.value === value)?.label ?? value;
  return (
    <View>
      <TouchableOpacity style={styles.dropdownButton} onPress={() => setVisible(true)}>
        <Text style={styles.dropdownText} numberOfLines={1}>{label}</Text>
        <Ionicons name="chevron-down" size={16} color="#666" />
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setVisible(false)}>
          <View style={styles.modalContent}>
            <FlatList
              data={options}
              keyExtractor={(_, i) => i.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, item.value === value && styles.modalItemSelected]}
                  onPress={() => {
                    onSelect(item.value);
                    setVisible(false);
                  }}
                >
                  <Text style={[styles.modalItemText, item.value === value && styles.modalItemTextSelected]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

export default function FacilityAttendanceScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isLandscape = width > 600;
  const isMobile = useIsMobile();
  const statsCardMinHeight = isMobile ? 92 : 140;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [currentAcademicYear, setCurrentAcademicYear] = useState<string | null>(null);
  const [facilitySupervisorId, setFacilitySupervisorId] = useState<string>('');

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<ChildAttendance[]>([]);
  const [mealSelections, setMealSelections] = useState<MealSelection[]>([]);

  const [availableClasses, setAvailableClasses] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sendMessageOpen, setSendMessageOpen] = useState(false);

  const [optionsModalVisible, setOptionsModalVisible] = useState(false);
  const [selectedChildForOptions, setSelectedChildForOptions] = useState<string | null>(null);
  const [eventDialog, setEventDialog] = useState<{
    open: boolean;
    type: AttendanceEventType;
    userId?: string;
    recordId?: string;
  }>({ open: false, type: 'late' });
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const getCurrentDayAbbreviation = () => {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return dayNames[selectedDate.getDay()];
  };

  const hasSupervisionToday = (child: ChildRecord) => {
    // Kindergarten: use kindergarten_schedule (day, lunch, drop_time, pickup_time)
    const kgSchedule = child.children_info?.kindergarten_schedule;
    if (kgSchedule && Array.isArray(kgSchedule) && kgSchedule.length > 0) {
      const day = getCurrentDayAbbreviation();
      const todayEntry = kgSchedule.find((s: any) => s.day === day);
      return !!todayEntry;
    }
    // Fallback for legacy: supervision_schedule
    if (!child.children_info?.supervision_schedule) return false;
    const day = getCurrentDayAbbreviation();
    const todaySchedule = child.children_info.supervision_schedule.find((s: any) => s.day === day);
    return todaySchedule && todaySchedule.supervision !== 'keine Betreuung';
  };

  const getAttendanceStatus = (child: ChildRecord) =>
    attendanceRecords.find((r) => r.user_id === child.id);

  // --- Resolve facility & init ---
  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setError('Not authenticated');
          setLoading(false);
          return;
        }

        const { data: appUser } = await supabase
          .from('users')
          .select('id')
          .eq('auth_id', user.id)
          .maybeSingle<{ id: string }>();

        const { data: accessRows, error: accessError } = await supabase
          .from('user_access')
          .select('resource_id')
          .eq('resource_type', 'facility')
          .or(
            appUser?.id
              ? `user_id.eq.${appUser.id},user_id.eq.${user.id}`
              : `user_id.eq.${user.id}`
          );

        if (accessError || !accessRows?.length) {
          setError('No facility access found.');
          setLoading(false);
          return;
        }

        const fid = accessRows[0].resource_id;
        if (!fid) {
          setError('Facility ID missing.');
          setLoading(false);
          return;
        }
        setFacilityId(fid);

        const { data: facilityRow } = await supabase
          .from('facilities')
          .select('supervisor_id')
          .eq('id', fid)
          .maybeSingle<{ supervisor_id?: string }>();
        setFacilitySupervisorId(facilityRow?.supervisor_id ?? '');

        const { data: years } = await supabase
          .from('academic_years')
          .select('id, is_current')
          .order('year', { ascending: false });
        let ayId: string | null = null;
        if (years?.length) {
          const current = years.find((y: any) => y.is_current);
          ayId = current ? current.id : years[0].id;
        }
        setCurrentAcademicYear(ayId);
      } catch (e) {
        console.error('Init error', e);
        setError('Failed to load.');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // --- Fetch data (children, attendance, meals) for this facility + date ---
  useEffect(() => {
    if (!facilityId || !currentAcademicYear) return;

    const dateStr = format(selectedDate, 'yyyy-MM-dd');

    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: childrenData, error: childrenError } = await supabase
          .from('children_info')
          .select('*, users:users!inner(id, status, is_deleted)')
          .eq('facility_id', facilityId)
          .eq('academic_year', currentAcademicYear)
          .eq('is_deleted', false);

        if (childrenError) throw childrenError;

        const valid = (childrenData || []).filter((c: any) => !c.users?.is_deleted);
        const userIds = valid.map((c: any) => c.users.id);
        if (userIds.length === 0) {
          setChildren([]);
          setAttendanceRecords([]);
          setMealSelections([]);
          setLoading(false);
          return;
        }

        const { data: usersData } = await supabase
          .from('users')
          .select('*')
          .in('id', userIds)
          .eq('is_deleted', false);
        const usersMap = new Map((usersData || []).map((u: any) => [u.id, u]));

        const { data: attData } = await supabase
          .from('child_attendance')
          .select('*')
          .eq('facility_id', facilityId)
          .eq('academic_year', currentAcademicYear)
          .eq('date', dateStr)
          .in('user_id', userIds);
        setAttendanceRecords(attData || []);

        const { data: mealData } = await supabase
          .from('meal_selections')
          .select('*, menuline:menu_lines(id, name)')
          .eq('facility_id', facilityId)
          .eq('date', dateStr)
          .in('user_id', userIds)
          .eq('is_deleted', false);
        setMealSelections(mealData || []);

        const mapped: ChildRecord[] = valid.map((c: any) => {
          const u = usersMap.get(c.users.id);
          return {
            id: c.users.id,
            first_name: u?.first_name ?? 'Unknown',
            family_name: u?.family_name ?? 'User',
            children_info: c,
          };
        });
        setChildren(mapped);

        const classes = Array.from(new Set(mapped.map((c) => c.children_info?.class).filter(Boolean) as string[])).sort();
        setAvailableClasses(classes);
        if (classes.length > 0 && !classes.includes(selectedClass)) {
          setSelectedClass(classes[0]);
        } else if (classes.length > 0 && !selectedClass) {
          setSelectedClass(classes[0]);
        }
      } catch (e) {
        console.error('Fetch error', e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [facilityId, currentAcademicYear, selectedDate, refreshTrigger]);

  const classOptions = useMemo(
    () => availableClasses.map((c) => ({ label: c, value: c })),
    [availableClasses]
  );

  const filteredChildren = useMemo(() => {
    return children
      .filter((c) => hasSupervisionToday(c))
      .filter((c) => !selectedClass || c.children_info?.class === selectedClass)
      .sort((a, b) => `${a.family_name} ${a.first_name}`.localeCompare(`${b.family_name} ${b.first_name}`));
  }, [children, selectedClass, selectedDate]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedDate, selectedClass]);

  const isSickLeave = (child: ChildRecord) => {
    const rec = attendanceRecords.find((r) => r.user_id === child.id);
    return rec?.is_leave ?? false;
  };
  const isBusChild = (child: ChildRecord) => child.children_info?.is_bus_child ?? false;

  const stats = useMemo(() => {
    const relevant = children.filter(hasSupervisionToday).filter((c) => !selectedClass || c.children_info?.class === selectedClass);
    const sick = relevant.filter(isSickLeave);
    const bus = relevant.filter(isBusChild);
    const active = relevant.filter((c) => !isSickLeave(c));
    return { total: relevant.length, active: active.length, sick: sick.length, bus: bus.length };
  }, [children, selectedClass, selectedDate, attendanceRecords]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleStatusUpdate = useCallback(
    async (childId: string, status: 'Present' | 'Absent' | 'Pending') => {
      if (!facilityId || !currentAcademicYear) return;
      const dateStr = format(selectedDate, 'yyyy-MM-dd');

      setAttendanceRecords((prev) => {
        const idx = prev.findIndex((r) => r.user_id === childId);
        if (idx >= 0) {
          const up = [...prev];
          up[idx] = { ...up[idx], status } as ChildAttendance;
          return up;
        }
        return [...prev, { id: `temp_${Date.now()}`, user_id: childId, status, date: dateStr, facility_id: facilityId } as ChildAttendance];
      });

      try {
        const existing = attendanceRecords.find((r) => r.user_id === childId);
        if (existing && !existing.id.startsWith('temp_')) {
          await supabase
            .from('child_attendance')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
        } else {
          const { data } = await supabase
            .from('child_attendance')
            .insert({
              user_id: childId,
              status,
              date: dateStr,
              facility_id: facilityId,
              academic_year: currentAcademicYear,
              is_leave: false,
            })
            .select()
            .single();
          if (data) {
            setAttendanceRecords((prev) => prev.map((r) => (r.user_id === childId ? data : r)));
          }
        }
      } catch (e) {
        console.error(e);
        Alert.alert('Fehler', 'Status konnte nicht gespeichert werden.');
        setRefreshTrigger((p) => p + 1);
      }
    },
    [facilityId, currentAcademicYear, selectedDate, attendanceRecords]
  );

  const handleShowOptions = (childId: string) => {
    setSelectedChildForOptions(childId);
    setOptionsModalVisible(true);
  };

  const handleOptionSelect = (val: string) => {
    setOptionsModalVisible(false);
    if (!selectedChildForOptions) return;
    const childId = selectedChildForOptions;
    const record = attendanceRecords.find((r) => r.user_id === childId);
    if (val === 'reset') {
      handleStatusUpdate(childId, 'Pending');
      setSelectedChildForOptions(null);
      return;
    }
    setEventDialog({
      open: true,
      type: val === 'came_late' ? 'late' : 'early_leave',
      userId: childId,
      recordId: record?.id,
    });
    setSelectedChildForOptions(null);
  };

  const parseTimeToMinutes = (timeString: string): number => {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const saveAttendanceEvent = useCallback(
    async (events: Array<{ type: AttendanceEventType; time?: string; comment?: string; id?: string }>) => {
      if (!eventDialog.recordId || !facilityId) return;
      let attendanceId = eventDialog.recordId as string;

      if (String(attendanceId).startsWith('temp_') && eventDialog.userId) {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const { data } = await supabase
          .from('child_attendance')
          .select('id')
          .eq('user_id', eventDialog.userId)
          .eq('date', dateStr)
          .eq('facility_id', facilityId)
          .maybeSingle();
        if (data) attendanceId = data.id;
        else {
          Alert.alert('Hinweis', 'Bitte kurz warten, bis die Anwesenheit gespeichert ist.');
          return;
        }
      }

      const rec = attendanceRecords.find((r) => r.id === attendanceId || r.id === eventDialog.recordId);
      const current = (rec as any)?.attendance_note as any[] | undefined;
      let nextArray = Array.isArray(current) ? [...current] : [];

      for (const event of events) {
        if (event.id) {
          const idx = nextArray.findIndex((e: any) => e.id === event.id);
          if (idx !== -1) {
            nextArray[idx] = {
              ...nextArray[idx],
              type: event.type,
              minutes: event.time ? parseTimeToMinutes(event.time) : null,
              comment: event.comment ?? null,
              updated_at: new Date().toISOString(),
            };
          }
        } else {
          nextArray.push({
            id: Math.random().toString(36).substring(7),
            type: event.type,
            minutes: event.time ? parseTimeToMinutes(event.time) : null,
            comment: event.comment ?? null,
            created_at: new Date().toISOString(),
          });
        }
      }

      setAttendanceRecords((prev) =>
        prev.map((r) => (r.id === eventDialog.recordId ? { ...r, attendance_note: nextArray } : r))
      );

      const { error } = await supabase
        .from('child_attendance')
        .update({ attendance_note: nextArray })
        .eq('id', attendanceId);

      if (error) {
        Alert.alert('Fehler', 'Speichern fehlgeschlagen: ' + error.message);
        if (rec) {
          setAttendanceRecords((prev) => prev.map((r) => (r.id === eventDialog.recordId ? rec : r)) as any);
        }
      } else {
        if (String(eventDialog.recordId).startsWith('temp_')) setRefreshTrigger((p) => p + 1);
      }
      setEventDialog((prev) => ({ ...prev, open: false }));
    },
    [eventDialog.recordId, eventDialog.userId, facilityId, selectedDate, attendanceRecords]
  );

  const handleViewChild = (childId: string) => {
    if (!facilityId) return;
    router.push({
      pathname: '/user-details',
      params: { id: childId, facilityId, academicYearId: currentAcademicYear ?? '', from: 'attendance', returnTo: '/facility/attendance' },
    });
  };

  const handleViewParent = async (childId: string) => {
    const { data } = await supabase.from('users').select('manager_id').eq('id', childId).single();
    if (!data?.manager_id) {
      Alert.alert('Fehler', 'Elternteil nicht gefunden.');
      return;
    }
    if (!facilityId) return;
    router.push({
      pathname: '/user-details',
      params: { id: data.manager_id, facilityId, academicYearId: currentAcademicYear ?? '', from: 'attendance', returnTo: '/facility/attendance' },
    });
  };

  const renderRow = ({ item }: { item: ChildRecord }) => {
    const att = getAttendanceStatus(item);
    const meal = mealSelections.find((m) => m.user_id === item.id);
    const hasMeal = meal && !meal.is_deleted && !meal.is_skipped;
    const mealName = hasMeal ? meal?.menuline?.name || 'Menu' : '-';
    const hasAllergy = hasMeal && (meal?.main_meal_allergy || meal?.starter_allergy || meal?.dessert_allergy);
    const isSelected = selectedIds.has(item.id);

    if (isMobile) {
      return (
        <ChildMobileRow
          item={item}
          isSelected={isSelected}
          attendanceRecord={att}
          mealSelection={meal}
          onToggleSelection={toggleSelection}
          onStatusUpdate={handleStatusUpdate}
          onViewChild={handleViewChild}
          onShowOptions={handleShowOptions}
        />
      );
    }

    return (
      <View style={[styles.row, isSelected && styles.rowSelected]}>
        <TouchableOpacity onPress={() => toggleSelection(item.id)} style={styles.checkboxContainer}>
          <Ionicons name={isSelected ? 'checkbox' : 'square-outline'} size={24} color={isSelected ? '#111827' : '#ccc'} />
        </TouchableOpacity>
        <View style={styles.cellName}>
          <Text style={styles.nameText}>{item.family_name}, {item.first_name}</Text>
          {item.children_info?.class ? <Text style={styles.subText}>Klasse {item.children_info.class}</Text> : null}
        </View>
        <View style={styles.cellLunch}>
          <Text style={[styles.cellText, hasAllergy && styles.allergyText]}>{mealName} {hasAllergy ? '!' : ''}</Text>
        </View>
        <View style={styles.cellStatus}>
          {att?.is_leave ? (
            <Text style={styles.leaveText}>Krank</Text>
          ) : att?.status && att.status !== 'Pending' ? (
            <TouchableOpacity style={styles.statusBtn} onPress={() => handleShowOptions(item.id)}>
              <Text style={[styles.statusBtnText, att.status === 'Absent' && styles.statusBtnRed]}>
                {att.status === 'Present' ? 'Anwesend' : 'Abwesend'}
              </Text>
              <Ionicons name="chevron-down" size={12} color={att.status === 'Absent' ? '#111827' : '#111827'} />
            </TouchableOpacity>
          ) : (
            <View style={styles.statusActions}>
              <TouchableOpacity onPress={() => handleStatusUpdate(item.id, 'Present')}>
                <Ionicons name="checkmark-circle" size={28} color="#4CAF50" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleStatusUpdate(item.id, 'Absent')}>
                <Ionicons name="close-circle" size={28} color="#F44336" />
              </TouchableOpacity>
            </View>
          )}
        </View>
        <View style={styles.cellAction}>
          <TouchableOpacity style={styles.linkBtn} onPress={() => handleViewChild(item.id)}>
            <Text style={styles.linkBtnText}>Kind</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkBtn} onPress={() => handleViewParent(item.id)}>
            <Text style={styles.linkBtnText}>Eltern</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (error) {
    return (
      <View style={[styles.center, { paddingTop: (insets?.top ?? 0) + SCREEN_HEADER_TOP_PAD }]}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + SCREEN_HEADER_TOP_PAD }, isMobile && { paddingTop: insets.top + 4 }]}>
      {!isMobile && (
        <View style={styles.fixedHeader}>
          <Text style={styles.title}>Ganztag</Text>
          <View style={styles.facilityContextRow}>
            <Text style={styles.facilityContextText}>Einrichtung: Anwesenheit</Text>
          </View>
        </View>
      )}

      <FlatList
        data={loading ? [] : filteredChildren}
        extraData={[loading, selectedIds]}
        keyExtractor={(item) => item.id}
        renderItem={renderRow}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            {isMobile && (
              <View style={{ paddingTop: 8, paddingBottom: 4, paddingHorizontal: 14 }}>
                <Text style={[styles.title, { fontSize: 18, marginBottom: 0 }]}>Ganztag</Text>
                <View style={styles.facilityContextRow}>
                  <Text style={[styles.facilityContextText, { fontSize: 12 }]}>Einrichtung: Anwesenheit</Text>
                </View>
              </View>
            )}
            <View style={styles.header}>
              {/* Stats & Logs - same layout as supervisor */}
              {isMobile ? (
                <MobileStatsStrip
                  stats={stats}
                  onInfoPressSick={() => Alert.alert('Kranke Kinder', filteredChildren.filter(isSickLeave).map((c) => `${c.first_name} ${c.family_name}`).join('\n') || 'Keine')}
                  onInfoPressBus={() => Alert.alert('Bus Kinder', filteredChildren.filter(isBusChild).map((c) => `${c.first_name} ${c.family_name}`).join('\n') || 'Keine')}
                />
              ) : (
                <View style={[styles.dashboardRow, isLandscape && styles.dashboardRowLandscape]}>
                  <View style={[styles.statsContainer, isLandscape && { flex: 1.1, marginRight: 16 }]}>
                    <View style={styles.statsGrid}>
                      <StatsCard title="Kinder mit Betreuung" value={stats.total} bgColor="#E3F2FD" color="#1565C0" style={{ width: '48%', minHeight: statsCardMinHeight }} />
                      <StatsCard title="Kinder Heute (ohne Krank)" value={stats.active} bgColor="#E8F5E9" color="#2E7D32" style={{ width: '48%', minHeight: statsCardMinHeight }} />
                      <StatsCard
                        title="Kinder Krank Heute"
                        value={stats.sick}
                        bgColor="#FFEBEE"
                        color="#C62828"
                        showInfoIcon={stats.sick > 0}
                        onInfoPress={() => Alert.alert('Kranke Kinder', filteredChildren.filter(isSickLeave).map((c) => `${c.first_name} ${c.family_name}`).join('\n'))}
                        style={{ width: '48%', minHeight: statsCardMinHeight }}
                      />
                      <StatsCard
                        title="Bus Kinder Heute"
                        value={stats.bus}
                        bgColor="#FFF3E0"
                        color="#EF6C00"
                        showInfoIcon={stats.bus > 0}
                        onInfoPress={() => Alert.alert('Bus Kinder', filteredChildren.filter(isBusChild).map((c) => `${c.first_name} ${c.family_name}`).join('\n'))}
                        style={{ width: '48%', minHeight: statsCardMinHeight }}
                      />
                    </View>
                  </View>
                  <View style={[styles.logsContainer, isLandscape && { flex: 1 }]}>
                    {currentAcademicYear && facilityId && (
                      <AttendanceLogsPanel
                        selectedAcademicYearId={currentAcademicYear}
                        selectedFacilityId={facilityId}
                        selectedDate={format(selectedDate, 'yyyy-MM-dd')}
                        supervisorId={facilitySupervisorId}
                        isCoordinator={false}
                        accessibleFacilities={[facilityId]}
                        useKindergartenSchedule={true}
                      />
                    )}
                  </View>
                </View>
              )}

              {currentAcademicYear && facilityId ? (
                <View style={[styles.calendarCard, isMobile && { marginHorizontal: 4 }]}>
                  <AttendanceEmbeddedWeekCalendar
                    facilityId={facilityId}
                    academicYearId={currentAcademicYear}
                    anchorDate={selectedDate}
                    classFilter={selectedClass}
                    onWeekNavigate={(monday) => setSelectedDate(monday)}
                  />
                </View>
              ) : null}

              {isMobile && currentAcademicYear && facilityId ? (
                <View style={{ marginHorizontal: 8, marginTop: 8 }}>
                  <AttendanceLogsPanel
                    selectedAcademicYearId={currentAcademicYear}
                    selectedFacilityId={facilityId}
                    selectedDate={format(selectedDate, 'yyyy-MM-dd')}
                    supervisorId={facilitySupervisorId}
                    isCoordinator={false}
                    accessibleFacilities={[facilityId]}
                    useKindergartenSchedule={true}
                  />
                </View>
              ) : null}

              {/* Navigation: Anwesenheit title + Message button + Date */}
              <View style={styles.navigationSection}>
                {isMobile ? (
                  <>
                    <View style={mobileStyles2.dateNavRow}>
                      <TouchableOpacity
                        onPress={() => setSelectedDate(subDays(selectedDate, 1))}
                        style={mobileStyles2.chevBtn}
                        hitSlop={8}
                      >
                        <Ionicons name="chevron-back" size={22} color="#0F172A" />
                      </TouchableOpacity>
                      <Text style={mobileStyles2.dateText} numberOfLines={1}>
                        {format(selectedDate, 'EEE, d. MMM yyyy', { locale: de })}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setSelectedDate(addDays(selectedDate, 1))}
                        style={mobileStyles2.chevBtn}
                        hitSlop={8}
                      >
                        <Ionicons name="chevron-forward" size={22} color="#0F172A" />
                      </TouchableOpacity>
                    </View>
                    <View style={mobileStyles2.sectionTitleRow}>
                      <Text style={mobileStyles2.sectionTitle}>
                        Anwesenheit {selectedIds.size > 0 ? `· ${selectedIds.size}` : ''}
                      </Text>
                      <TouchableOpacity
                        style={[mobileStyles2.msgBtn, selectedIds.size === 0 && { opacity: 0.4 }]}
                        disabled={selectedIds.size === 0}
                        onPress={() => setSendMessageOpen(true)}
                      >
                        <Ionicons name="mail-outline" size={16} color="#fff" />
                        <Text style={mobileStyles2.msgBtnText}>Senden</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
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
                    <View style={styles.dateControls}>
                      <TouchableOpacity onPress={() => setSelectedDate(subDays(selectedDate, 1))} style={styles.navButton}>
                        <Ionicons name="chevron-back" size={20} color="#333" />
                        <Text style={styles.navButtonText}>Vorheriger Tag</Text>
                      </TouchableOpacity>
                      <Text style={styles.dateDisplay}>
                        {format(selectedDate, 'EEEE, d. MMM yyyy', { locale: de })}
                      </Text>
                      <TouchableOpacity onPress={() => setSelectedDate(addDays(selectedDate, 1))} style={styles.navButton}>
                        <Text style={styles.navButtonText}>Nächster Tag</Text>
                        <Ionicons name="chevron-forward" size={20} color="#333" />
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>

              {classOptions.length > 1 && (
                <View style={styles.classRow}>
                  <Text style={styles.classLabel}>Klasse:</Text>
                  <ClassDropdown value={selectedClass} options={classOptions} onSelect={setSelectedClass} />
                </View>
              )}

              {/* Table header */}
              <View style={[styles.tableHeader, isMobile && { paddingHorizontal: 14 }]}>
                {!isMobile && <View style={{ width: 40 }} />}
                <Text style={[styles.th, styles.cellName]}>Name</Text>
                <Text style={[styles.th, styles.cellLunch]}>Essen</Text>
                <Text style={[styles.th, styles.cellStatus]}>Status</Text>
                {!isMobile && <Text style={[styles.th, styles.cellAction]}>Aktion</Text>}
              </View>
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
              <Text style={{ color: '#999', fontSize: 13, marginTop: 8, textAlign: 'center' }}>
                {children.length === 0 ? 'Keine Daten geladen.' : `Am ${format(selectedDate, 'EEEE', { locale: de })} ist keine Betreuung geplant, oder alle Kinder sind ausgefiltert.`}
              </Text>
            </View>
          )
        }
      />

      <SendMessageDialog
        open={sendMessageOpen}
        onOpenChange={setSendMessageOpen}
        facilityId={facilityId ?? undefined}
        supervisorId={facilitySupervisorId ?? undefined}
        selectedChildIds={Array.from(selectedIds)}
      />

      <StatusOptionsModal visible={optionsModalVisible} onClose={() => setOptionsModalVisible(false)} onSelect={handleOptionSelect} />
      <AttendanceEventDialog
        open={eventDialog.open}
        onOpenChange={(open) => setEventDialog((prev) => ({ ...prev, open }))}
        type={eventDialog.type}
        existing={
          eventDialog.recordId
            ? (attendanceRecords.find((r) => r.id === eventDialog.recordId) as any)?.attendance_note?.find((n: any) => n.type === eventDialog.type)
            : undefined
        }
        onSave={saveAttendanceEvent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  errorText: { fontSize: 16, color: '#111827' },
  fixedHeader: { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 8, backgroundColor: '#FFFFFF', zIndex: 10 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 4, color: '#111827' },
  facilityContextRow: { marginBottom: 16 },
  facilityContextText: { fontSize: 16, color: '#666' },
  header: { paddingHorizontal: 16, paddingBottom: 16, backgroundColor: '#FFFFFF' },
  dashboardRow: { flexDirection: 'column', gap: 16, marginBottom: 24 },
  dashboardRowLandscape: { flexDirection: 'row', minHeight: 400 },
  statsContainer: {},
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: { padding: 16, borderRadius: 8, marginBottom: 4 },
  statValue: { fontSize: 42, fontWeight: '700', textAlign: 'center' },
  statLabel: { fontSize: 13, marginTop: 4, fontWeight: '500' },
  logsContainer: {},
  calendarCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  navigationSection: { marginTop: 8, marginBottom: 16, gap: 12 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  dateControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 8 },
  navButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6 },
  navButtonText: { fontSize: 13, fontWeight: '500', color: '#333', marginHorizontal: 4 },
  dateDisplay: { flex: 1, textAlign: 'center', paddingHorizontal: 12, fontSize: 14, fontWeight: '600', color: '#111827' },
  messageButton: { backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, gap: 8 },
  messageButtonDisabled: { opacity: 0.5 },
  messageButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  classRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 8 },
  classLabel: { fontSize: 14, marginRight: 8 },
  dropdownButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#f0f0f0', borderRadius: 8, minWidth: 120 },
  dropdownText: { fontSize: 14 },
  tableHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E5E5EA', backgroundColor: '#F9FAFB' },
  th: { fontWeight: '600', fontSize: 12, color: '#666' },
  cellName: { flex: 2 },
  cellLunch: { flex: 1 },
  cellStatus: { flex: 1.2 },
  cellAction: { flex: 1 },
  checkboxContainer: { width: 40, justifyContent: 'center', alignItems: 'center', paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F2F2F7' },
  rowSelected: { backgroundColor: '#F0F8FF' },
  nameText: { fontSize: 14, fontWeight: '500' },
  subText: { fontSize: 12, color: '#666', marginTop: 2 },
  cellText: { fontSize: 13 },
  allergyText: { color: '#111827', fontWeight: 'bold' },
  leaveText: { color: '#111827', fontSize: 12 },
  statusBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0', gap: 4 },
  statusBtnText: { fontSize: 12, color: '#111827' },
  statusBtnRed: { color: '#111827' },
  statusActions: { flexDirection: 'row', gap: 8 },
  linkBtn: { paddingVertical: 4 },
  linkBtnText: { fontSize: 12, color: '#111827' },
  listContent: { paddingBottom: 40 },
  emptyText: { textAlign: 'center', padding: 24, color: '#666', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, maxHeight: 400, minWidth: 200 },
  modalTitle: { fontSize: 16, fontWeight: '600', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalItem: { paddingVertical: 12, paddingHorizontal: 16 },
  modalItemBorder: { borderTopWidth: 1, borderTopColor: '#eee' },
  modalItemSelected: { backgroundColor: '#f0f0f0' },
  modalItemText: { fontSize: 14 },
  modalItemTextSelected: { fontWeight: '600' },
});
