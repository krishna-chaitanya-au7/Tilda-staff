import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View, ActivityIndicator, Text, useWindowDimensions, Modal, Alert, RefreshControl, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

// Tabs (Removed as per request)
// import MahlzeitenTab from '@/components/user-details/MahlzeitenTab';
// import SickLeaveList from '@/components/user-details/SickLeaveList';
// import LogbookTab from '@/components/user-details/LogbookTab';
// import StundenplanTab from '@/components/user-details/StundenplanTab';
// import BetreuungsplanTab from '@/components/user-details/BetreuungsplanTab';
// import EmailLogsTab from '@/components/user-details/EmailLogsTab';
// import ChildMandateTab from '@/components/user-details/ChildMandateTab';

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

export default function SupervisorProfileScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isLandscape = width > 768;
  const insets = useSafeAreaInsets(); 

  const [id, setId] = useState<string | null>(null);
  const [user, setUser] = useState<UserDetails | null>(null);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [facilityName, setFacilityName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showDeleteSheet, setShowDeleteSheet] = useState<boolean>(false);
  const [currentView, setCurrentView] = useState<'profile' | 'blocked-users'>('profile');
  const [blockedUsers, setBlockedUsers] = useState<{ id: string; name: string }[]>([]);
  const [isLoadingBlocked, setIsLoadingBlocked] = useState<boolean>(false);

  useEffect(() => {
      const fetchSelf = async () => {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (authUser) {
              const { data: u } = await supabase.from('users').select('id').eq('auth_id', authUser.id).single();
              if (u) setId(u.id);
          }
      };
      fetchSelf();
  }, []);

  const fetchUserDetails = useCallback(async (isRefresh = false) => {
    if (!id) return;

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

      const facId = userData.children_info?.[0]?.facility_id;
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
  }, [id]);

  const fetchGuardians = useCallback(async () => {
    if (!id) return;
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
      }
    }, [fetchUserDetails, fetchGuardians, id])
  );
  
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchUserDetails(true);
    fetchGuardians();
  }, [fetchUserDetails, fetchGuardians]);

  const handleEdit = () => {
    if (id) {
        router.push({
        pathname: '/user-edit',
        params: { id: id }
        });
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Logout", style: "destructive", onPress: async () => {
            try {
              await supabase.auth.signOut();
              router.replace('/login');
            } catch (error) {
              console.error("Logout error", error);
            }
          } 
        }
      ]
    );
  };

  const reasons = [
    'Sicherheitsbedenken',
    'Zu viele Benachrichtigungen',
    'Ich benötige meinen Account nicht mehr',
    'Sonstige Gründe',
  ];

  const openDeleteEmail = async (reason: string) => {
    try {
      const to = 'support@tilda.schule';
      const subject = `Account deletion request - ${user?.first_name || ''} ${user?.family_name || ''} ${user?.email || 'User'}`;
      const bodyLines = [
        'Hello Team,',
        '',
        'I would like to request deletion of my account.',
        `Reason: ${reason}`,
        '',
        `User ID: ${id || 'unknown'}`,
        `Name: ${user?.first_name || ''} ${user?.family_name || ''}`,
        `Email: ${user?.email || ''}`,
        '',
        'Please confirm once this request has been processed.',
        '',
        'Thank you.'
      ];
      const mailto = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`;
      await Linking.openURL(mailto);
    } catch (e) {
      console.error('Open mail failed', e);
      Alert.alert('Error', 'Could not open mail app');
    }
  };

  const handleDeleteAccount = () => {
    setShowDeleteSheet(true);
  };

  const loadBlockedUsers = useCallback(async () => {
    if (!id) return;
    setIsLoadingBlocked(true);
    try {
      const { data, error } = await supabase
        .from('msg_thread_blocked')
        .select('blocked_user_id, users!msg_thread_blocked_blocked_user_id_fkey(name, first_name, family_name)')
        .eq('blocked_by', id);
      
      if (error) throw error;
      
      const formatted = (data || []).map((r: any) => ({
        id: r.blocked_user_id,
        name: (r.users?.name || `${r.users?.first_name || ''} ${r.users?.family_name || ''}`.trim() || r.blocked_user_id) as string,
      }));
      
      setBlockedUsers(formatted);
    } catch (e) {
      console.error('Error fetching blocked users:', e);
      Alert.alert('Error', 'Failed to load blocked users');
    } finally {
      setIsLoadingBlocked(false);
    }
  }, [id]);

  const handleShowBlockedUsers = () => {
    setCurrentView('blocked-users');
    loadBlockedUsers();
  };

  const handleUnblock = async (targetId: string) => {
    try {
      if (!id) return;
      const { error } = await supabase
        .from('msg_thread_blocked')
        .delete()
        .match({ blocked_user_id: targetId, blocked_by: id });
      if (error) throw error;
      await loadBlockedUsers();
      Alert.alert('Success', 'User unblocked');
    } catch (e: any) {
      console.error('Unblock failed:', e);
      Alert.alert('Error', e?.message || 'Failed to unblock');
    }
  };

  // Show blocked users screen
  if (currentView === 'blocked-users') {
    return (
      <View style={[styles.mainContainer, { paddingTop: insets.top }]}>
        <View style={styles.blockedUsersHeader}>
          <TouchableOpacity style={styles.backButton} onPress={() => setCurrentView('profile')}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.blockedUsersHeaderTitle}>Blocked Users</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView 
          style={styles.blockedUsersContent}
          refreshControl={
            <RefreshControl refreshing={isLoadingBlocked} onRefresh={loadBlockedUsers} tintColor="#007AFF" />
          }
        >
          {isLoadingBlocked ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>Loading…</Text>
            </View>
          ) : blockedUsers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No blocked users</Text>
            </View>
          ) : (
            blockedUsers.map((u) => (
              <View key={u.id} style={styles.blockedUserItem}>
                <View style={styles.blockedUserInfo}>
                  <View style={styles.blockedUserIcon}>
                    <Text style={styles.blockedUserIconText}>🚫</Text>
                  </View>
                  <View style={styles.blockedUserDetails}>
                    <Text style={styles.blockedUserName}>{u.name}</Text>
                    <Text style={styles.blockedUserSubtitle}>Tap to unblock this user</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => handleUnblock(u.id)} style={styles.unblockButton}>
                  <Text style={styles.unblockButtonText}>Unblock</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  if (loading || !id) {
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
            </View>
          </View>
       );
    }
    
    // Supervisors/Staff might not have guardians, but let's keep the code safe
    return (
    <View style={styles.leftSidebar}>
       <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>My Contact</ThemedText>
          
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
      </View>
  )};

  const GeneralTabContent = () => {
    const age = calculateAge(user.dob);
    const address = getAddress(user);

    return (
    <View style={styles.detailsGrid}>
       <InfoItem label="First name" value={user.first_name} />
       <InfoItem label="Family name" value={user.family_name} />
       <InfoItem label="Email" value={user.email || '-'} />
       <InfoItem label="Phone" value={user.phone || '-'} />
       <InfoItem label="Geburtsdatum" value={user.dob || '-'} />
       <InfoItem label="Alter" value={age} />
       <InfoItem label="Address" value={address} fullWidth />
    </View>
  );
  };

  const InfoItem = ({ label, value, fullWidth }: { label: string, value: string, fullWidth?: boolean }) => (
    <View style={[styles.infoItem, fullWidth && { width: '100%' }]}>
        <Text style={styles.infoItemLabel}>{label}</Text>
        <Text style={styles.infoItemValue}>{value}</Text>
    </View>
  );

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
                <View /> 
                <TouchableOpacity onPress={handleEdit} style={styles.iconButton}>
                   <Ionicons name="pencil" size={24} color="#fff" />
                </TouchableOpacity>
            </View>

            <View style={styles.heroContent}>
                <View style={styles.heroAvatar}>
                    <Text style={styles.heroAvatarText}>{user.first_name?.[0]}{user.family_name?.[0]}</Text>
                </View>
                <Text style={styles.heroName}>{user.first_name} {user.family_name}</Text>
                <View style={styles.heroBadge}>
                    <Text style={styles.heroBadgeText}>{user.user_type || 'Staff'}</Text>
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
               <View style={styles.card}>
                  <ThemedText style={styles.cardTitle}>General Info</ThemedText>
                  <GeneralTabContent />
               </View>
            </View>
         </View>

         {/* Settings Section */}
         <View style={styles.settingsSection}>
            <Text style={styles.settingsTitle}>Settings</Text>
            
            <TouchableOpacity 
               style={styles.settingsItem}
               onPress={handleShowBlockedUsers}
            >
               <View style={styles.settingsIcon}>
                  <Text style={styles.settingsIconText}>🚫</Text>
               </View>
               <View style={styles.settingsInfo}>
                  <Text style={styles.settingsItemTitle}>Blocked Users</Text>
                  <Text style={styles.settingsItemSubtitle}>Manage users you have blocked</Text>
               </View>
               <Text style={styles.settingsArrow}>›</Text>
            </TouchableOpacity>
         </View>

         {/* Delete Account Button */}
         <View style={styles.deleteAccountContainer}>
            <TouchableOpacity style={styles.deleteAccountButton} onPress={handleDeleteAccount}>
                <Ionicons name="trash-outline" size={20} color="#ef4444" />
                <Text style={styles.deleteAccountText}>Account löschen</Text>
            </TouchableOpacity>
         </View>

         {/* Logout Button */}
         <View style={styles.logoutContainer}>
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={20} color="#fff" />
                <Text style={styles.logoutText}>Abmelden</Text>
            </TouchableOpacity>
         </View>
         
         <View style={{ height: 80 }} />
      </ScrollView>

      {/* Delete Account Sheet */}
      {showDeleteSheet && (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setShowDeleteSheet(false)} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }} />
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#ffffff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: Math.max(insets.bottom, 8), paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb' }}>
            <View style={{ width: 50, height: 5, backgroundColor: '#e5e7eb', borderRadius: 3, alignSelf: 'center', marginBottom: 8 }} />
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827', paddingHorizontal: 16, paddingBottom: 8 }}>Account löschen</Text>
            {reasons.map((label) => (
              <TouchableOpacity key={label} style={{ paddingHorizontal: 16, paddingVertical: 14 }} onPress={() => { setShowDeleteSheet(false); openDeleteEmail(label); }}>
                <Text style={{ color: '#111827' }}>{label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={{ paddingHorizontal: 16, paddingVertical: 14 }} onPress={() => setShowDeleteSheet(false)}>
              <Text style={{ color: '#6b7280' }}>Abbrechen</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#F9F9F9',
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#E5E5EA',
    gap: 6,
  },
  tabChipActive: {
    backgroundColor: '#007AFF',
  },
  tabChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
  },
  tabChipTextActive: {
    color: '#fff',
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
  // Settings Section
  settingsSection: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e7',
  },
  settingsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  settingsIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingsIconText: {
    fontSize: 18,
  },
  settingsInfo: {
    flex: 1,
  },
  settingsItemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  settingsItemSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  settingsArrow: {
    fontSize: 18,
    color: '#666',
  },
  // Delete Account
  deleteAccountContainer: {
    marginTop: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    gap: 8,
    borderWidth: 1,
    borderColor: '#ef4444',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  deleteAccountText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
  },
  // Logout
  logoutContainer: {
    marginTop: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  // Blocked Users Screen
  blockedUsersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  blockedUsersHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    flex: 1,
    textAlign: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blockedUsersContent: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    padding: 16,
  },
  blockedUserItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  blockedUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  blockedUserIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  blockedUserIconText: {
    fontSize: 18,
  },
  blockedUserDetails: {
    flex: 1,
  },
  blockedUserName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  blockedUserSubtitle: {
    fontSize: 12,
    color: '#666',
  },
  unblockButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#b91c1c',
    borderRadius: 8,
  },
  unblockButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#666',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
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
