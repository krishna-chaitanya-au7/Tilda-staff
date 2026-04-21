import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { de } from 'date-fns/locale';

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export function toYmd(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

type Props = {
  visibleMonth: Date;
  selectedYmd: Set<string>;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  interactive: boolean;
  onToggleDate?: (ymd: string) => void;
  selectedVariant?: 'soft' | 'solid';
  /** ~50% width — use on plan settings preview only; drawer stays full width. */
  compact?: boolean;
};

export default function ClosingDaysMonthGrid({
  visibleMonth,
  selectedYmd,
  onPrevMonth,
  onNextMonth,
  interactive,
  onToggleDate,
  selectedVariant = 'soft',
  compact = false,
}: Props) {
  const [contentWidth, setContentWidth] = useState(0);

  const start = startOfWeek(startOfMonth(visibleMonth), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(visibleMonth), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start, end });

  const horizontalPad = compact ? 16 : 24;
  const cellSize = contentWidth > 0 ? Math.floor(contentWidth / 7) : compact ? 20 : 40;

  const onCalWrapLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    const inner = w - horizontalPad;
    if (inner > 0) setContentWidth(inner);
  };

  const iconSz = compact ? 18 : 22;
  const titleStyle = compact ? styles.calTitleCompact : styles.calTitle;
  const dayNumStyle = compact ? styles.dayNumCompact : styles.dayNum;
  const weekdayStyle = compact ? styles.weekdayLblCompact : styles.weekdayLbl;

  const inner = (
    <View
      style={[styles.calWrap, compact && styles.calWrapCompact]}
      onLayout={onCalWrapLayout}
    >
      <View style={styles.calHeader}>
        <TouchableOpacity onPress={onPrevMonth} hitSlop={10}>
          <Ionicons name="chevron-back" size={iconSz} color="#374151" />
        </TouchableOpacity>
        <Text style={titleStyle}>{format(visibleMonth, 'LLLL yyyy', { locale: de })}</Text>
        <TouchableOpacity onPress={onNextMonth} hitSlop={10}>
          <Ionicons name="chevron-forward" size={iconSz} color="#374151" />
        </TouchableOpacity>
      </View>
      <View style={styles.weekRow}>
        {WEEKDAY_LABELS.map((w) => (
          <Text key={w} style={[weekdayStyle, { width: cellSize }]}>
            {w}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {days.map((d) => {
          const ymd = toYmd(d);
          const inMonth = isSameMonth(d, visibleMonth);
          const sel = selectedYmd.has(ymd);
          return (
            <TouchableOpacity
              key={ymd}
              style={[
                styles.dayCell,
                { width: cellSize, height: cellSize },
                !inMonth && styles.dayCellMuted,
                sel && (selectedVariant === 'solid' ? styles.dayCellSelectedSolid : styles.dayCellSelectedSoft),
              ]}
              disabled={!interactive}
              onPress={() => {
                if (!interactive || !onToggleDate) return;
                onToggleDate(ymd);
              }}
            >
              <Text
                style={[
                  dayNumStyle,
                  !inMonth && styles.dayNumMuted,
                  sel && (selectedVariant === 'solid' ? styles.dayNumSelectedSolid : styles.dayNumSelectedSoft),
                ]}
              >
                {format(d, 'd')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  if (compact) {
    return <View style={styles.compactOuter}>{inner}</View>;
  }
  return inner;
}

export { addMonths };

const styles = StyleSheet.create({
  calWrap: {
    backgroundColor: '#fafafa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    alignSelf: 'stretch',
  },
  calWrapCompact: {
    padding: 8,
  },
  compactOuter: {
    width: '50%',
    maxWidth: 280,
    alignSelf: 'flex-start',
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  calTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    textTransform: 'capitalize',
  },
  calTitleCompact: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
    textTransform: 'capitalize',
    flex: 1,
    textAlign: 'center',
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 6,
    justifyContent: 'space-between',
  },
  weekdayLbl: {
    textAlign: 'center',
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '600',
  },
  weekdayLblCompact: {
    textAlign: 'center',
    fontSize: 9,
    color: '#6b7280',
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  dayCell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  dayCellMuted: { opacity: 0.38 },
  dayCellSelectedSoft: {
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  dayCellSelectedSolid: {
    backgroundColor: '#111827',
  },
  dayNum: { fontSize: 14, color: '#111827' },
  dayNumCompact: { fontSize: 11, color: '#111827' },
  dayNumMuted: { color: '#9ca3af' },
  dayNumSelectedSoft: { fontWeight: '700', color: '#4338ca' },
  dayNumSelectedSolid: { fontWeight: '700', color: '#fff' },
});
