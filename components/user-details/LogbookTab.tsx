import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { format, parseISO } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { ThemedText } from '@/components/themed-text';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';

interface LogEntry {
  id: string;
  changed_at: string;
  action: string;
  old_data: any;
  new_data: any;
  change_message: string;
  changed_by: string;
  users?: {
    first_name: string;
    family_name: string;
  };
}

interface LogbookTabProps {
  userId: string;
  academicYearId: string;
}

interface ChangeItem {
  key: string;
  oldVal: any;
  newVal: any;
}

export default function LogbookTab({ userId, academicYearId }: LogbookTabProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchLogs = async () => {
      if (!userId) return;
      setLoading(true);
      try {
        // 1. Fetch logs from 'audit_log'
        const { data: logsData, error } = await supabase
          .from('audit_log')
          .select('id, changed_at, action, old_data, new_data, change_message, changed_by, user_id')
          .eq('record_id', userId)
          .order('changed_at', { ascending: false });

        if (error) throw error;

        if (!logsData || logsData.length === 0) {
           setLogs([]);
           return;
        }

        // 2. Fetch Users (user_id)
        const userIds = Array.from(new Set(logsData.map((l: any) => l.user_id).filter(Boolean)));
        const userMap = new Map();
        
        if (userIds.length > 0) {
           const { data: users } = await supabase
             .from('users')
             .select('id, first_name, family_name')
             .in('id', userIds);
           
           users?.forEach((u: any) => userMap.set(u.id, u));
        }

        // 3. Map Data
        const enrichedLogs: LogEntry[] = logsData.map((log: any) => ({
           id: String(log.id),
           changed_at: log.changed_at,
           action: log.action,
           old_data: log.old_data,
           new_data: log.new_data,
           change_message: log.change_message,
           changed_by: log.changed_by,
           users: log.user_id ? userMap.get(log.user_id) : undefined
        }));

        setLogs(enrichedLogs);
      } catch (error) {
        console.error('Error fetching logbook:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [userId]);

  const toggleExpanded = (logId: string) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId);
    } else {
      newExpanded.add(logId);
    }
    setExpandedLogs(newExpanded);
  };

  const formatFieldName = (fieldName: string) => {
    return fieldName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const formatValue = (val: any): string => {
    if (val === null || val === undefined) return 'null';
    if (Array.isArray(val)) {
        if (val.every(item => typeof item === 'string')) {
            return val.join(', ');
        }
        return JSON.stringify(val, null, 2);
    }
    if (typeof val === 'object') return JSON.stringify(val, null, 2);
    
    // Date check
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
       try {
          return format(parseISO(val), 'yyyy-MM-dd');
       } catch (e) {
          return val;
       }
    }
    
    return String(val);
  };

  const getChanges = (oldData: any, newData: any, action: string): ChangeItem[] => {
    // Web app logic: empty changes for insert/create implies no diff comparison needed
    if (action === 'INSERT' || action === 'CREATE') return [];

    const ignoredKeys = [
      'updated_at', 'signature_data', 'terms_conditions', 'signature_metadata'
    ];
    
    const changes: ChangeItem[] = [];

    if (oldData && newData) {
        const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
        allKeys.forEach(key => {
            if (ignoredKeys.includes(key)) return;
            
            const oldVal = oldData[key];
            const newVal = newData[key];
            
            if (oldVal === newVal) return;
            
            // Skip empty array/null comparisons matching web app
             if (
                Array.isArray(oldVal) &&
                Array.isArray(newVal) &&
                oldVal.length === 0 &&
                newVal.length === 0
            ) return;

            if (
                (oldVal === null || oldVal === undefined) &&
                (newVal === null || newVal === undefined)
            ) return;

            changes.push({ 
                key, 
                oldVal: formatValue(oldVal), 
                newVal: formatValue(newVal) 
            });
        });
    }

    return changes;
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <ThemedText>Loading logbook...</ThemedText>
      </View>
    );
  }

  if (logs.length === 0) {
    return (
      <View style={styles.center}>
        <ThemedText style={styles.emptyText}>Keine Einträge im Logbuch</ThemedText>
      </View>
    );
  }

  const renderItem = ({ item }: { item: LogEntry }) => {
    const actor = item.changed_by || (item.users ? `${item.users.first_name} ${item.users.family_name}` : 'System');
    const changes = getChanges(item.old_data, item.new_data, item.action);
    const hasChanges = changes.length > 0;
    const isExpanded = expandedLogs.has(item.id);
    
    return (
      <View style={styles.row}>
         {/* Main Card Content */}
         <View style={styles.cardContainer}>
            {/* Header Row */}
            <View style={styles.cardHeader}>
                <View style={styles.headerLeft}>
                    <View style={styles.iconWrapper}>
                        <Ionicons 
                            name={item.action === 'UPDATE' ? 'pencil-outline' : 'document-text-outline'} 
                            size={16} 
                            color="#3B82F6" 
                        />
                    </View>
                    <View style={[styles.badge, item.action === 'UPDATE' ? styles.badgeBlue : styles.badgeGreen]}>
                        <Text style={[styles.badgeText, item.action === 'UPDATE' ? styles.badgeTextBlue : styles.badgeTextGreen]}>
                            {item.action}
                        </Text>
                    </View>
                </View>
                
                <View style={styles.headerRight}>
                    <View style={styles.actorRow}>
                        <Ionicons name="person-outline" size={14} color="#666" />
                        <Text style={styles.actorName}>{actor}</Text>
                    </View>
                    <View style={styles.timeRow}>
                        <Ionicons name="time-outline" size={14} color="#666" />
                        <Text style={styles.timeText}>
                            {format(parseISO(item.changed_at), 'MMM dd, yyyy, hh:mm:ss a', { locale: enUS })}
                        </Text>
                    </View>
                    {hasChanges && (
                      <TouchableOpacity onPress={() => toggleExpanded(item.id)} style={styles.expandButton}>
                          <Text style={styles.expandButtonText}>Details</Text>
                          <Ionicons name={isExpanded ? "chevron-down" : "chevron-forward"} size={14} color="#2563EB" />
                      </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Content Body */}
            <View style={styles.cardBody}>
                {!hasChanges && (
                   <Text style={styles.descriptionText}>
                       {item.change_message || `${actor} ${item.action.toLowerCase()}d the record.`}
                   </Text>
                )}

                {hasChanges && (
                    <View style={styles.changesSection}>
                        {isExpanded ? (
                           <>
                             <Text style={styles.changesTitle}>Changes Made:</Text>
                             <View style={styles.changesList}>
                                {changes.map((change, index) => (
                                    <View key={index} style={styles.changeItem}>
                                        <View style={styles.changeKeyContainer}>
                                            <View style={styles.blueBar} />
                                            <Text style={styles.changeKey}>{formatFieldName(change.key)}</Text>
                                        </View>
                                        <View style={styles.diffRow}>
                                            {change.oldVal !== 'null' && (
                                                <>
                                                    <View style={styles.oldValueContainer}>
                                                        <Text style={styles.oldValueText}>{change.oldVal}</Text>
                                                    </View>
                                                    <Ionicons name="arrow-forward" size={16} color="#666" style={styles.arrow} />
                                                </>
                                            )}
                                            <View style={styles.newValueContainer}>
                                                <Text style={styles.newValueText}>{change.newVal}</Text>
                                            </View>
                                        </View>
                                    </View>
                                ))}
                             </View>
                           </>
                        ) : (
                           <Text style={styles.summaryText}>
                              {changes.length} field{changes.length !== 1 ? 's' : ''} changed 
                              <Text style={styles.summaryFields}>
                                 {' (' + changes.map(c => formatFieldName(c.key)).join(', ') + ')'}
                              </Text>
                           </Text>
                        )}
                    </View>
                )}
            </View>
         </View>

         {/* Timeline Column (Right side as per screenshot) */}
         <View style={styles.timelineCol}>
            <View style={styles.timelineDot} />
            <View style={styles.timelineLine} />
         </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.pageHeader}>
         <Text style={styles.pageTitle}>Track all changes and activities for this user</Text>
      </View>
      <FlatList
        data={logs}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
  },
  pageHeader: {
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 16,
    color: '#666',
    fontWeight: '400',
  },
  center: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#666',
  },
  list: {
    paddingBottom: 40,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  cardContainer: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    marginRight: 16,
    overflow: 'hidden',
  },
  timelineCol: {
    width: 20,
    alignItems: 'center',
    paddingTop: 15,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#3B82F6',
    zIndex: 2,
    marginBottom: -2,
  },
  timelineLine: {
    flex: 1,
    width: 1,
    backgroundColor: '#E5E7EB',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#FAFAFA',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrapper: {
    marginRight: 4,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeBlue: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  badgeGreen: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  badgeTextBlue: {
    color: '#1D4ED8',
  },
  badgeTextGreen: {
    color: '#15803D',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  actorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actorName: {
    fontSize: 12,
    color: '#4B5563',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    fontSize: 12,
    color: '#6B7280',
  },
  cardBody: {
    padding: 16,
  },
  descriptionText: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 16,
  },
  changesSection: {
    marginTop: 8,
  },
  changesTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 12,
  },
  changesList: {
    gap: 12,
  },
  changeItem: {
    gap: 8,
  },
  changeKeyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  blueBar: {
    width: 3,
    height: 14,
    backgroundColor: '#3B82F6',
    borderRadius: 1,
  },
  changeKey: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  diffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingLeft: 12,
  },
  oldValueContainer: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  oldValueText: {
    fontSize: 13,
    color: '#991B1B',
  },
  arrow: {
    marginHorizontal: 4,
  },
  newValueContainer: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  newValueText: {
    fontSize: 13,
    color: '#166534',
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  expandButtonText: {
    fontSize: 12,
    color: '#2563EB',
    fontWeight: '500',
  },
  summaryText: {
    fontSize: 13,
    color: '#4B5563',
  },
  summaryFields: {
    color: '#6B7280',
    fontStyle: 'italic',
  },
});
