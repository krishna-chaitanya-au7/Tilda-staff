import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View, ActivityIndicator, Text, useWindowDimensions, Modal, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

// Tabs
import MahlzeitenTab from '@/components/user-details/MahlzeitenTab';
import SickLeaveList from '@/components/user-details/SickLeaveList';
import LogbookTab from '@/components/user-details/LogbookTab';
import StundenplanTab from '@/components/user-details/StundenplanTab';
import BetreuungsplanTab from '@/components/user-details/BetreuungsplanTab';
import EmailLogsTab from '@/components/user-details/EmailLogsTab';
import ChildMandateTab from '@/components/user-details/ChildMandateTab';

interface UserDetails {
  id: string;
  first_name: string;
  family_name: string;
  email?: string;
  phone?: string;
  dob?: string;
  user_type?: 'child' | 'parent' | 'guardian';
  address?: {
    street?: string;
    house_number?: string;
    zip_code?: string;
    city?: string;
    street_number?: string;
    zip?: string;
  };
  billing_account?: {
    bank_name?: string;
    iban?: string;
    bic?: string;
  };
  children?: {
    id: string;
    first_name: string;
    family_name: string;
    email?: string;
  }[];
  children_info?: {
    allergies?: string[];
    pickup_options?: any;
    care_level?: string;
    lunch_status?: string;
    is_bus_child?: boolean;
    notes?: string;
    class?: string;
    religion?: string;
    facility_id?: string;
    street?: string;
    street_number?: string;
    zip?: string;
    city?: string;
    bus_stop?: string;
    custom_religion?: string;
  }[];
  manager?: {
    first_name: string;
    family_name: string;
    email: string;
    phone?: string;
    address?: any;
    street?: string;
    street_number?: string;
    zip?: string;
    city?: string;
  };
}

interface Guardian {
  id: string;
  first_name: string;
  family_name: string;
  email?: string;
  phone?: string;
  street?: string;
  street_number?: string;
  zip?: string;
  city?: string;
}

export default function UserDetailsScreen() {
  const { id, facilityId, academicYearId, from } = useLocalSearchParams();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isLandscape = width > 768; 

  const [user, setUser] = useState<UserDetails | null>(null);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [facilityName, setFacilityName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('General');
  const [showTabsMenu, setShowTabsMenu] = useState(false);

  const fetchUserDetails = useCallback(async (isRefresh = false) => {
    try {
      if (!user && !isRefresh) {
        setLoading(true);
      }
      
      // 1. Fetch Basic User Data
      const { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      // 2. Enrich Data based on Type
      if (userData.user_type === 'child') {
          const { data: info } = await supabase
             .from('children_info')
             .select('*')
             .eq('user_id', id);
          userData.children_info = info || [];

          if (userData.manager_id) {
             const { data: managerData } = await supabase
                .from('users')
                .select('id, first_name, family_name, email, phone, street, street_number, zip, city')
                .eq('id', userData.manager_id)
                .single();
             if (managerData) userData.manager = managerData;
          }
      } else if (userData.user_type === 'parent') {
          const { data: billing } = await supabase
             .from('billing_account')
             .select('*')
             .eq('user_id', id)
             .maybeSingle();
          userData.billing_account = billing;

          const { data: kidsByManager } = await supabase
             .from('users')
             .select('id, first_name, family_name, email')
             .eq('manager_id', userData.id);
          
          let allKids = kidsByManager || [];

          if (userData.related_children && userData.related_children.length > 0) {
             const { data: kidsByArray } = await supabase
                .from('users')
                .select('id, first_name, family_name, email')
                .in('id', userData.related_children);
             
             if (kidsByArray) {
                const existingIds = new Set(allKids.map((k: any) => k.id));
                kidsByArray.forEach((k: any) => {
                   if (!existingIds.has(k.id)) {
                      allKids.push(k);
                   }
                });
             }
          }
          
          userData.children = allKids;
      }

      setUser(userData);

      const facId = userData.children_info?.[0]?.facility_id || facilityId;
      if (facId) {
         const { data: fac } = await supabase.from('facilities').select('name').eq('id', facId).single();
         if (fac) setFacilityName(fac.name);
      }

    } catch (err) {
      console.error('Error fetching user details:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, facilityId]);

  const fetchGuardians = useCallback(async () => {
    try {
      const { data: parents, error: parentError } = await supabase
        .from('users')
        .select('id, first_name, family_name, email, phone, street, street_number, zip, city')
        .contains('related_children', [id]);

      if (parentError) throw parentError;
      setGuardians(parents || []);
    } catch (e) {
      console.error('Guardians fetch error:', e);
    }
  }, [id]);

  // Refresh data when screen is focused (e.g. coming back from edit)
  useFocusEffect(
    useCallback(() => {
      if (id) {
        fetchUserDetails(true);
        fetchGuardians();
      } else {
        setLoading(false);
      }
    }, [fetchUserDetails, fetchGuardians, id])
  );
  
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchUserDetails(true);
    fetchGuardians();
  }, [fetchUserDetails, fetchGuardians]);

  const handleBack = () => {
    if (from === 'attendance') {
      router.dismissTo('/supervisor/attendance');
    } else if (from === 'klassen') {
      router.dismissTo('/supervisor/grouping');
    } else {
      router.back();
    }
  };

  const handleEdit = () => {
    router.push({
      pathname: '/user-edit',
      params: { id: id as string }
    });
  };

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
      </ThemedView>
    );
  }

  if (!user) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>User not found</ThemedText>
      </ThemedView>
    );
  }

  const childInfo = user.children_info?.[0];
  
  let tabs = ['General'];
  if (user.user_type === 'parent') {
     tabs = ['General', 'Logs'];
  } else {
     tabs = ['General', 'Mahlzeiten'];
     if (from === 'klassen') {
        tabs.push('BuT');
     }
     tabs.push('Abmeldungen', 'Logbook', 'Stundenplan', 'Betreuungsplan');
  }

  const primaryContact = user.manager || guardians[0];
  
  const getAddress = (u: any) => {
     if (!u) return '-';
     const parts = [
        `${u.street || ''} ${u.street_number || ''}`.trim(),
        `${u.zip || ''} ${u.city || ''}`.trim()
     ].filter(p => p.trim() !== '');
     
     if (parts.length > 0) return parts.join(', ');
     return '-';
  };

  const contactPhone = primaryContact?.phone || '-';
  const contactAddress = getAddress(user);
  const contactEmail = primaryContact?.email || '-';

  const calculateAge = (dob?: string) => {
    if (!dob) return '-';
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age.toString();
  };

  const LeftSidebar = () => {
    if (user.user_type === 'parent') {
       return (
        <View style={styles.leftSidebar}>
           <View style={styles.card}>
              <ThemedText style={styles.cardTitle}>Contact Info</ThemedText>
              
              <View style={styles.infoRow}>
                 <Ionicons name="call-outline" size={18} color="#666" />
                 <View>
                    <ThemedText style={styles.infoLabel}>Phone</ThemedText>
                    <ThemedText style={styles.infoValue}>{user.phone || '-'}</ThemedText>
                 </View>
              </View>

              <View style={styles.infoRow}>
                 <Ionicons name="location-outline" size={18} color="#666" />
                 <View>
                    <ThemedText style={styles.infoLabel}>Address</ThemedText>
                    <ThemedText style={styles.infoValue}>{getAddress(user)}</ThemedText>
                 </View>
              </View>

              <View style={styles.infoRow}>
                 <Ionicons name="mail-outline" size={18} color="#666" />
                 <View>
                    <ThemedText style={styles.infoLabel}>Email</ThemedText>
                    <ThemedText style={styles.infoValue}>{user.email || '-'}</ThemedText>
                 </View>
              </View>
            </View>

           <View style={styles.card}>
              <ThemedText style={styles.cardTitle}>Children</ThemedText>
              {user.children?.map((child: any, idx: number) => (
                 <TouchableOpacity 
                    key={idx} 
                    style={styles.listItem}
                    onPress={() => router.push({
                       pathname: '/user-details',
                       params: {
                          id: child.id,
                          facilityId: facilityId,
                          academicYearId: academicYearId,
                          from: 'user-details'
                       }
                    })}
                 >
                    <View style={styles.avatarSmall}>
                       <Text style={styles.avatarSmallText}>{child.first_name?.[0]}{child.family_name?.[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                       <Text style={styles.listTitle}>{child.first_name} {child.family_name}</Text>
                       {child.email ? <Text style={styles.listSubtitle}>{child.email}</Text> : null}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#ccc" />
                 </TouchableOpacity>
              ))}
           </View>
          </View>
       );
    }

    return (
    <View style={styles.leftSidebar}>
       <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>Parent Contact</ThemedText>
          
          <View style={styles.infoRow}>
             <Ionicons name="call-outline" size={18} color="#666" />
             <View>
                <ThemedText style={styles.infoLabel}>Phone</ThemedText>
                <ThemedText style={styles.infoValue}>{contactPhone}</ThemedText>
             </View>
          </View>

          <View style={styles.infoRow}>
             <Ionicons name="location-outline" size={18} color="#666" />
             <View>
                <ThemedText style={styles.infoLabel}>Address</ThemedText>
                <ThemedText style={styles.infoValue}>{contactAddress}</ThemedText>
             </View>
          </View>

          <View style={styles.infoRow}>
             <Ionicons name="mail-outline" size={18} color="#666" />
             <View>
                <ThemedText style={styles.infoLabel}>Email</ThemedText>
                <ThemedText style={styles.infoValue}>{contactEmail}</ThemedText>
             </View>
          </View>
        </View>

       <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>Guardians</ThemedText>
          {(user.manager ? [user.manager] : guardians).map((g: any, idx: number) => (
             <TouchableOpacity 
                key={idx} 
                style={styles.listItem}
                onPress={() => router.push({
                   pathname: '/user-details',
                   params: {
                      id: g.id,
                      facilityId: facilityId,
                      academicYearId: academicYearId,
                      from: 'user-details'
                   }
                })}
             >
                <View style={styles.avatarSmall}>
                   <Text style={styles.avatarSmallText}>{g.first_name?.[0]}{g.family_name?.[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                   <Text style={styles.listTitle}>{g.first_name} {g.family_name}</Text>
                   {g.email ? <Text style={styles.listSubtitle}>{g.email}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={16} color="#ccc" />
             </TouchableOpacity>
          ))}
       </View>
      </View>
  )};

  const GeneralTabContent = () => {
    if (user.user_type === 'parent') {
        return (
            <View style={styles.detailsGrid}>
               <InfoItem label="First name" value={user.first_name} />
               <InfoItem label="Bank name" value={user.billing_account?.bank_name || '-'} />
               <InfoItem label="Family name" value={user.family_name} />
               <InfoItem label="IBAN" value={user.billing_account?.iban || '-'} />
               <InfoItem label="Email" value={user.email || '-'} />
               <InfoItem label="BIC" value={user.billing_account?.bic || '-'} />
               <InfoItem label="Phone" value={user.phone || '-'} />
               <InfoItem label="Address" value={getAddress(user)} fullWidth />
            </View>
        );
    }

    const address = `${user.address?.street || user.children_info?.[0]?.street || ''} ${user.address?.street_number || user.children_info?.[0]?.street_number || ''}, ${user.address?.zip_code || user.children_info?.[0]?.zip || ''} ${user.address?.city || user.children_info?.[0]?.city || ''}`.trim();
    const displayAddress = address === ',' ? '-' : address;
    const age = calculateAge(user.dob);

    return (
    <View style={styles.detailsGrid}>
       <InfoItem label="First name" value={user.first_name} />
       <InfoItem label="Allergies" value={childInfo?.allergies?.join(', ') || '--'} />
       
       <InfoItem label="Family name" value={user.family_name} />
       <InfoItem label="Bus" value={childInfo?.is_bus_child ? (childInfo.bus_stop || 'Yes') : '-'} />

       <InfoItem label="Geburtsdatum" value={user.dob || '-'} />
       <InfoItem label="Alter" value={age} />
       
       <InfoItem label="Email" value={user.email || '-'} />
       <InfoItem label="Religion" value={childInfo?.custom_religion || childInfo?.religion || '-'} />
       
       <InfoItem label="Phone" value={user.phone || '-'} />
       <InfoItem label="Address" value={displayAddress || '-'} />
       
       <InfoItem label="Facility" value={facilityName || '-'} />
       <InfoItem label="Class" value={childInfo?.class || '-'} />
    </View>
  );
  };

  const InfoItem = ({ label, value, fullWidth }: { label: string, value: string, fullWidth?: boolean }) => (
    <View style={[styles.infoItem, fullWidth && { width: '100%' }]}>
        <Text style={styles.infoItemLabel}>{label}</Text>
        <Text style={styles.infoItemValue}>{value}</Text>
    </View>
  );

  const getTabIcon = (tab: string) => {
    switch(tab) {
      case 'General': return 'grid-outline';
      case 'Mahlzeiten': return 'restaurant-outline';
      case 'BuT': return 'clipboard-outline';
      case 'Abmeldungen': return 'alert-circle-outline';
      case 'Logbook': return 'list-outline';
      case 'Stundenplan': return 'calendar-outline';
      case 'Betreuungsplan': return 'time-outline';
      case 'Logs': return 'mail-open-outline';
      default: return 'ellipse-outline';
    }
  };

  return (
    <View style={styles.mainContainer}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#007AFF" />
        }
      >
         {/* Hero Section */}
         <View style={styles.heroSection}>
            <View style={styles.headerActions}>
                <TouchableOpacity onPress={handleBack} style={styles.iconButton}>
                   <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <View /> 
            </View>

            <View style={styles.heroContent}>
                <View style={styles.heroAvatar}>
                    <Text style={styles.heroAvatarText}>{user.first_name?.[0]}{user.family_name?.[0]}</Text>
                </View>
                <Text style={styles.heroName}>{user.first_name} {user.family_name}</Text>
                <View style={styles.heroBadge}>
                    <Text style={styles.heroBadgeText}>{user.user_type || 'Child'}</Text>
                </View>
            </View>
         </View>

         <View style={[styles.contentBody, !isLandscape && { flexDirection: 'column' }]}>
            {/* Left Sidebar */}
            <View style={[styles.columnLeft, !isLandscape && { width: '100%', marginBottom: 20 }]}>
               <LeftSidebar />
            </View>

            {/* Right Content (Tabs) */}
            <View style={styles.columnRight}>
               <View style={styles.tabsContainer}>
                  {/* Tabs Header (Burger Style) */}
                  <TouchableOpacity 
                     style={styles.tabsHeader} 
                     onPress={() => setShowTabsMenu(true)}
                     activeOpacity={0.7}
                  >
                     <View style={{flexDirection:'row', alignItems:'center', gap: 12, flex: 1}}>
                        <Ionicons name={getTabIcon(activeTab) as any} size={20} color="#007AFF" />
                        <Text style={styles.activeTabTitle}>{activeTab}</Text>
                     </View>
                     <View style={styles.burgerMenuBtn}>
                        <Ionicons name="chevron-down" size={20} color="#666" />
                     </View>
                  </TouchableOpacity>

                  {/* Tab Content */}
                  <View style={styles.tabContent}>
                     {activeTab === 'General' && <GeneralTabContent />}
                     {activeTab === 'Logs' && <EmailLogsTab userIds={[user.id, ...(user.children?.map(c => c.id) || [])]} />}
                     {activeTab === 'Mahlzeiten' && <MahlzeitenTab userId={user.id} facilityId={String(facilityId || user.children_info?.[0]?.facility_id)} from={from} />}
                     {activeTab === 'BuT' && <ChildMandateTab childId={user.id} facilityId={String(facilityId || user.children_info?.[0]?.facility_id)} />}
                     {activeTab === 'Abmeldungen' && <SickLeaveList userId={user.id} />}
                     {activeTab === 'Logbook' && <LogbookTab userId={user.id} academicYearId={String(academicYearId)} />}
                     {activeTab === 'Stundenplan' && <StundenplanTab userId={user.id} />}
                     {activeTab === 'Betreuungsplan' && <BetreuungsplanTab childId={user.id} academicYearId={String(academicYearId)} facilityId={String(facilityId)} />}
                  </View>
               </View>
            </View>
         </View>
         
         <View style={{ height: 40 }} />
      </ScrollView>

      {/* Tab Selection Modal */}
      <Modal visible={showTabsMenu} transparent animationType="fade" onRequestClose={() => setShowTabsMenu(false)}>
         <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowTabsMenu(false)}>
            <View style={styles.menuContainer}>
               {tabs.map(tab => (
                  <TouchableOpacity 
                    key={tab} 
                    style={[styles.menuItem, activeTab === tab && styles.menuItemSelected]}
                    onPress={() => { setActiveTab(tab); setShowTabsMenu(false); }}
                  >
                     <View style={{flexDirection:'row', alignItems:'center', gap: 10}}>
                        <Ionicons name={getTabIcon(tab) as any} size={18} color={activeTab === tab ? '#007AFF' : '#666'} />
                        <Text style={[styles.menuItemText, activeTab === tab && styles.menuItemTextSelected]}>{tab}</Text>
                     </View>
                     {activeTab === tab && <Ionicons name="checkmark" size={16} color="#007AFF" />}
                  </TouchableOpacity>
               ))}
            </View>
         </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    flexGrow: 1,
  },
  // Hero
  heroSection: {
    backgroundColor: '#007AFF',
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    marginBottom: 20,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  iconButton: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
  },
  heroContent: {
    alignItems: 'center',
  },
  heroAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  heroAvatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  heroName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 6,
  },
  heroBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  heroBadgeText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
    textTransform: 'capitalize',
  },
  // Layout
  contentBody: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 16,
  },
  columnLeft: {
    width: 300,
    flexShrink: 0,
  },
  leftSidebar: {
    gap: 16,
  },
  columnRight: {
    flex: 1,
  },
  // Cards
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  infoLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    color: '#000',
    fontWeight: '500',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  listSubtitle: {
    fontSize: 12,
    color: '#666',
  },
  avatarSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarSmallText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  // Tabs
  tabsContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    minHeight: 400,
  },
  tabsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#F9F9F9',
  },
  activeTabTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  burgerMenuBtn: {
    padding: 4,
  },
  tabContent: {
    padding: 20,
  },
  // Grid
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
  },
  infoItem: {
    width: '47%', 
    marginBottom: 8,
  },
  infoItemLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  infoItemValue: {
    fontSize: 15,
    color: '#000',
    fontWeight: '500',
  },
  // Logout
  logoutContainer: {
    marginTop: 30,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF3B30',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    gap: 8,
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  logoutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContainer: {
    width: 280,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  menuItemSelected: {
    backgroundColor: '#F0F9FF',
  },
  menuItemText: {
    fontSize: 16,
    color: '#333',
  },
  menuItemTextSelected: {
    fontWeight: '600',
    color: '#007AFF',
  },
});
