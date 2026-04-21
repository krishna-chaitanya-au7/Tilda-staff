import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Dimensions,
  Platform,
  TouchableOpacity,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import type { CalendarTourStep } from '@/lib/calendarTourMobile';
import { STAGE_PADDING } from '@/lib/calendarTourMobile';

export type HoleRect = { x: number; y: number; w: number; h: number };

type Props = {
  visible: boolean;
  steps: CalendarTourStep[];
  stepIndex: number;
  holeRect: HoleRect | null;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
};

const GAP = 10;
const H_PAD = 16;
const CARD_MAX_W = 400;
const ESTIMATED_CARD_H = 260;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export default function CalendarTourModal({
  visible,
  steps,
  stepIndex,
  holeRect,
  onClose,
  onNext,
  onPrev,
}: Props) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { width: screenW, height: screenH } = Dimensions.get('window');

  const step = steps[stepIndex];
  const total = steps.length;
  const current = stepIndex + 1;

  const [cardSize, setCardSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    setCardSize({ w: 0, h: 0 });
  }, [stepIndex]);

  const onCardLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCardSize((prev) =>
      prev.w === width && prev.h === height ? prev : { w: width, h: height }
    );
  }, []);

  const dim = useMemo(() => {
    if (!holeRect || holeRect.w <= 0 || holeRect.h <= 0) {
      return null;
    }
    const p = STAGE_PADDING;
    const x = holeRect.x - p;
    const y = holeRect.y - p;
    const w = holeRect.w + p * 2;
    const h = holeRect.h + p * 2;
    const topH = Math.max(0, y);
    const leftW = Math.max(0, x);
    const rightX = x + w;
    const bottomY = y + h;
    const midH = Math.max(0, h);
    const bottomH = Math.max(0, screenH - bottomY);

    return {
      top: { left: 0, top: 0, width: screenW, height: topH },
      left: { left: 0, top: y, width: leftW, height: midH },
      right: { left: rightX, top: y, width: Math.max(0, screenW - rightX), height: midH },
      bottom: { left: 0, top: bottomY, width: screenW, height: bottomH },
    };
  }, [holeRect, screenW, screenH]);

  const bottomReserve = (tabBarHeight > 0 ? tabBarHeight : insets.bottom) + 8;

  const cardW = Math.min(screenW - H_PAD * 2, CARD_MAX_W);
  const cardH = cardSize.h > 0 ? cardSize.h : ESTIMATED_CARD_H;

  const anchoredLayout = useMemo(() => {
    if (!holeRect || holeRect.w <= 0 || holeRect.h <= 0) return null;

    const holeCx = holeRect.x + holeRect.w / 2;
    let left = holeCx - cardW / 2;
    left = clamp(left, H_PAD, screenW - H_PAD - cardW);

    const spaceBelow = screenH - holeRect.y - holeRect.h - bottomReserve;
    const spaceAbove = holeRect.y - insets.top;

    let top: number;
    let arrow: 'top' | 'bottom';

    const needBelow = cardH + GAP + 24;
    const needAbove = cardH + GAP + 24;

    if (spaceBelow >= needBelow && spaceBelow >= spaceAbove) {
      top = holeRect.y + holeRect.h + GAP;
      arrow = 'top';
    } else if (spaceAbove >= needAbove) {
      top = holeRect.y - GAP - cardH;
      arrow = 'bottom';
    } else if (spaceBelow >= spaceAbove) {
      top = clamp(
        holeRect.y + holeRect.h + GAP,
        insets.top + 8,
        screenH - bottomReserve - cardH - 8
      );
      arrow = 'top';
    } else {
      top = clamp(
        holeRect.y - GAP - cardH,
        insets.top + 8,
        screenH - bottomReserve - cardH - 8
      );
      arrow = 'bottom';
    }

    top = clamp(top, insets.top + 8, screenH - bottomReserve - cardH - 8);

    const holeCxClamped = clamp(holeCx, left + 16, left + cardW - 16);
    const arrowOffset = holeCxClamped - left - 8;

    return { left, top, arrow, arrowOffset };
  }, [holeRect, cardW, cardH, screenW, screenH, bottomReserve, insets.top]);

  const fallbackBottomPad = (tabBarHeight > 0 ? tabBarHeight : insets.bottom) + 12;

  if (!visible || !step) return null;

  const useAnchor = Boolean(dim && anchoredLayout);

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View style={styles.modalRoot} pointerEvents="box-none">
        {dim ? (
          <>
            <View style={[styles.dim, dim.top]} />
            <View style={[styles.dim, dim.left]} />
            <View style={[styles.dim, dim.right]} />
            <View style={[styles.dim, dim.bottom]} />
          </>
        ) : (
          <Pressable style={[styles.dimFull, { width: screenW, height: screenH }]} onPress={onClose} />
        )}

        {useAnchor && anchoredLayout ? (
          <View
            style={[
              styles.card,
              {
                position: 'absolute',
                left: anchoredLayout.left,
                top: anchoredLayout.top,
                width: cardW,
                paddingBottom: 12,
              },
            ]}
            pointerEvents="box-none"
          >
            {anchoredLayout.arrow === 'top' ? (
              <View
                style={[
                  styles.arrowUp,
                  { marginLeft: clamp(anchoredLayout.arrowOffset, 12, cardW - 28) },
                ]}
              />
            ) : null}
            <View style={styles.cardInner} onLayout={onCardLayout}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{step.title}</Text>
                <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Schließen">
                  <Ionicons name="close" size={22} color="#6b7280" />
                </TouchableOpacity>
              </View>
              <Text style={styles.cardBody}>{step.description}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.progress}>
                  {current} / {total}
                </Text>
                <View style={styles.footerBtns}>
                  <TouchableOpacity
                    onPress={onPrev}
                    disabled={stepIndex <= 0}
                    style={[styles.footerBtn, stepIndex <= 0 && styles.footerBtnDisabled]}
                  >
                    <Text style={[styles.footerBtnText, stepIndex <= 0 && styles.footerBtnTextDisabled]}>
                      ‹ Zurück
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={stepIndex >= total - 1 ? onClose : onNext}
                    style={[styles.footerBtn, styles.footerBtnPrimary]}
                  >
                    <Text style={styles.footerBtnPrimaryText}>
                      {stepIndex >= total - 1 ? 'Fertig' : 'Weiter ›'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            {anchoredLayout.arrow === 'bottom' ? (
              <View
                style={[
                  styles.arrowDown,
                  { marginLeft: clamp(anchoredLayout.arrowOffset, 12, cardW - 28) },
                ]}
              />
            ) : null}
          </View>
        ) : (
          <View
            style={[styles.card, { paddingBottom: fallbackBottomPad, marginHorizontal: 16 }]}
            pointerEvents="box-none"
          >
            <View style={styles.cardInner} onLayout={onCardLayout}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{step.title}</Text>
                <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Schließen">
                  <Ionicons name="close" size={22} color="#6b7280" />
                </TouchableOpacity>
              </View>
              <Text style={styles.cardBody}>{step.description}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.progress}>
                  {current} / {total}
                </Text>
                <View style={styles.footerBtns}>
                  <TouchableOpacity
                    onPress={onPrev}
                    disabled={stepIndex <= 0}
                    style={[styles.footerBtn, stepIndex <= 0 && styles.footerBtnDisabled]}
                  >
                    <Text style={[styles.footerBtnText, stepIndex <= 0 && styles.footerBtnTextDisabled]}>
                      ‹ Zurück
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={stepIndex >= total - 1 ? onClose : onNext}
                    style={[styles.footerBtn, styles.footerBtnPrimary]}
                  >
                    <Text style={styles.footerBtnPrimaryText}>
                      {stepIndex >= total - 1 ? 'Fertig' : 'Weiter ›'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  dim: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  dimFull: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  arrowUp: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#fff',
    marginBottom: -1,
    zIndex: 1,
  },
  arrowDown: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#fff',
    marginTop: -1,
    zIndex: 1,
  },
  card: {
    maxWidth: CARD_MAX_W,
    width: '100%',
    alignSelf: 'center',
    zIndex: 20,
  },
  cardInner: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginRight: 8,
  },
  cardBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#374151',
    marginBottom: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progress: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  footerBtns: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  footerBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  footerBtnDisabled: { opacity: 0.45 },
  footerBtnText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  footerBtnTextDisabled: { color: '#9ca3af' },
  footerBtnPrimary: { backgroundColor: '#111827' },
  footerBtnPrimaryText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
