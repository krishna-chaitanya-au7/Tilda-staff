import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View, Text, TouchableOpacity, Linking } from 'react-native';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { ThemedText } from '@/components/themed-text';

interface ChildMandate {
  id: string;
  created_at: string;
  child_id: string;
  facility_id: string;
  begin: string;
  expires: string;
  is_current: boolean;
  document_url: string | null;
  billing_account: string | null; // ID of billing account
}

interface BillingAccount {
  id: string;
  account_holder_name: string;
  iban: string;
  bank_name?: string;
}

interface ChildMandateTabProps {
  childId: string;
  facilityId?: string;
}

export default function ChildMandateTab({ childId, facilityId }: ChildMandateTabProps) {
  const [mandates, setMandates] = useState<ChildMandate[]>([]);
  const [billingAccounts, setBillingAccounts] = useState<Map<string, BillingAccount>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!childId) return;
      setLoading(true);
      try {
        // 1. Fetch Mandates
        let query = supabase
          .from('child_mandates')
          .select('*')
          .eq('child_id', childId)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false });

        if (facilityId) {
           query = query.eq('facility_id', facilityId);
        }

        const { data: mandatesData, error } = await query;
        if (error) throw error;

        const mandatesList = mandatesData || [];
        setMandates(mandatesList);

        // 2. Fetch Billing Accounts if any mandates exist
        const billingIds = mandatesList
           .map(m => m.billing_account)
           .filter(Boolean) as string[];
        
        if (billingIds.length > 0) {
           const { data: baData } = await supabase
              .from('billing_account')
              .select('id, account_holder_name, iban, bank_name')
              .in('id', billingIds);
           
           const baMap = new Map<string, BillingAccount>();
           baData?.forEach((ba: any) => baMap.set(ba.id, ba));
           setBillingAccounts(baMap);
        }

      } catch (err) {
        console.error('Error fetching mandates:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [childId, facilityId]);

  const openDocument = (url: string) => {
     Linking.openURL(url).catch(err => console.error("Couldn't load page", err));
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <ThemedText style={{marginTop: 8}}>Loading mandates...</ThemedText>
      </View>
    );
  }

  if (mandates.length === 0) {
    return (
      <View style={styles.center}>
        <ThemedText style={styles.emptyText}>Kein Mandat vorhanden</ThemedText>
      </View>
    );
  }

  const renderItem = ({ item }: { item: ChildMandate }) => {
    const ba = item.billing_account ? billingAccounts.get(item.billing_account) : null;
    const isActive = new Date(item.expires) >= new Date();

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
           <View>
              <Text style={styles.dateRange}>
                 {format(parseISO(item.begin), 'dd.MM.yyyy', { locale: de })} - {format(parseISO(item.expires), 'dd.MM.yyyy', { locale: de })}
              </Text>
              <View style={[styles.badge, isActive ? styles.badgeActive : styles.badgeExpired]}>
                 <Text style={[styles.badgeText, isActive ? styles.badgeTextActive : styles.badgeTextExpired]}>
                    {isActive ? 'Active' : 'Expired'}
                 </Text>
              </View>
           </View>
           {item.document_url && (
              <TouchableOpacity onPress={() => openDocument(item.document_url!)} style={styles.iconBtn}>
                 <Ionicons name="document-text-outline" size={20} color="#007AFF" />
              </TouchableOpacity>
           )}
        </View>

        <View style={styles.cardBody}>
           <View style={styles.row}>
              <Text style={styles.label}>Billing Account:</Text>
              <Text style={styles.value} numberOfLines={1}>
                 {ba ? `${ba.account_holder_name} (${ba.iban})` : 'Unknown'}
              </Text>
           </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={mandates}
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
  },
  center: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
  },
  list: {
    padding: 16,
    gap: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  dateRange: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  badgeActive: {
    backgroundColor: '#ECFDF5',
  },
  badgeExpired: {
    backgroundColor: '#F3F4F6',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  badgeTextActive: {
    color: '#059669',
  },
  badgeTextExpired: {
    color: '#6B7280',
  },
  iconBtn: {
    padding: 8,
    backgroundColor: '#F0F9FF',
    borderRadius: 20,
  },
  cardBody: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 12,
    color: '#6B7280',
    width: 90,
  },
  value: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
    flex: 1,
  },
});




