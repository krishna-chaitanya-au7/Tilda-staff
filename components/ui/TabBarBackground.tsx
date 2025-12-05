import { View, StyleSheet, Platform } from 'react-native';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// This is a shim for expo-blur which is not installed.
// If you install expo-blur, you can use BlurView here for iOS.
export default function TabBarBackground() {
  const colorScheme = useColorScheme();
  
  return (
    <View 
      style={[
        styles.background, 
        { backgroundColor: colorScheme === 'dark' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)' }
      ]} 
    />
  );
}

const styles = StyleSheet.create({
  background: {
    ...StyleSheet.absoluteFillObject,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
    // On iOS with absolute positioning, this fills the tab bar area
  },
});












