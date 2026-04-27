import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import NotificationMobilePreview from '@/components/NotificationMobilePreview';
import NotificationPrintPreview from '@/components/NotificationPrintPreview';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import {
  type ComposeDraft,
  type MsgType,
  saveDraftMessage,
  scheduleMessage,
  sendMessageNow,
} from '@/lib/commComposeSend';

const STEPS = [
  {
    key: 'type',
    title: 'Nachrichtentyp',
    /** Default; step 0 also uses print-specific line when `type === 'print'` (see `stepDescription`). */
    description: 'Wählen Sie, welche Art von Nachricht Sie versenden möchten.',
  },
  { key: 'content', title: 'Inhalt', description: 'Fügen Sie Ihrer Nachricht Inhalt hinzu.' },
  { key: 'recipients', title: 'Empfänger', description: 'Wählen Sie an wen Ihre Nachricht gesendet werden soll.' },
  { key: 'schedule', title: 'Zeitpunkt & Erinnerung', description: 'Wann soll Ihre Nachricht erscheinen?' },
  { key: 'preview', title: 'Überblick', description: 'Überprüfen Sie die zu sendende Nachricht.' },
];

function emptyDraft(): ComposeDraft {
  return {
    type: null,
    notifyByEmail: false,
    notifyByPush: false,
    title: '',
    subtitle: '',
    body: '',
    pollEnabled: false,
    pollQuestion: '',
    pollMultipleChoice: false,
    pollOptions: [],
    audienceIds: [],
    sendToChild: true,
    sendToParent: true,
    sendToGuardian: true,
    sendAtISO: undefined,
    reminders: [],
    stickyTill: '',
    hideAfter: '',
  };
}

type AudienceRow = { id: string; name: string; kind: string };

export default function NotificationComposeModal({
  visible,
  onClose,
  facilityId,
  academicYearId,
  createdByUserId,
}: {
  visible: boolean;
  onClose: () => void;
  facilityId: string;
  academicYearId: number | null;
  createdByUserId: string;
}) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const isMobile = winW < 480;

  const [step, setStep] = useState(0);
  const [data, setData] = useState<ComposeDraft>(emptyDraft);
  const [audiences, setAudiences] = useState<AudienceRow[]>([]);
  const [audLoading, setAudLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scheduleLocal, setScheduleLocal] = useState<Date>(() => new Date());
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [reminderText, setReminderText] = useState('');

  const showSidePreview = step <= 2 && winW >= 480;

  const stepDescription = useMemo(() => {
    if (step === 0 && data.type === 'print') {
      return 'Wählen Sie Druck für eine lokale PDF-Zusammenstellung (temporär).';
    }
    return STEPS[step].description;
  }, [step, data.type]);

  useEffect(() => {
    if (!visible) return;
    setStep(0);
    setData(emptyDraft());
    setReminderText('');
  }, [visible]);

  useEffect(() => {
    if (!visible || !facilityId) return;
    let c = false;
    (async () => {
      setAudLoading(true);
      try {
        let q = supabase
          .from('audience_groups')
          .select('id, name, kind, academic_year')
          .eq('facility_id', facilityId)
          .is('is_deleted', false)
          .order('created_at', { ascending: false });
        if (academicYearId) {
          q = q.eq('academic_year', academicYearId);
        }
        const { data: rows, error } = await q;
        if (c || error) return;
        setAudiences(
          (rows || []).map((r: any) => ({
            id: r.id,
            name: r.name,
            kind: r.kind,
          }))
        );
      } finally {
        if (!c) setAudLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [visible, facilityId, academicYearId]);

  const patch = useCallback((p: Partial<ComposeDraft>) => {
    setData((d) => ({ ...d, ...p }));
  }, []);

  const selectType = (t: MsgType) => {
    if (t === 'email') {
      patch({ type: t, notifyByEmail: true, notifyByPush: false, reminders: [] });
    } else if (t === 'notice_board') {
      patch({ type: t, notifyByPush: true, notifyByEmail: false, subtitle: '' });
    } else if (t === 'messenger') {
      patch({ type: t, notifyByEmail: false, notifyByPush: false, title: '' });
    } else if (t === 'print') {
      patch({ type: t, notifyByEmail: false, notifyByPush: false });
    } else {
      patch({ type: t });
    }
  };

  const valid = useMemo(() => {
    if (step === 0) return data.type != null;
    if (step === 1) return data.body.trim().length > 0;
    if (step === 2) return data.audienceIds.length > 0;
    if (step === 3) return true;
    return true;
  }, [step, data]);

  const parseReminders = (): number[] => {
    if (!reminderText.trim()) return [];
    return reminderText
      .split(/[,;\s]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n >= 0);
  };

  const next = () => {
    if (step < STEPS.length - 1 && valid) {
      if (step === 3) {
        patch({ reminders: parseReminders() });
      }
      setStep(step + 1);
    }
  };

  const prev = () => setStep(Math.max(0, step - 1));

  const runDraft = async () => {
    if (!academicYearId) {
      Alert.alert('Hinweis', 'Bitte wählen Sie ein Schuljahr auf der Übersichtsseite.');
      return;
    }
    setSubmitting(true);
    try {
      const { ok, error } = await saveDraftMessage(supabase, {
        facilityId,
        academicYear: academicYearId,
        createdByUserId,
        data: { ...data, reminders: parseReminders() },
      });
      if (!ok) {
        Alert.alert('Fehler', error || 'Entwurf konnte nicht gespeichert werden.');
        return;
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const runSend = async () => {
    if (!academicYearId) {
      Alert.alert('Hinweis', 'Bitte wählen Sie ein Schuljahr.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await sendMessageNow(supabase, {
        facilityId,
        academicYear: academicYearId,
        createdByUserId,
        data: { ...data, reminders: parseReminders() },
      });
      if (!result.ok) {
        Alert.alert('Fehler', result.error || 'Senden fehlgeschlagen.');
        return;
      }
      if (result.printDownloadUrl && FileSystem.cacheDirectory) {
        try {
          const name = `print-${Date.now()}.zip`;
          const dest = `${FileSystem.cacheDirectory}${name}`;
          const { uri } = await FileSystem.downloadAsync(result.printDownloadUrl, dest);
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri, {
              mimeType: 'application/zip',
              dialogTitle: 'Druck-Paket teilen',
            });
          } else {
            Alert.alert('Druck', 'ZIP wurde erstellt. Teilen ist auf diesem Gerät nicht verfügbar.');
          }
        } catch (e: any) {
          Alert.alert('Hinweis', e?.message || 'Download des Druck-Pakets fehlgeschlagen.');
        }
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const runSchedule = async () => {
    if (!academicYearId) {
      Alert.alert('Hinweis', 'Bitte wählen Sie ein Schuljahr.');
      return;
    }
    if (!data.sendAtISO) {
      Alert.alert('Hinweis', 'Bitte wählen Sie einen Zeitpunkt (Schritt 4).');
      return;
    }
    setSubmitting(true);
    try {
      const { ok, error } = await scheduleMessage(supabase, {
        facilityId,
        academicYear: academicYearId,
        createdByUserId,
        data: { ...data, reminders: parseReminders() },
      });
      if (!ok) {
        Alert.alert('Fehler', error || 'Planen fehlgeschlagen.');
        return;
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const toggleAudience = (id: string) => {
    setData((d) => {
      const set = new Set(d.audienceIds);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...d, audienceIds: Array.from(set) };
    });
  };

  const isLast = step === STEPS.length - 1;

  const stepBody = (
    <>
      {step === 0 ? (
        <View style={styles.typeCardBox}>
          <Text style={styles.typeSectionHeading}>Wo soll Ihre Nachricht auftauchen?</Text>
          <View style={styles.grid2}>
            <TypeCard
              label="E-Mail"
              sub="für längere Nachrichten mit Anhängen"
              active={data.type === 'email'}
              onPress={() => selectType('email')}
            />
            <TypeCard
              label="Direktnachricht"
              sub="für Dialog-orientierte Nachrichten"
              active={data.type === 'messenger'}
              onPress={() => selectType('messenger')}
            />
            <TypeCard
              label="Digitales Brett"
              sub="für Umfragen, generelle Informationen oder Ankündigungen"
              active={data.type === 'notice_board'}
              onPress={() => selectType('notice_board')}
            />
            <TypeCard
              label="Print"
              sub="für Briefe und Aushänge zum Ausdrucken"
              active={data.type === 'print'}
              onPress={() => selectType('print')}
            />
          </View>
        </View>
      ) : null}

      {step === 1 ? (
        <View>
          <Text style={styles.lbl}>Titel</Text>
          <TextInput style={styles.input} value={data.title} onChangeText={(t) => patch({ title: t })} placeholder="Titel" />
          <Text style={styles.lbl}>Nachricht</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            value={data.body}
            onChangeText={(t) => patch({ body: t })}
            placeholder="Text eingeben…"
            multiline
            textAlignVertical="top"
          />
        </View>
      ) : null}

      {step === 2 ? (
        <View>
          {audLoading ? <ActivityIndicator /> : null}
          <Text style={styles.lbl}>Verteiler</Text>
          {audiences.length === 0 ? (
            <Text style={styles.muted}>Keine Zielgruppen für dieses Schuljahr.</Text>
          ) : (
            audiences.map((a) => (
              <TouchableOpacity key={a.id} style={styles.audRow} onPress={() => toggleAudience(a.id)}>
                <View style={[styles.checkbox, data.audienceIds.includes(a.id) && styles.checkboxOn]}>
                  {data.audienceIds.includes(a.id) ? (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.audName}>{a.name}</Text>
                  <Text style={styles.audKind}>{a.kind}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      ) : null}

      {step === 3 ? (
        <View>
          <View style={styles.rowBetween}>
            <Text style={styles.lblInline}>An Kind</Text>
            <Switch value={data.sendToChild} onValueChange={(v) => patch({ sendToChild: v })} />
          </View>
          <View style={styles.rowBetween}>
            <Text style={styles.lblInline}>An Eltern</Text>
            <Switch value={data.sendToParent} onValueChange={(v) => patch({ sendToParent: v })} />
          </View>
          <View style={styles.rowBetween}>
            <Text style={styles.lblInline}>An Erziehungsberechtigte</Text>
            <Switch value={data.sendToGuardian} onValueChange={(v) => patch({ sendToGuardian: v })} />
          </View>
          {data.type !== 'email' ? (
            <>
              <View style={styles.rowBetween}>
                <Text style={styles.lblInline}>Push-Benachrichtigung</Text>
                <Switch value={data.notifyByPush} onValueChange={(v) => patch({ notifyByPush: v })} />
              </View>
              <View style={styles.rowBetween}>
                <Text style={styles.lblInline}>E-Mail</Text>
                <Switch value={data.notifyByEmail} onValueChange={(v) => patch({ notifyByEmail: v })} />
              </View>
            </>
          ) : null}
          <Text style={styles.lbl}>Geplant senden (optional)</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowSchedulePicker(true)}>
            <Text>
              {data.sendAtISO
                ? format(new Date(data.sendAtISO), 'dd.MM.yyyy HH:mm', { locale: de })
                : 'Sofort / kein Termin'}
            </Text>
          </TouchableOpacity>
          {data.sendAtISO ? (
            <TouchableOpacity onPress={() => patch({ sendAtISO: undefined })}>
              <Text style={styles.link}>Planung entfernen</Text>
            </TouchableOpacity>
          ) : null}
          {showSchedulePicker ? (
            <DateTimePicker
              value={data.sendAtISO ? new Date(data.sendAtISO) : scheduleLocal}
              mode="datetime"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(ev, d) => {
                if (Platform.OS === 'android') setShowSchedulePicker(false);
                if (ev.type === 'dismissed' || !d) return;
                setScheduleLocal(d);
                patch({ sendAtISO: d.toISOString() });
              }}
            />
          ) : null}
          {Platform.OS === 'ios' && showSchedulePicker ? (
            <TouchableOpacity style={styles.doneIos} onPress={() => setShowSchedulePicker(false)}>
              <Text style={styles.doneIosText}>Fertig</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={styles.lbl}>Erinnerungen (Tage, z.B. 1, 3, 7)</Text>
          <TextInput
            style={styles.input}
            value={reminderText}
            onChangeText={setReminderText}
            placeholder="optional"
          />
        </View>
      ) : null}

      {step === 4 ? (
        <View>
          <Text style={styles.previewLine}>
            <Text style={styles.previewBold}>Typ: </Text>
            {data.type || '—'}
          </Text>
          <Text style={styles.previewLine}>
            <Text style={styles.previewBold}>Titel: </Text>
            {data.title || '—'}
          </Text>
          <Text style={styles.previewLine}>
            <Text style={styles.previewBold}>Text: </Text>
            {data.body.slice(0, 200)}
            {data.body.length > 200 ? '…' : ''}
          </Text>
          <Text style={styles.previewLine}>
            <Text style={styles.previewBold}>Verteiler: </Text>
            {data.audienceIds.length} ausgewählt
          </Text>
          <Text style={styles.previewLine}>
            <Text style={styles.previewBold}>Zeitpunkt: </Text>
            {data.sendAtISO
              ? format(new Date(data.sendAtISO), 'dd.MM.yyyy HH:mm', { locale: de })
              : 'jetzt'}
          </Text>
        </View>
      ) : null}
    </>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      {...(Platform.OS === 'ios' ? ({ presentationStyle: 'fullScreen' } as const) : {})}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.fullRoot, { paddingTop: 0, paddingBottom: 0 }]}
      >
        <View style={[styles.sheet, { paddingTop: isMobile ? 8 : insets.top }]}>
          <View style={[styles.stepperTopRow, isMobile && styles.stepperTopRowMobile]}>
            {isMobile ? (
              <View style={styles.stepperMobileRow}>
                {STEPS.map((s, i) => (
                  <View key={s.key} style={i < STEPS.length - 1 ? styles.stepItemMobileGrow : styles.stepItemMobile}>
                    <View
                      style={[
                        styles.stepDot,
                        styles.stepDotMobile,
                        i < step && styles.stepDotDone,
                        i === step && styles.stepDotActive,
                      ]}
                    >
                      {i < step ? (
                        <Ionicons name="checkmark" size={12} color="#fff" />
                      ) : (
                        <Text style={[styles.stepNum, { fontSize: 12 }, i === step && { color: '#fff' }]}>{i + 1}</Text>
                      )}
                    </View>
                    {i < STEPS.length - 1 ? (
                      <View style={[styles.stepLineMobile, i < step && styles.stepLineDone]} />
                    ) : null}
                  </View>
                ))}
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.stepper}
                style={styles.stepperScroll}
              >
                {STEPS.map((s, i) => (
                  <View key={s.key} style={styles.stepItem}>
                    <View
                      style={[
                        styles.stepDot,
                        i < step && styles.stepDotDone,
                        i === step && styles.stepDotActive,
                      ]}
                    >
                      {i < step ? (
                        <Ionicons name="checkmark" size={16} color="#fff" />
                      ) : (
                        <Text style={styles.stepNum}>{i + 1}</Text>
                      )}
                    </View>
                    <Text style={[styles.stepLbl, i === step && styles.stepLblActive]} numberOfLines={1}>
                      {s.title}
                    </Text>
                    {i < STEPS.length - 1 ? <View style={[styles.stepLine, i < step && styles.stepLineDone]} /> : null}
                  </View>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity onPress={onClose} hitSlop={14} style={styles.closeBtn} accessibilityLabel="Schließen">
              <Ionicons name="close" size={isMobile ? 22 : 24} color="#64748b" />
            </TouchableOpacity>
          </View>

          <View style={styles.stepperDivider} />

          {!isMobile && <Text style={styles.stepDesc}>{stepDescription}</Text>}

          <View style={[styles.body, isMobile && { backgroundColor: '#f3f4f6' }]}>
            {showSidePreview ? (
              <View style={styles.splitRow}>
                <ScrollView
                  style={styles.formScroll}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.bodyContent}
                >
                  {stepBody}
                </ScrollView>
                <View style={styles.previewCol}>
                  {data.type === 'print' ? (
                    <NotificationPrintPreview data={data} large />
                  ) : (
                    <NotificationMobilePreview data={data} variant="large" />
                  )}
                </View>
              </View>
            ) : (
              <ScrollView
                style={styles.formScroll}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.bodyContent}
              >
                {stepBody}
                {step <= 2 ? (
                  <View style={styles.previewBelow}>
                    {data.type === 'print' ? (
                      <NotificationPrintPreview data={data} large />
                    ) : (
                      <NotificationMobilePreview data={data} variant="large" />
                    )}
                  </View>
                ) : null}
              </ScrollView>
            )}
          </View>

          <View style={[styles.footer, isMobile && styles.footerMobile, { paddingBottom: 0 }]}>
            <TouchableOpacity style={[styles.btnOutline, isMobile && styles.btnMobile]} onPress={prev} disabled={step === 0 || submitting}>
              <Ionicons name="chevron-back" size={16} color="#64748b" style={styles.footerIconLeft} />
              <Text style={styles.btnOutlineText}>Zurück</Text>
            </TouchableOpacity>
            {!isLast ? (
              <TouchableOpacity style={[styles.btnPrimary, isMobile && styles.btnMobile]} onPress={next} disabled={!valid || submitting}>
                <Text style={styles.btnPrimaryText}>Weiter</Text>
                <Ionicons name="chevron-forward" size={16} color="#fff" style={styles.footerIconRight} />
              </TouchableOpacity>
            ) : (
              <View style={styles.lastActions}>
                <TouchableOpacity style={[styles.btnOutline, isMobile && styles.btnMobile]} onPress={runDraft} disabled={submitting}>
                  <Text style={styles.btnOutlineText}>Entwurf</Text>
                </TouchableOpacity>
                {data.sendAtISO ? (
                  <TouchableOpacity style={[styles.btnPrimary, isMobile && styles.btnMobile]} onPress={runSchedule} disabled={submitting}>
                    {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Planen</Text>}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[styles.btnPrimary, isMobile && styles.btnMobile]} onPress={runSend} disabled={submitting}>
                    {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Senden</Text>}
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TypeCard({
  label,
  sub,
  active,
  onPress,
}: {
  label: string;
  sub: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.typeCard, active && styles.typeCardOn]} onPress={onPress}
      activeOpacity={0.85}>
      <Text style={[styles.typeTitle, active && styles.typeTitleOn]}>{label}</Text>
      <Text style={styles.typeSub}>{sub}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fullRoot: { flex: 1, backgroundColor: '#f3f4f6' },
  sheet: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 0,
    marginHorizontal: 0,
    maxWidth: 960,
    width: '100%',
    alignSelf: 'center',
  },
  splitRow: { flex: 1, flexDirection: 'row', minHeight: 0, alignItems: 'stretch' },
  formScroll: { flex: 1.65, minWidth: 0 },
  previewCol: {
    flex: 1.15,
    minWidth: 220,
    maxWidth: 400,
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 4,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: '#e5e7eb',
    backgroundColor: '#fafafa',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingBottom: 16,
  },
  stepperDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 0,
    marginBottom: 4,
  },
  previewBelow: { marginTop: 10, alignItems: 'center', paddingBottom: 0 },
  stepperTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 4,
  },
  stepperTopRowMobile: {
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 4,
    paddingRight: 4,
    alignItems: 'center',
  },
  stepperScroll: { flex: 1, minWidth: 0 },
  closeBtn: { paddingTop: 4, paddingLeft: 4 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
  },
  stepperMobile: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 2,
  },
  stepperMobileRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  stepItemMobile: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepItemMobileGrow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepLineMobile: {
    flex: 1,
    height: 2,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 4,
  },
  stepItem: { flexDirection: 'row', alignItems: 'center' },
  stepDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotMobile: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  stepDotActive: { backgroundColor: '#0f172a' },
  stepDotDone: { backgroundColor: '#111827' },
  stepNum: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  stepNumCurrent: { color: '#fff' },
  stepLbl: { fontSize: 11, color: '#9ca3af', marginLeft: 4, maxWidth: 88 },
  stepLblActive: { color: '#111827', fontWeight: '600' },
  stepLine: { width: 16, height: 2, backgroundColor: '#e5e7eb', marginHorizontal: 4 },
  stepLineDone: { backgroundColor: '#111827' },
  stepDesc: {
    fontSize: 14,
    color: '#64748b',
    paddingHorizontal: 16,
    marginTop: 0,
    marginBottom: 12,
    lineHeight: 20,
  },
  body: { flex: 1, minHeight: 0 },
  bodyContent: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 12 },
  typeCardBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    padding: 16,
  },
  typeSectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeCard: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fff',
  },
  typeCardOn: { borderWidth: 2, borderColor: '#111827', backgroundColor: '#f4f4f5' },
  typeTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  typeTitleOn: { color: '#111827' },
  typeSub: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  lbl: { fontSize: 13, fontWeight: '600', color: '#111827', marginBottom: 6, marginTop: 10 },
  lblInline: { fontSize: 14, color: '#111827', flex: 1 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
  },
  inputMulti: { minHeight: 120 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 8 },
  audRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: '#111827', borderColor: '#111827' },
  audName: { fontSize: 15, color: '#111827' },
  audKind: { fontSize: 12, color: '#9ca3af' },
  muted: { color: '#9ca3af', marginVertical: 8 },
  dateBtn: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#f9fafb',
  },
  link: { color: '#111827', marginTop: 8, fontSize: 14 },
  doneIos: { alignItems: 'center', padding: 8 },
  doneIosText: { color: '#111827', fontWeight: '600' },
  previewLine: { fontSize: 14, color: '#374151', marginTop: 8, lineHeight: 20 },
  previewBold: { fontWeight: '700', color: '#111827' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    gap: 8,
    backgroundColor: '#fff',
  },
  footerMobile: {
    flexWrap: 'nowrap',
    paddingHorizontal: 10,
    paddingTop: 0,
  },
  btnMobile: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 0,
  },
  btnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  footerIconLeft: { marginRight: 4 },
  btnOutlineText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 120,
    justifyContent: 'center',
  },
  footerIconRight: { marginLeft: 6 },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  lastActions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap', flex: 1, marginLeft: 8 },
});
