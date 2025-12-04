import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export type Role = 'principal' | 'head_teacher' | 'teacher' | 'office' | 'parent' | 'guardian' | 'child' | 'supervisor' | string;

export const RoleBadge = ({ role }: { role?: Role }) => {
  const map: Record<string, { bg: string, text: string }> = {
    principal: { bg: '#F3E8FF', text: '#6B21A8' }, // purple-100/800
    head_teacher: { bg: '#E0F2FE', text: '#075985' }, // sky-100/800
    teacher: { bg: '#D1FAE5', text: '#065F46' }, // emerald-100/800
    office: { bg: '#FEF3C7', text: '#92400E' }, // amber-100/800
    parent: { bg: '#DBEAFE', text: '#1E40AF' }, // blue-100/800
    guardian: { bg: '#DBEAFE', text: '#1E40AF' }, // blue-100/800
    child: { bg: '#F4F4F5', text: '#27272A' }, // zinc-100/800
    supervisor: { bg: '#E0E7FF', text: '#3730A3' } // indigo-100/800
  };

  const r = (role || 'child').toLowerCase();
  const style = map[r] || map.child;

  return (
    <View style={[styles.container, { backgroundColor: style.bg }]}>
      <Text style={[styles.text, { color: style.text }]}>
        {r.replace('_', ' ').toUpperCase()}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 16, // rounded-2xl
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 10,
    fontWeight: '600', // font-medium / font-semibold
  },
});




