import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getFacilityTypeName,
  resolveFacilityIdFromAccess,
  type StaffUserForPortal,
  type UserAccessRow,
} from '@/lib/facilityPermissions';
import { supabase } from '@/lib/supabase';

export default function FacilityTabLayout() {
  const colorScheme = useColorScheme();
  /** Tickets tab only for kindergarten (Kita) staff — school facility users stay on /facility without this tab. */
  const [showTicketsTab, setShowTicketsTab] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data: uRow } = await supabase
          .from('users')
          .select('id, user_type, record_id, auth_id')
          .eq('auth_id', user.id)
          .maybeSingle();
        if (!uRow || cancelled) return;
        const { data: accessRows } = await supabase
          .from('user_access')
          .select('resource_type, resource_id')
          .or(`user_id.eq.${uRow.id},user_id.eq.${user.id}`);
        const facilityId = resolveFacilityIdFromAccess(
          uRow as StaffUserForPortal,
          (accessRows || []) as UserAccessRow[]
        );
        if (!facilityId || cancelled) return;
        const t = await getFacilityTypeName(facilityId);
        if (cancelled) return;
        setShowTicketsTab(String(t || '').toLowerCase() === 'kindergarten');
      } catch {
        if (!cancelled) setShowTicketsTab(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Tabs
      initialRouteName="attendance"
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            position: 'absolute',
          },
          default: {},
        }),
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="messages" options={{ href: null }} />
      <Tabs.Screen
        name="tickets"
        options={{
          title: 'Tickets',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="ticket-account" size={24} color={color} />
          ),
          ...(showTicketsTab ? {} : { href: null }),
        }}
      />
      <Tabs.Screen
        name="mensa"
        options={{
          title: 'Mensa',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="fork.knife" color={color} />,
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: 'Anwesenheit',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="checklist" color={color} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Kalender',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="messaging"
        options={{
          title: 'Messenger',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="bubble.left.and.bubble.right.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Mitteilungen',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="bell.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="person.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
