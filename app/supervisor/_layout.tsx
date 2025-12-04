import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function SupervisorTabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            // Use a transparent background on iOS to show the blur effect
            position: 'absolute',
          },
          default: {},
        }),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Übersicht',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="rectangle.grid.2x2.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="grouping"
        options={{
          title: 'Klassen',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="person.3.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: 'Anwesenheit',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="checklist" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="qr-requests"
        options={{
          title: 'QR Karten',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="qrcode" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Nachrichten',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="bubble.left.and.bubble.right.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="person.fill" color={color} />
          ),
        }}
      />
      
      {/* Hidden Tabs */}
      <Tabs.Screen
        name="groups-settings"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="eating-locations"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
