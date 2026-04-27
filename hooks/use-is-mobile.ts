import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import * as Device from 'expo-device';

export const MOBILE_MAX_WIDTH = 768;

const isWeb = Platform.OS === 'web';

export function useIsMobile(): boolean {
  const { width } = useWindowDimensions();
  const [hydrated, setHydrated] = useState(!isWeb);

  useEffect(() => {
    if (isWeb) setHydrated(true);
  }, []);

  if (Platform.OS === 'ios' && Platform.isPad) return false;
  if (Platform.OS === 'android' && Device.deviceType === Device.DeviceType.TABLET) return false;

  if (!hydrated) return false;
  return width < MOBILE_MAX_WIDTH;
}
