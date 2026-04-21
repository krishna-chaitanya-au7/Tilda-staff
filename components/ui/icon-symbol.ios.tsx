import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolView, SymbolViewProps, SymbolWeight } from 'expo-symbols';
import { ComponentProps } from 'react';
import { StyleProp, ViewStyle } from 'react-native';

/**
 * SF Symbol `ticket.fill` is an admission/movie-style ticket. For support tickets we use the same
 * Material icon as Android/web (`support-agent`) so the tab bar matches across platforms.
 */
const MATERIAL_BY_SF_NAME: Partial<
  Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>
> = {
  'ticket.fill': 'support-agent',
};

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
  weight = 'regular',
}: {
  name: SymbolViewProps['name'];
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
}) {
  const materialName = MATERIAL_BY_SF_NAME[name];
  if (materialName) {
    return <MaterialIcons name={materialName} size={size} color={color} />;
  }

  return (
    <SymbolView
      weight={weight}
      tintColor={color}
      resizeMode="scaleAspectFit"
      name={name}
      style={[
        {
          width: size,
          height: size,
        },
        style,
      ]}
    />
  );
}
