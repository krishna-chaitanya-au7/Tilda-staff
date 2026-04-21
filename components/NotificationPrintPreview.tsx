import { View, Text, ScrollView, StyleSheet } from 'react-native';
import type { ComposeDraft } from '@/lib/commComposeSend';

function stripHtmlToText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+\n/g, '\n')
    .trim();
}

const SAMPLE_PRINT_BODY =
  '<p>Liebe Eltern,</p><br/><p>wir möchten Sie darüber informieren, dass am Montag, den 5. Mai, der Unterricht aufgrund eines pädagogischen Tages entfällt.</p><br/><p>Bitte sorgen Sie für eine Betreuung Ihres Kindes.</p><br/><p>Mit freundlichen Grüßen</p><p>Grundschule Musterstadt</p>';

/**
 * Letter-style print preview aligned with web PrintPreview.tsx
 */
export default function NotificationPrintPreview({
  data,
  compact,
  large,
}: {
  data: ComposeDraft;
  compact?: boolean;
  large?: boolean;
}) {
  const samplePrintTitle = 'Grundschule Musterstadt';
  const samplePrintSubtitle = 'An die Eltern der Klasse…';
  const displayTitle = data.title?.trim() || samplePrintTitle;
  const displaySubtitle = data.subtitle?.trim() || samplePrintSubtitle;
  const rawBody = data.body?.trim();
  const displayBodyHtml = rawBody || SAMPLE_PRINT_BODY;
  const bodyText = stripHtmlToText(displayBodyHtml);
  const isSample = !rawBody;

  return (
    <View style={styles.wrap}>
      <View style={[styles.sheet, compact && styles.sheetCompact, large && !compact && styles.sheetLarge]}>
        <View style={styles.headerBlock}>
          <Text style={[styles.headerTitle, isSample && styles.sampleMuted]} numberOfLines={2}>
            {displayTitle}
          </Text>
          <Text style={[styles.headerSub, isSample && styles.sampleMuted]} numberOfLines={2}>
            {displaySubtitle}
          </Text>
        </View>
        <ScrollView
          style={[styles.bodyScroll, large && !compact && styles.bodyScrollLarge]}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.bodyText, isSample && styles.sampleMuted, large && !compact && styles.bodyTextLarge]}>
            {bodyText}
          </Text>
        </ScrollView>
      </View>
      <Text style={[styles.caption, large && !compact && styles.captionLarge]}>Druck-Vorschau</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', width: '100%' },
  sheet: {
    width: 250,
    maxHeight: 380,
    minHeight: 300,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    overflow: 'hidden',
  },
  sheetCompact: {
    width: 220,
    maxHeight: 300,
    minHeight: 240,
  },
  /** Matches web `w-[250px] h-[355px]` print frame. */
  sheetLarge: {
    width: 280,
    minHeight: 355,
    maxHeight: 420,
    borderRadius: 6,
  },
  headerBlock: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
    letterSpacing: 0.2,
  },
  headerSub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
    letterSpacing: 0.2,
    marginTop: 4,
  },
  sampleMuted: { color: '#94a3b8' },
  bodyScroll: { maxHeight: 260, paddingHorizontal: 16, paddingVertical: 12 },
  bodyScrollLarge: { maxHeight: 300, flexGrow: 1 },
  bodyText: {
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '600',
    color: '#64748b',
    letterSpacing: 0.2,
  },
  bodyTextLarge: { fontSize: 10, lineHeight: 15 },
  caption: {
    marginTop: 8,
    fontSize: 10,
    color: '#9ca3af',
  },
  captionLarge: { fontSize: 11, marginTop: 10 },
});
