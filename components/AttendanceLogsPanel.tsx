import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { format, parseISO } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { ThemedText } from '@/components/themed-text';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming, 
  Easing,
  cancelAnimation,
  runOnJS
} from 'react-native-reanimated';

interface AttendanceLogsPanelProps {
  selectedAcademicYearId: string;
  selectedFacilityId: string;
  selectedDate: string;
  supervisorId: string;
  isCoordinator: boolean;
  accessibleFacilities: string[];
}

interface LogEntry {
  id: string;
  time: string;
  actor: string;
  message: string;
  level: 'info' | 'warning' | 'error' | 'success';
}

// Helper function for normalization
const normalize = (v: any) => String(v ?? "").trim().toLowerCase();

export default function AttendanceLogsPanel({
  selectedAcademicYearId,
  selectedFacilityId,
  selectedDate,
  supervisorId,
  isCoordinator,
  accessibleFacilities
}: AttendanceLogsPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Transform Animation State
  const translateY = useSharedValue(0);
  const containerHeight = 400; // Fixed height of container
  const [contentHeight, setContentHeight] = useState(0);

  // Re-run animation when content or logs change
  useEffect(() => {
    if (logs.length > 0 && contentHeight > containerHeight) {
      // Reset
      cancelAnimation(translateY);
      translateY.value = 0;
      
      // Calculate duration based on height (e.g. 20 pixels per second)
      const distance = contentHeight - containerHeight; // Stop when bottom reaches bottom
      // Or if we want full scroll through: distance = contentHeight
      
      // Let's just scroll until the bottom of content hits bottom of container, then reset?
      // Or standard ticker style: scroll until end, then jump back.
      const duration = distance * 50; // Adjust speed
      
      translateY.value = withRepeat(
        withTiming(-distance, { duration, easing: Easing.linear }),
        -1,
        false // no reverse
      );
    } else {
      cancelAnimation(translateY);
      translateY.value = 0;
    }
  }, [logs, contentHeight]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }]
  }));

  useEffect(() => {
    fetchLogs();
    
    // Subscribe to audit_log changes
    const subscription = supabase
      .channel('public:audit_log')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'audit_log' 
      }, () => {
         // Simple refresh on new log
         fetchLogs(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [selectedAcademicYearId, selectedFacilityId, selectedDate]);

  const fetchLogs = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      // 1. Determine facilities to query
      let targetFacilities: string[] = [];
      if (selectedFacilityId !== 'all') {
        targetFacilities = [selectedFacilityId];
      } else {
        targetFacilities = accessibleFacilities;
      }

      if (targetFacilities.length === 0) {
        setLogs([]);
        setLoading(false);
        return;
      }

      // 2. Fetch eligible children IDs in these facilities for the current academic year
      const { data: children, error: childrenErr } = await supabase
        .from('children_info')
        .select('id, user_id')
        .in('facility_id', targetFacilities)
        .eq('academic_year', selectedAcademicYearId)
        .eq('is_deleted', false);

      if (childrenErr) throw childrenErr;

      const recordIds = children?.map((c: any) => c.id) || [];
      const userIds = children?.map((c: any) => c.user_id).filter(Boolean) || [];

      if (recordIds.length === 0 && userIds.length === 0) {
        setLogs([]);
        setLoading(false);
        return;
      }

      // 3. Fetch Audit Logs
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - 30); // Last 30 days
      const sinceIso = sinceDate.toISOString();

      const [childrenLogs, leaveLogs] = await Promise.all([
        supabase
          .from('audit_log')
          .select('id, table_name, record_id, action, old_data, new_data, change_message, changed_at, user_id')
          .eq('table_name', 'children_info')
          .in('record_id', recordIds)
          .gte('changed_at', sinceIso)
          .order('changed_at', { ascending: false })
          .limit(50),
        supabase
          .from('audit_log')
          .select('id, table_name, record_id, action, old_data, new_data, change_message, changed_at, user_id')
          .eq('table_name', 'child_leaves')
          .in('user_id', userIds)
          .gte('changed_at', sinceIso)
          .order('changed_at', { ascending: false })
          .limit(50)
      ]);

      const rawLogs = [...(childrenLogs.data || []), ...(leaveLogs.data || [])];
      rawLogs.sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime());
      const recentLogs = rawLogs.slice(0, 50);

      // 4. Fetch Actors
      const actorIds = Array.from(new Set(recentLogs.map(l => l.user_id).filter(Boolean)));
      let actorMap = new Map();
      
      if (actorIds.length > 0) {
        const { data: actors } = await supabase
          .from('users')
          .select('id, first_name, family_name')
          .in('id', actorIds);
        
        actors?.forEach((a: any) => {
          actorMap.set(a.id, `${a.first_name} ${a.family_name}`);
        });
      }

      // 5. Process and Format Logs
      const formattedLogs: LogEntry[] = recentLogs.map(log => {
        const time = format(parseISO(log.changed_at), 'dd.MM HH:mm');
        const actor = actorMap.get(log.user_id) || 'System';
        
        let message = '';
        let level: LogEntry['level'] = 'info';

        try {
          const oldData = typeof log.old_data === 'string' ? JSON.parse(log.old_data) : (log.old_data || {});
          const newData = typeof log.new_data === 'string' ? JSON.parse(log.new_data) : (log.new_data || {});

          if (log.table_name === 'child_leaves') {
             level = 'info';
             
             const oldLeave = oldData || {};
             const newLeave = newData || {};

             if (log.action === 'INSERT') {
                const type = newLeave.leave_type || 'leave';
                const status = newLeave.status || 'pending';
                const leaveDate = newLeave.date || newLeave.date_from || '';
                
                const formatTime = (iso: string | null) => iso ? format(parseISO(iso), 'HH:mm') : null;
                const from = formatTime(newLeave.hourly_from);
                const to = formatTime(newLeave.hourly_to);
                const timePart = from && to ? ` (${from}-${to})` : '';
                
                message = `Leave: ${type} on ${leaveDate}${timePart}. Status: ${status}`;
             } else if (log.action === 'UPDATE') {
                const changes: string[] = [];
                if (oldLeave.status !== newLeave.status) {
                  changes.push(`Status: ${oldLeave.status} → ${newLeave.status}`);
                }
                if (oldLeave.date !== newLeave.date) {
                  changes.push(`Date: ${oldLeave.date} → ${newLeave.date}`);
                }
                
                const formatTime = (iso: string | null) => iso ? format(parseISO(iso), 'HH:mm') : null;
                const oldFrom = formatTime(oldLeave.hourly_from);
                const oldTo = formatTime(oldLeave.hourly_to);
                const newFrom = formatTime(newLeave.hourly_from);
                const newTo = formatTime(newLeave.hourly_to);
                
                if (oldFrom !== newFrom || oldTo !== newTo) {
                  changes.push(`Time: ${oldFrom || '--'}-${oldTo || '--'} → ${newFrom || '--'}-${newTo || '--'}`);
                }
                
                message = changes.length > 0 ? changes.join('; ') : (log.change_message || 'Leave updated');
             }
          } else if (log.table_name === 'children_info') {
             const oldSch = oldData?.supervision_schedule || [];
             const newSch = newData?.supervision_schedule || [];
             
             const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
             const messages: string[] = [];
             
             days.forEach(d => {
                const beforeSupRaw = oldSch.find((s: any) => s.day === d)?.supervision;
                const afterSupRaw = newSch.find((s: any) => s.day === d)?.supervision;
                
                const beforeSup = normalize(beforeSupRaw);
                const afterSup = normalize(afterSupRaw);

                if ((beforeSup === 'keine betreuung' || beforeSup === '') && (afterSup === 'kurzgruppe' || afterSup === 'langgruppe')) {
                   messages.push(`${d}: Betreuung: ${beforeSupRaw || 'keine Betreuung'} → ${afterSupRaw}`);
                   level = 'success';
                }

                const beforeLunchRaw = oldSch.find((s: any) => s.day === d)?.lunch;
                const afterLunchRaw = newSch.find((s: any) => s.day === d)?.lunch;
                const a = normalize(beforeLunchRaw);
                const b = normalize(afterLunchRaw);

                if ((a === 'essen' && b === 'kein essen') || (a === 'kein essen' && b === 'essen')) {
                   messages.push(`${d}: Lunch: ${beforeLunchRaw} → ${afterLunchRaw}`);
                }
             });
             
             if (messages.length > 0) {
                message = messages.join('; ');
             } else {
               return null;
             }
          }
        } catch (e) {
           return null;
        }

        if (!message) return null;

        return {
          id: log.id,
          time,
          actor,
          message,
          level
        };
      }).filter(Boolean) as LogEntry[];

      setLogs(formattedLogs);
      
    } catch (err) {
      console.error("Logs fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusStyle = (level: string) => {
    switch (level) {
      case 'success': return { color: '#4CAF50', icon: 'checkmark-circle' };
      case 'warning': return { color: '#FF9800', icon: 'alert-circle' };
      case 'error': return { color: '#F44336', icon: 'close-circle' };
      default: return { color: '#007AFF', icon: 'information-circle' };
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="defaultSemiBold">Aktuelle Änderungen</ThemedText>
        <View style={styles.liveIndicator}>
           <View style={styles.dot} />
           <Text style={styles.liveText}>Live</Text>
        </View>
      </View>
      
      <View style={styles.scrollContainer}>
        {loading && logs.length === 0 ? (
           <ActivityIndicator style={{ marginTop: 20 }} />
        ) : (
           <View style={{ flex: 1, overflow: 'hidden' }}>
             {logs.length === 0 ? (
               <Text style={styles.emptyText}>Keine Aktivitäten in den letzten 30 Tagen.</Text>
             ) : (
               <Animated.View 
                  style={[styles.scrollContent, animatedStyle]}
                  onLayout={(e) => setContentHeight(e.nativeEvent.layout.height)}
               >
                 {logs.map((log: any) => {
                   const style = getStatusStyle(log.level);
                   return (
                     <View key={log.id} style={styles.logItem}>
                        <View style={styles.cardHeader}>
                           <Ionicons name={style.icon as any} size={16} color={style.color} />
                           <Text style={styles.timeText}>{log.time}</Text>
                           <View style={styles.actorBadge}>
                              <Ionicons name="person-outline" size={10} color="#007AFF" style={{ marginRight: 2 }}/>
                              <Text style={styles.actorText} numberOfLines={1}>{log.actor}</Text>
                           </View>
                        </View>
                        <Text style={styles.messageText}>{log.message}</Text>
                     </View>
                   );
                 })}
                 {/* Extra padding at bottom to allow full scroll out if needed */}
                 <View style={{ height: 200 }} /> 
               </Animated.View>
             )}
           </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    height: 400,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
    backgroundColor: '#FAFAFA',
    zIndex: 10, // Ensure header is on top
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F44336',
  },
  liveText: {
    fontSize: 10,
    color: '#F44336',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: '#fff',
    overflow: 'hidden', // Mask content
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 20,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 20,
    fontSize: 13,
  },
  logItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    // Shadow for card effect
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 8,
  },
  timeText: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '500',
  },
  actorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: 140,
  },
  actorText: {
    fontSize: 10,
    color: '#007AFF',
    fontWeight: '600',
  },
  messageText: {
    fontSize: 13,
    color: '#1F2937',
    lineHeight: 18,
  },
});
