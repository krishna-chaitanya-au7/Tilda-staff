import { View, Text, ScrollView, StyleSheet } from 'react-native';
import type { ComposeDraft, MsgType } from '@/lib/commComposeSend';

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

function typeLabel(t: MsgType | null): string {
  if (t === 'email') return 'E-Mail';
  if (t === 'messenger') return 'Direktnachricht';
  if (t === 'notice_board') return 'Digitales Brett';
  if (t === 'print') return 'Print';
  return 'Vorschau';
}

/**
 * Phone-style preview aligned with web MobilePhonePreview (simplified).
 */
export default function NotificationMobilePreview({
  data,
  variant = 'large',
}: {
  data: ComposeDraft;
  variant?: 'compact' | 'large';
}) {
  const L = variant === 'large';
  const type = data.type;
  const title =
    data.title?.trim() ||
    (type === 'email' ? 'Elementary School' : type === 'messenger' ? 'Schulfest am 20. Mai' : 'Mitteilung');
  const rawBody = data.body?.trim();
  const bodyText = rawBody
    ? stripHtmlToText(rawBody)
    : type === 'email'
      ? 'Liebe Eltern,\n\nhiermit laden wir Sie herzlich zum Elternabend ein…'
      : type === 'messenger'
        ? 'Liebe Eltern, bitte denken Sie an die Einverständniserklärung…'
        : 'Inhalt wird hier angezeigt';

  return (
    <View style={styles.wrap}>
      <Text style={[styles.previewCaption, L && styles.previewCaptionLg]}>Mobil-Vorschau</Text>
      <View style={[styles.phone, L && styles.phoneLg]}>
        <View style={styles.notch} />
        <View style={styles.statusBar}>
          <Text style={styles.time}>9:41</Text>
          <View style={styles.statusIcons}>
            <View style={styles.signal} />
            <View style={styles.battery} />
          </View>
        </View>
        <View style={styles.appHeader}>
          <Text style={styles.appHeaderText}>{typeLabel(type)}</Text>
        </View>
        <ScrollView
          style={[styles.content, L && styles.contentLg]}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.msgTitle, L && styles.msgTitleLg]} numberOfLines={3}>
            {title}
          </Text>
          <Text style={[styles.msgBody, L && styles.msgBodyLg]}>{bodyText}</Text>
        </ScrollView>
        <View style={[styles.homeBar, L && styles.homeBarLg]} />
      </View>
      <Text style={styles.recipientCaption}>Empfänger-Vorschau</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', width: '100%' },
  previewCaption: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  previewCaptionLg: { fontSize: 12, marginBottom: 10 },
  recipientCaption: {
    marginTop: 10,
    fontSize: 11,
    fontWeight: '600',
    color: '#9ca3af',
  },
  phone: {
    width: 148,
    borderRadius: 28,
    backgroundColor: '#0f172a',
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 6,
    borderWidth: 3,
    borderColor: '#1e293b',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  /** Large preview: realistic 6-inch phone mockup (~300x600). */
  phoneLg: {
    width: 300,
    minHeight: 600,
    alignSelf: 'center',
    borderRadius: 40,
    paddingHorizontal: 10,
    paddingTop: 14,
    paddingBottom: 12,
    borderWidth: 4,
    justifyContent: 'flex-start',
  },
  notch: {
    alignSelf: 'center',
    width: 56,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#334155',
    marginBottom: 6,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  time: { fontSize: 10, fontWeight: '700', color: '#e2e8f0' },
  statusIcons: { flexDirection: 'row', alignItems: 'center' },
  signal: { width: 14, height: 8, borderRadius: 1, backgroundColor: '#94a3b8' },
  battery: {
    width: 18,
    height: 9,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#94a3b8',
    marginLeft: 4,
  },
  appHeader: {
    backgroundColor: '#1e293b',
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 6,
  },
  appHeaderText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#f8fafc',
    textAlign: 'center',
  },
  content: {
    backgroundColor: '#fff',
    borderRadius: 10,
    maxHeight: 200,
    padding: 8,
  },
  contentLg: {
    flex: 1,
    minHeight: 440,
    maxHeight: 560,
    padding: 14,
    borderRadius: 14,
  },
  msgTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  msgTitleLg: { fontSize: 15 },
  msgBody: {
    fontSize: 10,
    lineHeight: 14,
    color: '#374151',
  },
  msgBodyLg: { fontSize: 13, lineHeight: 18 },
  homeBar: {
    alignSelf: 'center',
    width: 80,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#475569',
    marginTop: 8,
  },
  homeBarLg: { width: 88, marginTop: 10 },
});
