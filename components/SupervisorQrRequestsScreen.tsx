import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, ActivityIndicator, Alert, useWindowDimensions, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import QRCode from 'react-native-qrcode-svg';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/theme';

// Types based on standard QR schema
interface QRRequest {
  id: string;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected' | 'scanned';
  qr_code: string; // The code string
  child_id: string;
  children_info?: {
    user_id: string;
    users?: {
      first_name: string;
      family_name: string;
    };
  };
  requested_by: string;
  users?: {
    first_name: string;
    family_name: string;
  };
  type: string; // 'pickup', 'auth', etc.
}

export default function SupervisorQrRequestsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isLargeScreen = width > 768;

  const [requests, setRequests] = useState<QRRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<QRRequest | null>(null);
  const [isDetailVisible, setIsDetailVisible] = useState(false);

  useEffect(() => {
    fetchRequests();
    
    const sub = supabase
      .channel('qr_requests_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qr_requests' }, () => {
        fetchRequests();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('qr_requests')
        .select(`
          *,
          children_info:child_id (
            user_id,
            users ( first_name, family_name )
          ),
          users:requested_by ( first_name, family_name )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (err) {
      console.error('Error fetching QR requests:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (id: string, status: 'approved' | 'rejected') => {
    try {
      const { error } = await supabase
        .from('qr_requests')
        .update({ status })
        .eq('id', id);

      if (error) throw error;
      
      if (selectedRequest?.id === id) {
        setIsDetailVisible(false);
        setSelectedRequest(null);
      }
      fetchRequests();
    } catch (err) {
      Alert.alert("Error", "Failed to update status");
    }
  };

  const renderItem = ({ item }: { item: QRRequest }) => (
    <TouchableOpacity 
      style={styles.card}
      onPress={() => {
        setSelectedRequest(item);
        setIsDetailVisible(true);
      }}
    >
      <View style={styles.cardHeader}>
        <View style={styles.row}>
          <Ionicons name="qr-code-outline" size={24} color="#333" />
          <View style={{ marginLeft: 12 }}>
             <ThemedText style={styles.cardTitle}>
               {item.children_info?.users?.first_name} {item.children_info?.users?.family_name}
             </ThemedText>
             <ThemedText style={styles.cardSubtitle}>
               Requested by: {item.users?.first_name} {item.users?.family_name}
             </ThemedText>
          </View>
        </View>
        <View style={[styles.badge, getStatusStyle(item.status)]}>
           <Text style={styles.badgeText}>{item.status}</Text>
        </View>
      </View>
      <View style={styles.cardFooter}>
         <Text style={styles.timeText}>
           {formatDistanceToNow(parseISO(item.created_at), { addSuffix: true, locale: de })}
         </Text>
      </View>
    </TouchableOpacity>
  );

  const getStatusStyle = (status: string) => {
    switch(status) {
      case 'approved': return { backgroundColor: '#E8F5E9', borderColor: '#4CAF50' };
      case 'rejected': return { backgroundColor: '#FFEBEE', borderColor: '#F44336' };
      case 'scanned': return { backgroundColor: '#E3F2FD', borderColor: '#2196F3' };
      default: return { backgroundColor: '#FFF3E0', borderColor: '#FF9800' };
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="subtitle">QR Requests</ThemedText>
        <TouchableOpacity onPress={fetchRequests}>
          <Ionicons name="refresh" size={20} color="#333" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={renderItem}
          ListEmptyComponent={<Text style={styles.emptyText}>No pending requests.</Text>}
        />
      )}

      {/* Detail Modal */}
      <Modal visible={isDetailVisible} transparent animationType="slide" onRequestClose={() => setIsDetailVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <ThemedText type="subtitle">Request Details</ThemedText>
              <TouchableOpacity onPress={() => setIsDetailVisible(false)}>
                <Ionicons name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>
            
            {selectedRequest && (
              <ScrollView style={styles.modalBody}>
                 <View style={styles.qrContainer}>
                    <QRCode value={selectedRequest.qr_code} size={200} />
                    <Text style={styles.codeText}>{selectedRequest.qr_code}</Text>
                 </View>

                 <View style={styles.infoSection}>
                    <Text style={styles.label}>Child:</Text>
                    <Text style={styles.value}>{selectedRequest.children_info?.users?.first_name} {selectedRequest.children_info?.users?.family_name}</Text>
                    
                    <Text style={styles.label}>Requester:</Text>
                    <Text style={styles.value}>{selectedRequest.users?.first_name} {selectedRequest.users?.family_name}</Text>
                    
                    <Text style={styles.label}>Type:</Text>
                    <Text style={styles.value}>{selectedRequest.type}</Text>
                    
                    <Text style={styles.label}>Status:</Text>
                    <Text style={[styles.value, { textTransform: 'capitalize' }]}>{selectedRequest.status}</Text>
                 </View>

                 {selectedRequest.status === 'pending' && (
                   <View style={styles.actions}>
                      <TouchableOpacity 
                        style={[styles.actionButton, { backgroundColor: '#FFEBEE' }]} 
                        onPress={() => handleStatusUpdate(selectedRequest.id, 'rejected')}
                      >
                         <Text style={{ color: '#D32F2F', fontWeight: '600' }}>Reject</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.actionButton, { backgroundColor: '#E8F5E9' }]}
                        onPress={() => handleStatusUpdate(selectedRequest.id, 'approved')}
                      >
                         <Text style={{ color: '#2E7D32', fontWeight: '600' }}>Approve</Text>
                      </TouchableOpacity>
                   </View>
                 )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    padding: 16,
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  list: {
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  cardFooter: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  timeText: {
    fontSize: 11,
    color: '#999',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#999',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#fff',
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalBody: {
    padding: 20,
  },
  qrContainer: {
    alignItems: 'center',
    marginBottom: 24,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  codeText: {
    marginTop: 12,
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#666',
  },
  infoSection: {
    gap: 12,
  },
  label: {
    fontSize: 12,
    color: '#999',
    marginBottom: 2,
  },
  value: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 24,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

