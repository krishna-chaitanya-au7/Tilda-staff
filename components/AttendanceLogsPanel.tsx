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

// Helper: supervision eligible child – has Kurzgruppe or Langgruppe for at least one day
const isSupervisionEligible = (schedule: any[]) =>
  Array.isArray(schedule) &&
  schedule.some((s: any) => {
    const sup = normalize(s?.supervision);
    return sup === "kurzgruppe" || sup === "langgruppe";
  });

// Helper: supervision changed from keine Betreuung to Kurz/Lang for any day
const supervisionImproved = (oldSchedule: any[], newSchedule: any[]) => {
  if (!Array.isArray(oldSchedule) || !Array.isArray(newSchedule)) return false;
  const byDay = (arr: any[]) => Object.fromEntries(arr.map((d) => [d.day, d]));
  const o = byDay(oldSchedule);
  const n = byDay(newSchedule);
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  return days.some((d) => {
    const before = normalize(o[d]?.supervision);
    const after = normalize(n[d]?.supervision);
    return (
      (before === "keine betreuung" || before === "") &&
      (after === "kurzgruppe" || after === "langgruppe")
    );
  });
};

// Helper: lunch toggled Essen <-> kein Essen
const lunchToggled = (oldSchedule: any[], newSchedule: any[]) => {
  if (!Array.isArray(oldSchedule) || !Array.isArray(newSchedule)) return false;
  const byDay = (arr: any[]) => Object.fromEntries(arr.map((d) => [d.day, d]));
  const o = byDay(oldSchedule);
  const n = byDay(newSchedule);
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  return days.some((d) => {
    const a = normalize(o[d]?.lunch);
    const b = normalize(n[d]?.lunch);
    return (
      (a === "essen" && b === "kein essen") ||
      (a === "kein essen" && b === "essen")
    );
  });
};

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
      const distance = contentHeight - containerHeight; 
      // Scroll until the bottom of content hits bottom of container, then reset
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
      setLogs([]); // Optimistic clear
      
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
        .select('id, user_id, supervision_schedule, supervision_groups')
        .in('facility_id', targetFacilities)
        .eq('academic_year', selectedAcademicYearId)
        .eq('is_deleted', false);

      if (childrenErr) throw childrenErr;

      // Eligible children based on current supervision schedule (matching web logic)
      const eligibleChildren = (children || []).filter((c: any) =>
        isSupervisionEligible(c?.supervision_schedule || [])
      );

      const recordIds = eligibleChildren.map((c: any) => c.id);
      const allChildUserIds = (children || []).map((c: any) => c.user_id).filter(Boolean);

      if (recordIds.length === 0 && allChildUserIds.length === 0) {
        setLogs([]);
        setLoading(false);
        return;
      }

      // 3. Fetch Audit Logs
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - 30); // Last 30 days
      const sinceIso = sinceDate.toISOString();

      // We fetch in batches if needed, but for simplicity here assuming 
      // list isn't massive, or using Promise.all for reasonable chunks.
      // In RN, we might want to be careful with URL length.
      // Let's stick to a simpler fetch but split by table to avoid huge OR queries if possible.
      
      const [childrenLogs, leaveLogs] = await Promise.all([
        supabase
          .from('audit_log')
          .select('id, table_name, record_id, action, old_data, new_data, change_message, changed_at, user_id')
          .eq('table_name', 'children_info')
          .eq('action', 'UPDATE') // Web only checks UPDATE for children_info
          .in('record_id', recordIds)
          .gte('changed_at', sinceIso)
          .order('changed_at', { ascending: false })
          .limit(100),
        supabase
          .from('audit_log')
          .select('id, table_name, record_id, action, old_data, new_data, change_message, changed_at, user_id')
          .eq('table_name', 'child_leaves')
          .in('user_id', allChildUserIds)
          .gte('changed_at', sinceIso)
          .order('changed_at', { ascending: false })
          .limit(100)
      ]);

      let rawLogs = [...(childrenLogs.data || []), ...(leaveLogs.data || [])];
      
      // Parse JSON fields safely
      const parsedLogs = rawLogs.map(row => {
        try {
           const oldData = typeof row.old_data === 'string' ? JSON.parse(row.old_data) : (row.old_data || {});
           const newData = typeof row.new_data === 'string' ? JSON.parse(row.new_data) : (row.new_data || {});
           return { ...row, old_data: oldData, new_data: newData };
        } catch (e) {
           return null;
        }
      }).filter(Boolean);

      // Filter interesting logs (matching web logic)
      let filteredLogs = parsedLogs.filter((row: any) => {
         if (row.table_name === 'child_leaves') return true; // Always include leaves
         
         const oldSch = row.old_data?.supervision_schedule || [];
         const newSch = row.new_data?.supervision_schedule || [];
         
         // Check if child is eligible in NEW data
         if (!isSupervisionEligible(newSch)) return false;
         
         const supChange = supervisionImproved(oldSch, newSch);
         const foodChange = lunchToggled(oldSch, newSch);
         return supChange || foodChange;
      });
      
      // Sort by date desc
      filteredLogs.sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime());
      filteredLogs = filteredLogs.slice(0, 100); // Limit display

      // 4. Fetch Actors
      const actorIds = Array.from(new Set(filteredLogs.map((l: any) => l.user_id).filter(Boolean)));
      let actorMap = new Map();
      
      if (actorIds.length > 0) {
        const { data: actors } = await supabase
          .from('users')
          .select('id, first_name, family_name')
          .in('id', actorIds);
        
        actors?.forEach((a: any) => {
          const name = `${a.first_name || ''} ${a.family_name || ''}`.trim();
          actorMap.set(a.id, name || 'Unknown');
        });
      }

      // 5. Format Logs
      const formattedLogs: LogEntry[] = filteredLogs.map((log: any) => {
        const time = format(parseISO(log.changed_at), 'dd.MM HH:mm');
        const actor = actorMap.get(log.user_id) || 'System';
        
        let message = '';
        let level: LogEntry['level'] = 'info';

        if (log.table_name === 'child_leaves') {
             const oldLeave = log.old_data || {};
             const newLeave = log.new_data || {};

             if (log.action === 'INSERT') {
                const type = newLeave.leave_type || 'leave';
                const status = newLeave.status || 'pending';
                const leaveDate = newLeave.date || newLeave.date_from || '';
                
                const formatTime = (iso: string | null) => iso ? format(parseISO(iso), 'HH:mm') : null;
                const from = formatTime(newLeave.hourly_from);
                const to = formatTime(newLeave.hourly_to);
                const timePart = from && to ? ` (${from}-${to})` : '';
                
                message = `Leave: ${type} on ${leaveDate}${timePart}. Status: ${status}`;
                level = 'info';
             } else {
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
                
                if (changes.length > 0) {
                   message = changes.join('; ');
                   level = 'info';
                } else {
                   message = 'Leave updated';
                }
             }
        } else if (log.table_name === 'children_info') {
             const oldSch = log.old_data?.supervision_schedule || [];
             const newSch = log.new_data?.supervision_schedule || [];
             
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
                   level = 'info';
                }
             });
             
             if (messages.length > 0) {
                message = messages.join('; ');
             } else {
               // Strictly filter out if no detailed messages are generated, 
               // avoiding raw change_message fallback.
               return null;
             }
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
      
      // If empty, try fallback (similar to web fallback logic - try to show something if it passed scope)
      if (formattedLogs.length === 0 && filteredLogs.length > 0) {
         // Simplified fallback: just show generic update if we have items but formatting failed to produce message
         // This prevents "empty" if there are indeed changes.
         // But for now let's trust the formatting logic which closely mirrors web.
      }

      setLogs(formattedLogs);
      
    } catch (err) {
      console.error("Logs fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusStyle = (level: string) => {
    switch (level) {
      case 'success': return { color: '#10B981', icon: 'checkmark-circle' }; // emerald-500
      case 'warning': return { color: '#F59E0B', icon: 'alert-circle' }; // amber-500
      case 'error': return { color: '#F43F5E', icon: 'close-circle' }; // rose-500
      default: return { color: '#0EA5E9', icon: 'information-circle' }; // sky-500
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
          <Ionicons name="information-circle" size={16} color="#27272A" />
          <ThemedText type="defaultSemiBold" style={{fontSize: 14, color: '#27272A'}}>Aktuelle Änderungen</ThemedText>
        </View>
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
               <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20}}>
                 <Text style={styles.emptyText}>Keine aktuellen Änderungen für die ausgewählten Filter</Text>
               </View>
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
                           <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                             <Ionicons name={style.icon as any} size={16} color={style.color} />
                             <View style={styles.timeBadge}>
                                <Text style={styles.timeText}>{log.time}</Text>
                             </View>
                             <View style={styles.actorBadge}>
                                <Ionicons name="person" size={10} color="#0369A1" style={{ marginRight: 4 }}/>
                                <Text style={styles.actorText} numberOfLines={1}>{log.actor}</Text>
                             </View>
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
    backgroundColor: 'rgba(255,255,255,0.8)', // bg-white/80
    borderRadius: 24, // rounded-3xl
    borderWidth: 1,
    borderColor: 'rgba(228,228,231,0.7)', // border-zinc-200/70
    height: 450, // ~28rem
    overflow: 'hidden',
    // Shadow similar to shadow-[0_6px_30px_-12px_rgb(0_0_0/0.25)]
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(244,244,245,0.8)', // border-zinc-100/80
    // gradient bg approximation
    backgroundColor: '#FAFAFA', 
    zIndex: 10,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(209,250,229,0.6)', // emerald-100/60
    borderColor: 'rgba(110,231,183,0.6)', // emerald-300/60
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999, // full
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981', // emerald-500
  },
  liveText: {
    fontSize: 10,
    color: '#065F46', // emerald-800 (darker text for contrast)
    fontWeight: '600',
  },
  scrollContainer: {
    flex: 1,
    // mask image not fully supported in RN without libs, using overflow hidden
    overflow: 'hidden', 
  },
  scrollContent: {
    paddingVertical: 4,
  },
  emptyText: {
    textAlign: 'center',
    color: '#71717A', // zinc-500
    fontSize: 13,
  },
  logItem: {
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 16, // rounded-2xl
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(228,228,231,0.7)', // border-zinc-200/70
    // Shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    marginBottom: 6,
  },
  timeBadge: {
    backgroundColor: '#F4F4F5', // zinc-100
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  timeText: {
    fontSize: 10,
    color: '#52525B', // zinc-600
    fontFamily: 'System', 
    fontWeight: '500',
  },
  actorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(224,242,254,0.7)', // sky-100/70
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    maxWidth: 140,
  },
  actorText: {
    fontSize: 10,
    color: '#0369A1', // sky-700
    fontWeight: '600',
  },
  messageText: {
    fontSize: 14,
    color: '#27272A', // zinc-800
    lineHeight: 20,
    fontWeight: '500',
  },
});
