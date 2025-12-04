import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// IMPORTANT:
// To keep web (`bissfest_tool`) and tablet (`Tilda-staff`) in sync,
// we read the SAME environment variables that the web app uses.
//
// In your dev/production env, set:
//   NEXT_PUBLIC_SUPABASE_URL=...
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
//
// Optionally you can also set Expo-style:
//   EXPO_PUBLIC_SUPABASE_URL=...
//   EXPO_PUBLIC_SUPABASE_ANON_KEY=...
//
// We support both and fall back to the previous hard-coded values
// so the app keeps working until env vars are configured.

const fallbackUrl = 'https://juzgiqllmkzxvjhyloll.supabase.co';
const fallbackAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1emdpcWxsbWt6eHZqaHlsb2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkxODUzNzAsImV4cCI6MjA1NDc2MTM3MH0.PiVjIcRoORMIUljz4usW-y7Nb0ynz4MWOpW2LtYqIRo';

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  fallbackUrl;

const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  fallbackAnonKey;

// Safer storage adapter that prevents crashes in Node/SSR environments
const ExpoStorage = {
  getItem: (key: string) => {
    if (Platform.OS === 'web' && typeof window === 'undefined') {
      return Promise.resolve(null);
    }
    return AsyncStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS === 'web' && typeof window === 'undefined') {
      return Promise.resolve();
    }
    return AsyncStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (Platform.OS === 'web' && typeof window === 'undefined') {
      return Promise.resolve();
    }
    return AsyncStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});



