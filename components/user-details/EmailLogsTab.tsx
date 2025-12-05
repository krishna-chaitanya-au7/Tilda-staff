import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { format, parseISO } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';

interface EmailLog {
  id: string;
  created_at: string;
  to_address: string[];
  subject: string;
  status: string;
  type: string;
  error_message?: string | null;
  resend_count?: number;
  last_resent_at?: string | null;
}

interface EmailLogsTabProps {
  userIds: string[];
}

export default function EmailLogsTab({ userIds }: EmailLogsTabProps) {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userIds || userIds.length === 0) {
      setLoading(false);
      return;
    }

    const fetchLogs = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('email_logs')
          .select('*')
          .in('user_id', userIds)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setLogs(data || []);
      } catch (error) {
        console.error('Error fetching email logs:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [userIds]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (logs.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Keine E-Mails vorhanden</Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: EmailLog }) => {
    const isFailed = item.status.includes('failed');
    const isSent = item.status.includes('sent') || item.status.includes('resent');

    return (
      <View style={styles.row}>
        <View style={styles.iconCol}>
           <View style={styles.iconCircle}>
              {isFailed ? (
                 <Ionicons name="alert-circle-outline" size={18} color="#DC2626" />
              ) : (
                 <Ionicons name="mail-outline" size={18} color="#6B7280" />
              )}
           </View>
           <View style={styles.line} />
        </View>

        <View style={styles.contentCol}>
           <View style={styles.header}>
              <Text style={styles.subject}>{item.subject}</Text>
              <Text style={styles.date}>{format(parseISO(item.created_at), 'dd.MM.yyyy, HH:mm a', { locale: enUS })}</Text>
           </View>
           <Text style={styles.toAddress}>To: {item.to_address.join(', ')}</Text>
           
           <View style={styles.badges}>
              <View style={[styles.badge, isFailed ? styles.badgeRed : (isSent ? styles.badgeGreen : styles.badgeBlue)]}>
                 <Text style={[styles.badgeText, isFailed ? styles.textRed : (isSent ? styles.textGreen : styles.textBlue)]}>
                    {item.status}
                 </Text>
              </View>
              <View style={styles.badgeGray}>
                 <Text style={styles.textGray}>{item.type}</Text>
              </View>
              {item.resend_count ? (
                 <View style={styles.badgeGray}>
                    <Text style={styles.textGray}>Resent {item.resend_count} time(s)</Text>
                 </View>
              ) : null}
           </View>

           {item.error_message && (
              <View style={styles.errorBox}>
                 <Text style={styles.errorText}>Error: {item.error_message}</Text>
              </View>
           )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={logs}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
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
  center: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#6B7280',
  },
  list: {
    paddingBottom: 20,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 0,
  },
  iconCol: {
    width: 40,
    alignItems: 'center',
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  line: {
    width: 1,
    flex: 1,
    backgroundColor: '#E5E7EB',
    marginTop: -10,
    marginBottom: 10,
  },
  contentCol: {
    flex: 1,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  subject: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  date: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  toAddress: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  badgeGray: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  badgeRed: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  badgeGreen: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  badgeBlue: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  textRed: { fontSize: 10, fontWeight: '600', color: '#991B1B' },
  textGreen: { fontSize: 10, fontWeight: '600', color: '#166534' },
  textBlue: { fontSize: 10, fontWeight: '600', color: '#1E40AF' },
  textGray: { fontSize: 10, fontWeight: '600', color: '#374151' },
  errorBox: {
    backgroundColor: '#FEF2F2',
    padding: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
  },
});




