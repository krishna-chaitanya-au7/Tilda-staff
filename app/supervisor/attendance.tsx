import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, TouchableOpacity, View, Text, Modal, TextInput, Alert, useWindowDimensions, TouchableWithoutFeedback, Platform } from 'react-native';
import { format, addDays, subDays, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIsMobile } from '@/hooks/use-is-mobile';
import AttendanceLogsPanel from '@/components/AttendanceLogsPanel';
import SendMessageDialog from '@/components/SendMessageDialog';
import AttendanceEventDialog, { AttendanceEventType } from '@/components/AttendanceEventDialog';

// --- Types ---

interface Facility {
  id: string;
  name: string;
  facility_type?: string | null;
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
    bus_stop?: string;
    kindergarten_schedule?: { day: string; lunch?: string; drop_time?: string; pickup_time?: string }[];
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

const StatusOptionsModal = ({ visible, onClose, onSelect, currentStatus }: { visible: boolean, onClose: () => void, onSelect: (val: string) => void, currentStatus?: string }) => {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.modalContent, { width: 250 }]}>
          <Text style={{ fontSize: 16, fontWeight: '600', padding: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
            Status ändern
          </Text>
          <TouchableOpacity style={styles.modalItem} onPress={() => onSelect('came_late')}>
             <Text style={styles.modalItemText}>Verspätet</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.modalItem} onPress={() => onSelect('left_early')}>
             <Text style={styles.modalItemText}>Früher gegangen</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modalItem, { borderTopWidth: 1, borderTopColor: '#eee' }]} onPress={() => onSelect('reset')}>
             <Text style={[styles.modalItemText, { color: '#111827' }]}>Zurücksetzen (Pending)</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

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

const ChildAttendanceMobileCard = React.memo(({
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
  getGroup,
  onShowOptions,
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
      onLongPress={() => onViewChild(item.id, item.children_info?.facility_id)}
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
          {getGroup && getGroup(item) ? (
            <Text style={mobileStyles.metaText}>· {getGroup(item)}</Text>
          ) : null}
          {selectedFacility === 'all' && facilityName ? (
            <Text style={[mobileStyles.metaText, { color: '#111827' }]}>· {facilityName}</Text>
          ) : null}
        </View>
        <View style={mobileStyles.badgeRow}>
          {item.is_leave ? (
            <View style={[mobileStyles.pill, { backgroundColor: '#F1F5F9' }]}>
              <Text style={[mobileStyles.pillText, { color: '#111827' }]}>Krank</Text>
            </View>
          ) : null}
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
            <Text style={[mobileStyles.statusBtnText, { color: '#111827' }]}>Urlaub</Text>
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
              style={mobileStyles.quickBtn}
              hitSlop={8}
            >
              <Ionicons name="checkmark-circle" size={30} color="#4CAF50" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation?.(); onStatusUpdate(item.id, 'Absent'); }}
              style={mobileStyles.quickBtn}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={30} color="#F44336" />
            </TouchableOpacity>
          </View>
        )}
        {isSelected ? (
          <Ionicons name="checkmark-circle" size={16} color="#111827" style={{ marginTop: 6 }} />
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

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
  cardSelected: {
    borderColor: '#111827',
    backgroundColor: '#F8FAFC',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  metaText: {
    fontSize: 12,
    color: '#64748B',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  actions: {
    alignItems: 'flex-end',
    gap: 4,
  },
  statusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 72,
    justifyContent: 'center',
  },
  statusBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  quickStatus: {
    flexDirection: 'row',
    gap: 8,
  },
  quickBtn: {
    padding: 2,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    marginBottom: 12,
    gap: 8,
  },
  statPill: {
    width: '48%',
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  statPillValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  statPillLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
});

const supMobileNav = StyleSheet.create({
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
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pdfBtnText: { color: '#111827', fontWeight: '700', fontSize: 13 },
});

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
  getGroup,
  onShowOptions,
  compactKindergartenLayout = false,
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
              color={isSelected ? "#111827" : "#ccc"} 
          />
      </TouchableOpacity>

      <View style={{ flex: compactKindergartenLayout ? 3 : 2 }}>
         <Text style={styles.nameText}>{item.family_name}, {item.first_name}</Text>
         {compactKindergartenLayout ? (
           <>
             {item.children_info?.class ? (
               <Text style={styles.subText}>Klasse {item.children_info.class}</Text>
             ) : null}
             {selectedFacility === 'all' && facilityName ? (
               <Text style={styles.facilityText}>{facilityName}</Text>
             ) : null}
           </>
         ) : (
           <>
             <Text style={styles.subText}>{getGroup(item)}</Text>
             {selectedFacility === 'all' && facilityName ? (
               <Text style={styles.facilityText}>{facilityName}</Text>
             ) : null}
           </>
         )}
         {item.is_leave && <View style={styles.badgeRed}><Text style={styles.badgeTextRed}>Krank</Text></View>}
      </View>

      {!compactKindergartenLayout && (
        <View style={{ flex: 1 }}>
          <Text style={styles.cellText}>{item.children_info?.class || '-'}</Text>
        </View>
      )}

      <View style={{ flex: compactKindergartenLayout ? 2 : 1.5 }}>
         <Text style={[styles.cellText, hasAllergy && { color: '#111827', fontWeight: 'bold' }]}>
           {mealName} {hasAllergy && '!'}
         </Text>
      </View>

      <View style={styles.actions}>
         {attendanceRecord?.is_leave ? (
            <Text style={{ color: '#111827', fontSize: 12 }}>On Leave</Text>
         ) : attendanceRecord?.status && attendanceRecord.status !== 'Pending' ? (
           <TouchableOpacity 
             onPress={() => onShowOptions(item.id)} 
             style={styles.statusButton}
           >
              <Text style={[styles.statusButtonText, attendanceRecord.status === 'Absent' && styles.statusButtonTextRed]}>
                {attendanceRecord.status === 'Present' ? 'Anwesend' : 'Abwesend'}
              </Text>
              <Ionicons 
                name="chevron-down" 
                size={12} 
                color={attendanceRecord.status === 'Absent' ? '#111827' : '#111827'} 
              />
           </TouchableOpacity>
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
  const isMobile = useIsMobile();
  const statsCardMinHeight = isMobile ? 92 : 140;

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
  const [sortCol, setSortCol] = useState<'name' | 'class' | 'lunch' | 'status'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Kindergarten-specific layout flag
  const isKindergartenStaff = useMemo(() => {
    if (!facilities.length) return false;
    return facilities.every((f) => {
      const t = (f as any).facility_type;
      if (!t) return false;
      const norm = String(t).toLowerCase();
      return norm.includes('kita') || norm.includes('kindergarten');
    });
  }, [facilities]);

  // Options & Events
  const [optionsModalVisible, setOptionsModalVisible] = useState(false);
  const [selectedChildForOptions, setSelectedChildForOptions] = useState<string | null>(null);
  const [eventDialog, setEventDialog] = useState<{
    open: boolean;
    type: AttendanceEventType;
    userId?: string;
    recordId?: string;
  }>({ open: false, type: 'late' });

  const handleSort = (col: 'name' | 'class' | 'lunch' | 'status') => {
    if (sortCol === col) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  // --- Event Logic ---

  const parseTimeToMinutes = (timeString: string): number => {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const saveAttendanceEvent = async (events: any[]) => {
    if (!eventDialog.recordId) return;
    let attendanceId = eventDialog.recordId;
    
    // Check for temporary ID (optimistic update that hasn't synced yet)
    if (attendanceId.toString().startsWith('temp_')) {
       // Try to fetch the real ID if available
       if (eventDialog.userId) {
          const dateStr = format(selectedDate, 'yyyy-MM-dd');
          const { data } = await supabase
            .from('child_attendance')
            .select('id')
            .eq('user_id', eventDialog.userId)
            .eq('date', dateStr)
            .maybeSingle();
            
          if (data) {
             attendanceId = data.id;
          } else {
             Alert.alert("Error", "Bitte warten Sie einen Moment, bis die Anwesenheit synchronisiert ist.");
             return;
          }
       }
    }

    // Fetch current record to be safe or use local
    const rec = attendanceRecords.find((r) => r.id === attendanceId) || attendanceRecords.find((r) => r.id === eventDialog.recordId); // Fallback to temp if local
    const current = (rec as any)?.attendance_note as any[] | undefined;
    let nextArray = Array.isArray(current) ? [...current] : [];

    for (const event of events) {
       if (event.id) {
         // Update existing
         const idx = nextArray.findIndex(e => e.id === event.id);
         if (idx !== -1) {
            nextArray[idx] = { 
              ...nextArray[idx], 
              type: event.type, 
              minutes: event.time ? parseTimeToMinutes(event.time) : null,
              comment: event.comment ?? null,
              updated_at: new Date().toISOString()
            };
         }
       } else {
         // Append new
         nextArray.push({
            id: Math.random().toString(36).substring(7),
            type: event.type,
            minutes: event.time ? parseTimeToMinutes(event.time) : null,
            comment: event.comment ?? null,
            created_at: new Date().toISOString(),
         });
       }
    }

    // Optimistic
    setAttendanceRecords(prev => prev.map(r => r.id === eventDialog.recordId ? { ...r, attendance_note: nextArray } : r));

    // Save
    const { error } = await supabase
      .from("child_attendance")
      .update({ attendance_note: nextArray })
      .eq("id", attendanceId);
      
    if (error) {
      Alert.alert('Error', 'Failed to save event: ' + error.message);
      // Revert optimistic update on error
      if (rec) {
          setAttendanceRecords(prev => prev.map(r => r.id === eventDialog.recordId ? rec : r) as any);
      }
    } else {
       // If we updated a real record but state still has temp ID (race condition), we should probably refresh
       if (eventDialog.recordId.toString().startsWith('temp_')) {
          setRefreshTrigger(p => p + 1);
       }
    }
    setEventDialog(prev => ({ ...prev, open: false }));
  };

  const handleOptionSelect = (option: string) => {
    setOptionsModalVisible(false);
    if (!selectedChildForOptions) return;
    
    const childId = selectedChildForOptions;
    const record = attendanceRecords.find(r => r.user_id === childId);
    if (!record) return;

    if (option === 'reset') {
       handleStatusUpdate(childId, 'Pending');
    } else if (option === 'came_late') {
       setEventDialog({
         open: true,
         type: 'late',
         userId: childId,
         recordId: record.id
       });
    } else if (option === 'left_early') {
       setEventDialog({
         open: true,
         type: 'early_leave',
         userId: childId,
         recordId: record.id
       });
    }
    // Don't clear selectedChildForOptions immediately if we need it for something else, but here we are done with it for this flow or passing it to eventDialog
  };

  const handleShowOptions = (childId: string) => {
    setSelectedChildForOptions(childId);
    setOptionsModalVisible(true);
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
            .select('id, name, facility_type')
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

  // --- Realtime Subscription ---
  useEffect(() => {
    if (!selectedFacility || !currentAcademicYear) return;

    const channel = supabase
      .channel('attendance_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'child_attendance',
          filter: `academic_year=eq.${currentAcademicYear}` 
        },
        (payload) => {
           // Check if change is relevant to current date
           const record = payload.new as any || payload.old as any;
           if (record && record.date === format(selectedDate, 'yyyy-MM-dd')) {
              // If it's an update/insert, update local state immediately
              if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                 const newRecord = payload.new as ChildAttendance;
                 setAttendanceRecords(prev => {
                    const idx = prev.findIndex(r => r.id === newRecord.id);
                    if (idx >= 0) {
                       const updated = [...prev];
                       updated[idx] = newRecord;
                       return updated;
                    }
                    return [...prev, newRecord];
                 });
              } else if (payload.eventType === 'DELETE') {
                 const oldRecord = payload.old as any;
                 setAttendanceRecords(prev => prev.filter(r => r.id !== oldRecord.id));
              }
           }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedFacility, currentAcademicYear, selectedDate]);

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
    const sorted = Array.from(classes).sort();
    setAvailableClasses(sorted);

    // Kindergarten: default to a single class view if possible
    if (isKindergartenStaff && sorted.length > 0 && (classFilter === 'all' || !sorted.includes(classFilter))) {
      setClassFilter(sorted[0]);
    }
  }, [children, selectedDate, isKindergartenStaff, classFilter]);

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

    // 1. Optimistic Update
    setAttendanceRecords(prevRecords => {
       const existingIndex = prevRecords.findIndex(r => r.user_id === childId);
       if (existingIndex >= 0) {
          // Update existing record
          const updated = [...prevRecords];
          updated[existingIndex] = { ...updated[existingIndex], status, updated_at: new Date().toISOString() } as any;
          return updated;
       } else {
          // Add new temporary record
          const newRecord: ChildAttendance = {
             id: `temp_${Date.now()}`,
             user_id: childId,
             status,
             date: dateStr,
             facility_id: targetFacility,
             is_leave: false,
             attendance_note: []
          };
          return [...prevRecords, newRecord];
       }
    });

    try {
       const existing = attendanceRecords.find(r => r.user_id === childId);
       
       if (existing && !existing.id.startsWith('temp_')) {
         const { error } = await supabase
           .from('child_attendance')
           .update({ status, updated_at: new Date().toISOString() })
           .eq('id', existing.id);
           
         if (error) throw error;
       } else {
         const { data, error } = await supabase.from('child_attendance').insert({
           user_id: childId,
           status,
           date: dateStr,
           facility_id: targetFacility,
           academic_year: currentAcademicYear,
           is_leave: false
         }).select().single();

         if (error) throw error;
         
         // Replace temp record with real one
         if (data) {
            setAttendanceRecords(prev => prev.map(r => r.user_id === childId ? data : r));
         }
       }
       // No need to trigger full refresh, optimistic update handles UI
    } catch (err) {
      console.error('Update error:', err);
      Alert.alert('Error', 'Failed to update attendance');
      // Revert optimistic update on error (simple fetch refresh)
      setRefreshTrigger(p => p + 1);
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

  // --- PDF Export ---

  const [exporting, setExporting] = useState(false);

  const handleExportPdf = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const escapeHtml = (val: any) =>
        String(val ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

      // Today's relevant children (respecting active filters), sorted by name
      const rows = children
        .filter(c => hasSupervisionToday(c))
        .filter(c => {
          if (searchTerm) {
            const name = `${c.family_name} ${c.first_name}`.toLowerCase();
            if (!name.includes(searchTerm.toLowerCase())) return false;
          }
          if (classFilter !== 'all' && c.children_info?.class !== classFilter) return false;
          if (groupFilter !== 'all') {
            const g = getGroup(c);
            if (groupFilter === 'No Group' ? g !== 'No Group' : g !== groupFilter) return false;
          }
          if (statusFilter !== 'all') {
            const rec = getAttendanceStatus(c);
            if (statusFilter === 'on_leave') return Boolean(rec?.is_leave);
            if (statusFilter === 'pending') return !rec || rec.status === 'Pending';
            if (!rec) return false;
            return rec.status.toLowerCase() === statusFilter.toLowerCase();
          }
          return true;
        })
        .sort((a, b) =>
          `${a.family_name} ${a.first_name}`.localeCompare(
            `${b.family_name} ${b.first_name}`,
            'de',
            { numeric: true, sensitivity: 'base' }
          )
        );

      if (rows.length === 0) {
        Alert.alert('Keine Daten', 'Für diesen Tag gibt es keine Kinder zum Exportieren.');
        setExporting(false);
        return;
      }

      const facilityLabel =
        selectedFacility === 'all'
          ? 'Alle Einrichtungen'
          : getFacilityName(selectedFacility || undefined);
      const dateLabel = format(selectedDate, 'EEEE, dd.MM.yyyy', { locale: de });

      const bodyRows = rows
        .map(c => {
          const info = c.children_info || {};
          const meal = mealSelections.find(m => m.user_id === c.id);
          const hasMeal = meal && !meal.is_deleted && !meal.is_skipped;
          const mealName = hasMeal ? (meal?.menuline?.name || 'Menü') : '–';
          const daySchedule = (info.kindergarten_schedule || []).find(
            (s: any) => s.day === getCurrentDayAbbreviation()
          );
          const drop = daySchedule?.drop_time?.trim();
          const pickup = daySchedule?.pickup_time?.trim();
          const busInfo = drop || pickup ? `${drop || '–'} – ${pickup || '–'}` : '–';
          const rec = attendanceRecords.find(r => r.user_id === c.id);
          const statusLabel = rec?.is_leave
            ? 'Krank'
            : rec?.status === 'Present'
              ? 'Anwesend'
              : rec?.status === 'Absent'
                ? 'Abwesend'
                : 'Ausstehend';
          return `
            <tr>
              <td>${escapeHtml(`${c.family_name} ${c.first_name}`)}</td>
              <td>${escapeHtml(busInfo)}</td>
              <td>${escapeHtml(info.class || '–')}</td>
              <td>${escapeHtml(mealName)}</td>
              <td>${escapeHtml(statusLabel)}</td>
            </tr>`;
        })
        .join('');

      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              * { font-family: -apple-system, Helvetica, Arial, sans-serif; }
              body { padding: 24px; color: #111827; }
              h1 { font-size: 20px; margin: 0 0 4px; }
              .meta { font-size: 12px; color: #6B7280; margin-bottom: 16px; }
              table { width: 100%; border-collapse: collapse; font-size: 12px; }
              th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #E5E7EB; }
              th { background: #F9FAFB; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; color: #6B7280; }
              tr:nth-child(even) td { background: #FBFBFD; }
            </style>
          </head>
          <body>
            <h1>Anwesenheit</h1>
            <div class="meta">${escapeHtml(facilityLabel)} · ${escapeHtml(dateLabel)} · ${rows.length} Kinder</div>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Buszeit</th>
                  <th>Klasse</th>
                  <th>Essen</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>${bodyRows}</tbody>
            </table>
          </body>
        </html>`;

      if (Platform.OS === 'web') {
        // expo-print's web path prints the whole document; use an isolated
        // iframe so only the attendance table is sent to the printer.
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document;
        if (doc) {
          doc.open();
          doc.write(html);
          doc.close();
          const win = iframe.contentWindow!;
          const cleanup = () => {
            setTimeout(() => {
              if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            }, 500);
          };
          win.onafterprint = cleanup;
          // Give the iframe a tick to lay out before printing.
          setTimeout(() => {
            win.focus();
            win.print();
            cleanup();
          }, 250);
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: '.pdf' });
        }
      }
    } catch (err: any) {
      console.error('PDF export error:', err);
      Alert.alert('Fehler', 'PDF konnte nicht erstellt werden.');
    } finally {
      setExporting(false);
    }
  }, [exporting, children, searchTerm, classFilter, groupFilter, statusFilter, mealSelections, attendanceRecords, selectedFacility, selectedDate, facilities, getGroup]);

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
        } else if (sortCol === 'class') {
           valA = (a.children_info?.class || '').toString().toLowerCase();
           valB = (b.children_info?.class || '').toString().toLowerCase();
        } else if (sortCol === 'lunch') {
           const mealA = mealSelections.find(m => m.user_id === a.id);
           const mealB = mealSelections.find(m => m.user_id === b.id);
           const hasMealA = mealA && !mealA.is_deleted && !mealA.is_skipped;
           const hasMealB = mealB && !mealB.is_deleted && !mealB.is_skipped;
           valA = hasMealA ? (mealA?.menuline?.name || 'Menu') : '';
           valB = hasMealB ? (mealB?.menuline?.name || 'Menu') : '';
        } else if (sortCol === 'status') {
           const attA = getAttendanceStatus(a);
           const attB = getAttendanceStatus(b);
           const getStatus = (rec?: ChildAttendance) => {
             if (rec?.is_leave) return 'on leave';
             return (rec?.status || 'pending').toLowerCase();
           };
           valA = getStatus(attA);
           valB = getStatus(attB);
        }

        // Use numeric sort to handle "Class 1" vs "Class 10" correctly
        return sortDir === 'asc' 
          ? valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' })
          : valB.localeCompare(valA, undefined, { numeric: true, sensitivity: 'base' });
      });
  }, [children, searchTerm, classFilter, groupFilter, statusFilter, attendanceRecords, mealSelections, sortCol, sortDir]);

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

    if (isMobile) {
      return (
        <ChildAttendanceMobileCard
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
          onShowOptions={handleShowOptions}
        />
      );
    }

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
         onShowOptions={handleShowOptions}
         compactKindergartenLayout={isKindergartenStaff}
      />
    );
  }, [selectedIds, mealSelections, attendanceRecords, facilities, selectedFacility, getGroup, isKindergartenStaff, isMobile]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Fixed Header: Title & Facility (tablet only) */}
      {!isMobile && (
        <View style={styles.fixedHeader}>
          <Text style={styles.title}>Ganztag</Text>
          <View style={styles.facilityContextRow}>
              <Text style={styles.facilityContextText} numberOfLines={1}>
              {selectedFacility === 'all' ? 'Alle Einrichtungen' : getFacilityName(selectedFacility || undefined)}
              </Text>
          </View>
        </View>
      )}

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
            {isMobile && (
              <View style={{ paddingTop: 8, paddingBottom: 4, paddingHorizontal: 14 }}>
                <Text style={[styles.title, { fontSize: 18, marginBottom: 0 }]}>Ganztag</Text>
                <View style={styles.facilityContextRow}>
                  <Text style={[styles.facilityContextText, { fontSize: 12 }]} numberOfLines={1}>
                    {selectedFacility === 'all' ? 'Alle Einrichtungen' : getFacilityName(selectedFacility || undefined)}
                  </Text>
                </View>
              </View>
            )}
            {/* Header Container */}
            <View style={styles.header}>
              
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
              {isMobile ? (
                <>
                  <MobileStatsStrip
                    stats={stats}
                    onInfoPressSick={() => Alert.alert('Kranke Kinder', children.filter(c => hasSupervisionToday(c) && isSickLeave(c)).map(c => `${c.first_name} ${c.family_name}`).join('\n') || 'Keine')}
                    onInfoPressBus={() => Alert.alert('Bus Kinder', children.filter(c => hasSupervisionToday(c) && isBusChild(c)).map(c => `${c.first_name} ${c.family_name}`).join('\n') || 'Keine')}
                  />
                  {currentAcademicYear && (
                    <View style={{ marginHorizontal: 8, marginTop: 4, marginBottom: 8 }}>
                      <AttendanceLogsPanel
                        selectedAcademicYearId={currentAcademicYear}
                        selectedFacilityId={selectedFacility || 'all'}
                        selectedDate={format(selectedDate, 'yyyy-MM-dd')}
                        supervisorId={supervisorId}
                        isCoordinator={isCoordinator}
                        accessibleFacilities={accessibleFacilities}
                      />
                    </View>
                  )}
                </>
              ) : (
                <View style={[styles.dashboardRow, isLandscape && styles.dashboardRowLandscape]}>
                  {/* Stats Grid - Reduced width relative to logs */}
                  <View style={[styles.statsContainer, isLandscape && { flex: 1.1, marginRight: 16 }]}>
                    <View style={styles.statsGrid}>
                      <StatsCard
                        title="Kinder mit Betreuung"
                        value={stats.total}
                        bgColor="#E3F2FD" color="#1565C0"
                        style={{ width: '48%', minHeight: statsCardMinHeight }}
                      />
                      <StatsCard
                        title="Kinder Heute (ohne Krank)"
                        value={stats.active}
                        bgColor="#E8F5E9" color="#2E7D32"
                        style={{ width: '48%', minHeight: statsCardMinHeight }}
                      />
                      <StatsCard
                        title="Kinder Krank Heute"
                        value={stats.sick}
                        bgColor="#FFEBEE" color="#C62828"
                        showInfoIcon={stats.sick > 0}
                        onInfoPress={() => Alert.alert('Kranke Kinder', children.filter(c => hasSupervisionToday(c) && isSickLeave(c)).map(c => `${c.first_name} ${c.family_name}`).join('\n'))}
                        style={{ width: '48%', minHeight: statsCardMinHeight }}
                      />
                      <StatsCard
                        title="Bus Kinder Heute"
                        value={stats.bus}
                        bgColor="#FFF3E0" color="#EF6C00"
                        showInfoIcon={stats.bus > 0}
                        onInfoPress={() => Alert.alert('Bus Kinder', children.filter(c => hasSupervisionToday(c) && isBusChild(c)).map(c => `${c.first_name} ${c.family_name}`).join('\n'))}
                        style={{ width: '48%', minHeight: statsCardMinHeight }}
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
              )}

              {/* Navigation Row: Anwesenheit Title + Date + Message Button */}
              <View style={styles.navigationSection}>
                  {isMobile ? (
                    <>
                      <View style={supMobileNav.dateNavRow}>
                        <TouchableOpacity
                          onPress={() => setSelectedDate(subDays(selectedDate, 1))}
                          style={supMobileNav.chevBtn}
                          hitSlop={8}
                        >
                          <Ionicons name="chevron-back" size={22} color="#0F172A" />
                        </TouchableOpacity>
                        <Text style={supMobileNav.dateText} numberOfLines={1}>
                          {(() => {
                            const date = new Date(selectedDate);
                            const short = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
                            const dayName = short[date.getDay()];
                            const formattedDate = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
                            return `${dayName}, ${formattedDate}`;
                          })()}
                        </Text>
                        <TouchableOpacity
                          onPress={() => setSelectedDate(addDays(selectedDate, 1))}
                          style={supMobileNav.chevBtn}
                          hitSlop={8}
                        >
                          <Ionicons name="chevron-forward" size={22} color="#0F172A" />
                        </TouchableOpacity>
                      </View>
                      <View style={supMobileNav.sectionTitleRow}>
                        <Text style={supMobileNav.sectionTitle}>
                          Anwesenheit {selectedIds.size > 0 ? `· ${selectedIds.size}` : ''}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <TouchableOpacity
                            style={[supMobileNav.pdfBtn, exporting && { opacity: 0.4 }]}
                            disabled={exporting}
                            onPress={handleExportPdf}
                          >
                            {exporting ? (
                              <ActivityIndicator size="small" color="#111827" />
                            ) : (
                              <Ionicons name="print-outline" size={16} color="#111827" />
                            )}
                            <Text style={supMobileNav.pdfBtnText}>PDF</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[supMobileNav.msgBtn, selectedIds.size === 0 && { opacity: 0.4 }]}
                            disabled={selectedIds.size === 0}
                            onPress={() => setSendMessageOpen(true)}
                          >
                            <Ionicons name="mail-outline" size={16} color="#fff" />
                            <Text style={supMobileNav.msgBtnText}>Senden</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={styles.titleRow}>
                          <Text style={styles.sectionTitle}>Anwesenheit</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <TouchableOpacity
                              style={[styles.pdfButton, exporting && styles.messageButtonDisabled]}
                              disabled={exporting}
                              onPress={handleExportPdf}
                            >
                                {exporting ? (
                                  <ActivityIndicator size="small" color="#111827" />
                                ) : (
                                  <Ionicons name="print-outline" size={18} color="#111827" />
                                )}
                                <Text style={styles.pdfButtonText}>PDF</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.messageButton, selectedIds.size === 0 && styles.messageButtonDisabled]}
                              disabled={selectedIds.size === 0}
                              onPress={() => setSendMessageOpen(true)}
                            >
                                <Ionicons name="mail-outline" size={18} color="#fff" />
                                <Text style={styles.messageButtonText}>Nachricht senden</Text>
                            </TouchableOpacity>
                          </View>
                      </View>

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
                    </>
                  )}
              </View>
            </View>

            {/* Filters */}
            <View style={[styles.filterContainer, isMobile && { padding: 8, gap: 6, borderBottomWidth: 0 }]}>
              <View style={[styles.searchBox, isMobile && { width: '100%', flex: 0 }]}>
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
                style={isMobile ? { flex: 1, minWidth: 100 } : { width: 140 }}
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
                style={isMobile ? { flex: 1, minWidth: 90 } : { width: 110 }}
              />

              <Dropdown
                label="Klasse"
                value={classFilter}
                options={[{ label: 'Alle Klassen', value: 'all' }, ...availableClasses.map(c => ({ label: c, value: c }))]}
                onSelect={(val) => setClassFilter(val || 'all')}
                style={isMobile ? { flex: 1, minWidth: 90 } : { width: 110 }}
              />
            </View>

            {/* Header Row */}
            {isMobile ? (
              <View style={[styles.tableHeader, { paddingHorizontal: 14 }]}>
                <TouchableOpacity
                  style={{ flex: 2, flexDirection: 'row', alignItems: 'center' }}
                  onPress={() => handleSort('name')}
                >
                  <Text style={styles.headerCell}>Name</Text>
                  <Ionicons
                    name={sortCol === 'name' ? (sortDir === 'asc' ? 'arrow-up' : 'arrow-down') : 'swap-vertical'}
                    size={12}
                    color={sortCol === 'name' ? '#000' : '#ccc'}
                    style={{ marginLeft: 4 }}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1.5, flexDirection: 'row', alignItems: 'center' }}
                  onPress={() => handleSort('lunch')}
                >
                  <Text style={styles.headerCell}>Essen</Text>
                  <Ionicons
                    name={sortCol === 'lunch' ? (sortDir === 'asc' ? 'arrow-up' : 'arrow-down') : 'swap-vertical'}
                    size={12}
                    color={sortCol === 'lunch' ? '#000' : '#ccc'}
                    style={{ marginLeft: 4 }}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ width: 72, flexDirection: 'row', alignItems: 'center' }}
                  onPress={() => handleSort('status')}
                >
                  <Text style={styles.headerCell}>Status</Text>
                  <Ionicons
                    name={sortCol === 'status' ? (sortDir === 'asc' ? 'arrow-up' : 'arrow-down') : 'swap-vertical'}
                    size={12}
                    color={sortCol === 'status' ? '#000' : '#ccc'}
                    style={{ marginLeft: 4 }}
                  />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.tableHeader}>
                <View style={{ width: 40 }} />

                <TouchableOpacity
                  style={{ flex: isKindergartenStaff ? 3 : 2, flexDirection: 'row', alignItems: 'center' }}
                  onPress={() => handleSort('name')}
                >
                  <Text style={styles.headerCell}>
                    {isKindergartenStaff ? 'Name' : 'Name / Gruppe'}
                  </Text>
                  <Ionicons
                    name={sortCol === 'name' ? (sortDir === 'asc' ? 'arrow-up' : 'arrow-down') : 'swap-vertical'}
                    size={12}
                    color={sortCol === 'name' ? "#000" : "#ccc"}
                    style={{ marginLeft: 4 }}
                  />
                </TouchableOpacity>

                {!isKindergartenStaff && (
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
                )}

                <TouchableOpacity
                  style={{ flex: isKindergartenStaff ? 2 : 1.5, flexDirection: 'row', alignItems: 'center' }}
                  onPress={() => handleSort('lunch')}
                >
                  <Text style={styles.headerCell}>Essen</Text>
                  <Ionicons
                    name={sortCol === 'lunch' ? (sortDir === 'asc' ? 'arrow-up' : 'arrow-down') : 'swap-vertical'}
                    size={12}
                    color={sortCol === 'lunch' ? "#000" : "#ccc"}
                    style={{ marginLeft: 4 }}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ width: 80, flexDirection: 'row', alignItems: 'center' }}
                  onPress={() => handleSort('status')}
                >
                  <Text style={styles.headerCell}>Status</Text>
                  <Ionicons
                    name={sortCol === 'status' ? (sortDir === 'asc' ? 'arrow-up' : 'arrow-down') : 'swap-vertical'}
                    size={12}
                    color={sortCol === 'status' ? "#000" : "#ccc"}
                    style={{ marginLeft: 4 }}
                  />
                </TouchableOpacity>
                <Text style={[styles.headerCell, { width: 160, textAlign: 'center' }]}>Aktion</Text>
              </View>
            )}
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

      <StatusOptionsModal 
        visible={optionsModalVisible}
        onClose={() => setOptionsModalVisible(false)}
        onSelect={handleOptionSelect}
      />

      <AttendanceEventDialog
        open={eventDialog.open}
        onOpenChange={(open) => setEventDialog(prev => ({ ...prev, open }))}
        type={eventDialog.type}
        existing={
          eventDialog.recordId 
            ? attendanceRecords
                .find(r => r.id === eventDialog.recordId)
                ?.attendance_note
                ?.find((n: any) => n.type === eventDialog.type)
            : undefined
        }
        onSave={saveAttendanceEvent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  fixedHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    zIndex: 10,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
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
  pdfButton: {
    backgroundColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pdfButtonText: {
    color: '#111827',
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
    backgroundColor: '#F8FAFC',
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
    color: '#111827',
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
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  badgeTextRed: {
    color: '#111827',
    fontSize: 10,
    fontWeight: 'bold'
  },
  statusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    gap: 4,
    minWidth: 80,
    justifyContent: 'space-between'
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#111827',
  },
  statusButtonTextRed: {
    color: '#111827',
  },
});
