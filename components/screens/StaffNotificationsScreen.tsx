import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Modal,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addDays, format, parseISO, startOfWeek, subWeeks } from 'date-fns';
import { de } from 'date-fns/locale';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import type { SingleFacilityScope, SupervisorFacilityScope } from '@/lib/staffFacilityScope';
import NotificationComposeModal from '@/components/NotificationComposeModal';
import { SCREEN_HEADER_TOP_PAD } from '@/constants/theme';

type Scope = SingleFacilityScope | SupervisorFacilityScope;

type Channel = 'email' | 'push' | 'in_app';

type MsgStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'canceled';

type MsgRow = {
  id: string;
  facility_id: string;
  title: string;
  type: string | null;
  status: string | null;
  created_at: string;
  createdBy: string;
  scheduledAt: string | null;
  channels: Channel[];
  audiences: { id: string; name: string }[];
  recipients: number;
  deliveryRate?: number;
  openRate?: number;
  allow_email: boolean;
  allow_push: boolean;
  allow_inapp: boolean;
};

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function displayUserName(u: {
  name?: string | null;
  first_name?: string | null;
  family_name?: string | null;
}): string {
  const n = (u.name || '').trim();
  if (n) return n;
  const fn = [u.first_name, u.family_name].filter(Boolean).join(' ').trim();
  return fn || '—';
}

function channelLabel(c: Channel): string {
  if (c === 'email') return 'E-Mail';
  if (c === 'push') return 'Push';
  return 'In-App';
}

function statusLabelDe(s: string | null): string {
  switch (s) {
    case 'draft':
      return 'Entwurf';
    case 'scheduled':
      return 'Geplant';
    case 'sending':
      return 'Sendet';
    case 'sent':
      return 'Gesendet';
    case 'failed':
      return 'Fehlgeschlagen';
    case 'canceled':
      return 'Abgebrochen';
    default:
      return s || '—';
  }
}

function primaryFacilityIdFromScope(s: Scope): string {
  return s.mode === 'supervisor' ? s.primaryFacilityId : s.facilityId;
}

export default function StaffNotificationsScreen({
  scopeLoader,
}: {
  scopeLoader: () => Promise<Scope | null>;
}) {
  const insets = useSafeAreaInsets();

  const [scope, setScope] = useState<Scope | null>(null);
  const [rows, setRows] = useState<MsgRow[]>([]);
  const [facilityNames, setFacilityNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [academicYearOptions, setAcademicYearOptions] = useState<Array<{ id: number; year: string }>>([]);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<number | null>(null);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | MsgStatus>('all');

  const [selected, setSelected] = useState<MsgRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [composeOpen, setComposeOpen] = useState(false);
  const [staffUserId, setStaffUserId] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: years } = await supabase.from('academic_years').select('id, year').order('year', { ascending: false });
      setAcademicYearOptions((years || []) as Array<{ id: number; year: string }>);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) {
        setStaffUserId('');
        return;
      }
      const { data: userRow } = await supabase.from('users').select('id').eq('auth_id', authUser.id).single();
      setStaffUserId(userRow?.id ? String(userRow.id) : '');
    })();
  }, []);

  useEffect(() => {
    if (!academicYearOptions.length || !scope) return;
    const fromScope = scope.academicYearId ? Number(scope.academicYearId) : null;
    setSelectedAcademicYearId((prev) => {
      if (prev != null && academicYearOptions.some((y) => y.id === prev)) return prev;
      if (fromScope != null && academicYearOptions.some((y) => y.id === fromScope)) return fromScope;
      return academicYearOptions[0]?.id ?? null;
    });
  }, [scope, academicYearOptions]);

  const load = useCallback(async () => {
    setError(null);
    const s = await scopeLoader();
    setScope(s);
    if (!s?.facilityIds?.length) {
      setRows([]);
      return;
    }

    const { data: facRows } = await supabase.from('facilities').select('id, name').in('id', s.facilityIds);
    const fn: Record<string, string> = {};
    (facRows || []).forEach((f: any) => {
      if (f.id) fn[String(f.id)] = String(f.name || f.id);
    });
    setFacilityNames(fn);

    let q = supabase
      .from('comm_messages')
      .select(
        'id, facility_id, type, status, title, created_by, created_at, allow_email, allow_push, allow_inapp'
      )
      .in('facility_id', s.facilityIds)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    if (selectedAcademicYearId != null) {
      q = q.eq('academic_year', selectedAcademicYearId);
    }
    const { data: msgs, error: msgErr } = await q.limit(500);
    if (msgErr) throw msgErr;
    const messageIds = (msgs || []).map((m: any) => m.id);

    const schedulesMap = new Map<string, string>();
    if (messageIds.length) {
      const { data: sched } = await supabase.from('comm_schedules').select('message_id, send_at').in('message_id', messageIds);
      (sched || []).forEach((row: any) => {
        if (row.message_id) schedulesMap.set(row.message_id, row.send_at);
      });
    }

    const creatorIds = [...new Set((msgs || []).map((m: any) => m.created_by).filter(Boolean))];
    const creatorNameMap = new Map<string, string>();
    if (creatorIds.length) {
      const { data: creators } = await supabase
        .from('users')
        .select('id, name, first_name, family_name')
        .in('id', creatorIds);
      (creators || []).forEach((u: any) => creatorNameMap.set(u.id, displayUserName(u)));
    }

    const audiencesByMsg = new Map<string, { id: string; name: string }[]>();
    if (messageIds.length) {
      const { data: audLinks } = await supabase
        .from('comm_message_audiences')
        .select('message_id, audience_id')
        .in('message_id', messageIds);
      const audienceIds = [...new Set((audLinks || []).map((a: any) => a.audience_id))];
      const audienceMap = new Map<string, string>();
      if (audienceIds.length) {
        const { data: audiences } = await supabase
          .from('audience_groups')
          .select('id, name')
          .in('id', audienceIds)
          .eq('is_deleted', false);
        (audiences || []).forEach((a: any) => audienceMap.set(a.id, a.name));
      }
      (audLinks || []).forEach((l: any) => {
        const list = audiencesByMsg.get(l.message_id) || [];
        list.push({
          id: l.audience_id,
          name: audienceMap.get(l.audience_id) || l.audience_id,
        });
        audiencesByMsg.set(l.message_id, list);
      });
    }

    const recipientsByMsg = new Map<
      string,
      { total: number; delivered: number; pushTotal: number; pushOpened: number }
    >();
    if (messageIds.length) {
      const { data: recs } = await supabase
        .from('comm_recipients')
        .select('message_id, status, channel')
        .in('message_id', messageIds);
      (recs || []).forEach((r: any) => {
        const prev = recipientsByMsg.get(r.message_id) || {
          total: 0,
          delivered: 0,
          pushTotal: 0,
          pushOpened: 0,
        };
        prev.total += 1;
        if (r.status === 'delivered') prev.delivered += 1;
        if (r.channel === 'push') {
          prev.pushTotal += 1;
          if (r.status === 'opened') prev.pushOpened += 1;
        }
        recipientsByMsg.set(r.message_id, prev);
      });
    }

    const built: MsgRow[] = (msgs || []).map((m: any) => {
      const channels: Channel[] = [];
      if (m.allow_email) channels.push('email');
      if (m.allow_push) channels.push('push');
      if (m.allow_inapp) channels.push('in_app');
      const rec = recipientsByMsg.get(m.id) || {
        total: 0,
        delivered: 0,
        pushTotal: 0,
        pushOpened: 0,
      };
      const t = m.title || '(ohne Titel)';
      return {
        id: m.id,
        facility_id: m.facility_id,
        title: stripHtml(String(t)) || '(ohne Titel)',
        type: m.type,
        status: m.status,
        created_at: m.created_at,
        createdBy: creatorNameMap.get(m.created_by) || '—',
        scheduledAt: schedulesMap.get(m.id) || null,
        channels,
        audiences: audiencesByMsg.get(m.id) || [],
        recipients: rec.total,
        deliveryRate: rec.total ? rec.delivered / rec.total : undefined,
        openRate: rec.pushTotal > 0 ? rec.pushOpened / rec.pushTotal : undefined,
        allow_email: !!m.allow_email,
        allow_push: !!m.allow_push,
        allow_inapp: !!m.allow_inapp,
      };
    });

    setRows(built);
    setSelected((prev) => (prev ? built.find((r) => r.id === prev.id) || null : null));
  }, [scopeLoader, selectedAcademicYearId]);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      try {
        await load();
      } catch (e: any) {
        if (!c) setError(e?.message || 'Mitteilungen konnten nicht geladen werden');
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await load();
    } catch (e: any) {
      setError(e?.message || 'Mitteilungen konnten nicht geladen werden');
    }
    setRefreshing(false);
  };

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        const matchesQ = q.trim()
          ? r.title.toLowerCase().includes(q.toLowerCase()) ||
            r.audiences.some((a) => a.name.toLowerCase().includes(q.toLowerCase()))
          : true;
        const matchesStatus = status === 'all' ? true : r.status === status;
        return matchesQ && matchesStatus;
      }),
    [rows, q, status]
  );

  const stats = useMemo(() => {
    const weeks = 16;
    const now = new Date();
    let sentTotal16w = 0;
    let scheduledTotal16w = 0;
    let draftsTotal16w = 0;
    for (let i = weeks - 1; i >= 0; i--) {
      const weekStart = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
      const weekEnd = addDays(weekStart, 7);
      const inRange = (d: string | null | undefined) => {
        if (!d) return false;
        const dt = new Date(d);
        return dt >= weekStart && dt < weekEnd;
      };
      sentTotal16w += rows.filter((r) => r.status === 'sent' && inRange(r.created_at)).length;
      scheduledTotal16w += rows.filter((r) => r.status === 'scheduled' && inRange(r.scheduledAt || null)).length;
      draftsTotal16w += rows.filter((r) => r.status === 'draft' && inRange(r.created_at)).length;
    }
    const allRates = rows.map((r) => r.deliveryRate).filter((n): n is number => typeof n === 'number');
    const avgDeliveryRate = allRates.length ? allRates.reduce((a, b) => a + b, 0) / allRates.length : 0;
    return { sentTotal16w, scheduledTotal16w, draftsTotal16w, avgDeliveryRate };
  }, [rows]);

  const deleteMessage = async (messageId: string) => {
    try {
      const { error: err } = await supabase.from('comm_messages').update({ is_deleted: true }).eq('id', messageId);
      if (err) throw err;
      await load();
    } catch (e: any) {
      Alert.alert('Fehler', e?.message || 'Löschen fehlgeschlagen');
    }
  };

  const openDetail = (row: MsgRow) => {
    setSelected(row);
    setDetailOpen(true);
  };

  const fmtDt = (iso: string) => {
    try {
      return format(parseISO(iso), 'dd.MM.yyyy HH:mm', { locale: de });
    } catch {
      return iso;
    }
  };

  const formatRowDate = (r: MsgRow) => {
    const d = r.scheduledAt || r.created_at;
    if (!d) return '—';
    try {
      return format(parseISO(String(d).slice(0, 19)), 'dd.MM.yyyy', { locale: de });
    } catch {
      return '—';
    }
  };

  const formatRecipients = (r: MsgRow) => {
    if (!r.recipients) return '—';
    if (typeof r.openRate === 'number') {
      const opened = Math.round(r.openRate * r.recipients);
      return `${opened}/${r.recipients} geöffnet`;
    }
    return `${r.recipients}`;
  };

  const firstAudience = (r: MsgRow) => (r.audiences.length > 0 ? r.audiences[0].name : '—');

  const statusFilterOptions = useMemo(
    () =>
      [
        ['all', 'Alle'],
        ['draft', 'Entwurf'],
        ['scheduled', 'Geplant'],
        ['sending', 'Sendet'],
        ['sent', 'Gesendet'],
        ['failed', 'Fehlgeschlagen'],
        ['canceled', 'Abgebrochen'],
      ] as const,
    []
  );

  const statusFilterLabel =
    statusFilterOptions.find(([v]) => v === status)?.[1] ?? 'Alle';

  const detailBody = useMemo(() => {
    if (!selected) return null;
    const fac = facilityNames[selected.facility_id];
    return (
      <ScrollView style={styles.detailScroll}>
        <Text style={styles.detailTitle}>{selected.title}</Text>
        {fac ? <Text style={styles.detailMeta}>Einrichtung: {fac}</Text> : null}
        <Text style={styles.detailMeta}>
          {selected.type || '—'} · {statusLabelDe(selected.status)}
        </Text>
        <Text style={styles.detailMeta}>Erstellt von: {selected.createdBy}</Text>
        <Text style={styles.detailMeta}>Erstellt: {fmtDt(selected.created_at)}</Text>
        {selected.scheduledAt ? (
          <Text style={styles.detailMeta}>Geplant: {fmtDt(selected.scheduledAt)}</Text>
        ) : null}

        <Text style={styles.detailSection}>Kanäle</Text>
        <View style={styles.pillRow}>
          {selected.channels.length ? (
            selected.channels.map((c) => (
              <View key={c} style={styles.pill}>
                <Text style={styles.pillText}>{channelLabel(c)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.muted}>Keine Kanäle gewählt</Text>
          )}
        </View>

        <Text style={styles.detailSection}>Zielgruppen</Text>
        {selected.audiences.length ? (
          <View style={styles.pillRow}>
            {selected.audiences.map((a) => (
              <View key={a.id} style={styles.pillMuted}>
                <Text style={styles.pillTextMuted}>{a.name}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.muted}>Keine Zielgruppe verknüpft</Text>
        )}

        <Text style={styles.detailSection}>Zustellung</Text>
        <Text style={styles.detailMeta}>Empfänger: {selected.recipients}</Text>
        {selected.deliveryRate != null ? (
          <Text style={styles.detailMeta}>Zugestellt: {Math.round(selected.deliveryRate * 100)}%</Text>
        ) : null}
        {selected.openRate != null ? (
          <Text style={styles.detailMeta}>Push geöffnet: {Math.round(selected.openRate * 100)}%</Text>
        ) : null}
      </ScrollView>
    );
  }, [selected, facilityNames]);

  const facilityIdForCompose = scope ? primaryFacilityIdFromScope(scope) : '';

  const tableHeader = (
    <View style={styles.tableHeaderRow}>
      <Text style={[styles.th, styles.thTitle]}>Titel</Text>
      <Text style={[styles.th, styles.thDate]}>Datum</Text>
      <Text style={[styles.th, styles.thDist]}>Verteiler</Text>
      <Text style={[styles.th, styles.thRec]}>Empfänger</Text>
      <Text style={[styles.th, styles.thStat]}>Status</Text>
    </View>
  );

  const messagesList = (
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      style={styles.tableList}
      contentContainerStyle={filtered.length === 0 ? styles.tableListContentEmpty : styles.tableListContent}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={
        <Text style={styles.empty}>{loading ? '' : 'No messages found.'}</Text>
      }
      renderItem={({ item }) => {
        const sel = selected?.id === item.id;
        return (
          <TouchableOpacity
            style={[styles.tableDataRow, sel && styles.tableDataRowSel]}
            onPress={() => openDetail(item)}
            onLongPress={() => setConfirmDeleteId(item.id)}
            activeOpacity={0.7}
          >
            <Text style={[styles.td, styles.tdTitle]} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={[styles.td, styles.tdDate]} numberOfLines={1}>
              {formatRowDate(item)}
            </Text>
            <Text style={[styles.td, styles.tdDist]} numberOfLines={2}>
              {firstAudience(item)}
            </Text>
            <Text style={[styles.td, styles.tdRec]} numberOfLines={2}>
              {formatRecipients(item)}
            </Text>
            <Text style={[styles.td, styles.tdStat]} numberOfLines={1}>
              {statusLabelDe(item.status)}
            </Text>
          </TouchableOpacity>
        );
      }}
    />
  );

  /** One bordered card: grey header row + scrollable body (matches web — no separate header “card”). */
  const tableBlock = (
    <View style={styles.tableShell}>
      {tableHeader}
      {messagesList}
    </View>
  );

  const selectedYearLabel =
    selectedAcademicYearId == null
      ? 'Alle Jahre'
      : academicYearOptions.find((y) => y.id === selectedAcademicYearId)?.year || 'Schuljahr';

  return (
    <View style={[styles.root, { paddingTop: insets.top + SCREEN_HEADER_TOP_PAD, paddingBottom: insets.bottom + 8 }]}>
      <View style={styles.headerRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.h1}>Elternbenachrichtigung</Text>
          <Text style={styles.sub}>Nachrichten an Eltern erstellen, planen und verwalten</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.yearGroup}>
            <Text style={styles.yearLabel}>Akademisches Jahr</Text>
            <TouchableOpacity style={styles.yearChip} onPress={() => setYearPickerOpen(true)}>
              <Text style={styles.yearChipText} numberOfLines={1}>
                {selectedYearLabel}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#374151" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => {
              if (!staffUserId) {
                Alert.alert('Hinweis', 'Benutzer konnte nicht geladen werden.');
                return;
              }
              if (selectedAcademicYearId == null) {
                Alert.alert(
                  'Schuljahr',
                  'Bitte wählen Sie ein konkretes Schuljahr aus (nicht „Alle Jahre“), um eine Nachricht zu erstellen.'
                );
                return;
              }
              setComposeOpen(true);
            }}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.createBtnText}>Nachricht erstellen</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLbl}>Gesendet</Text>
          <Text style={styles.statVal}>{stats.sentTotal16w}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLbl}>Geplant</Text>
          <Text style={styles.statVal}>{stats.scheduledTotal16w}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLbl}>Entwürfe</Text>
          <Text style={styles.statVal}>{stats.draftsTotal16w}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLbl}>Ø Öffnungsrate</Text>
          <Text style={styles.statVal}>{Math.round(stats.avgDeliveryRate * 100)}%</Text>
        </View>
      </View>

      <View style={styles.searchFilterRow}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color="#9ca3af" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Suchen…"
            value={q}
            onChangeText={setQ}
            placeholderTextColor="#9ca3af"
          />
        </View>
        <TouchableOpacity
          style={styles.filterTrigger}
          onPress={() => setFilterSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Status filtern"
        >
          <Text style={styles.filterTriggerText} numberOfLines={1}>
            {statusFilterLabel}
          </Text>
          <Ionicons name="chevron-down" size={18} color="#374151" />
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.err}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <View style={styles.tableArea}>{tableBlock}</View>
      )}

      <Modal visible={detailOpen} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setDetailOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            {detailBody}
            <TouchableOpacity style={styles.closeBtn} onPress={() => setDetailOpen(false)}>
              <Text style={styles.closeBtnText}>Schließen</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={filterSheetOpen} animationType="slide" transparent onRequestClose={() => setFilterSheetOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setFilterSheetOpen(false)}>
          <Pressable style={styles.filterBottomSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.filterSheetHandle} />
            <Text style={styles.filterSheetTitle}>Status</Text>
            <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
              {statusFilterOptions.map(([val, label]) => (
                <TouchableOpacity
                  key={val}
                  style={styles.filterSheetRow}
                  onPress={() => {
                    setStatus(val);
                    setFilterSheetOpen(false);
                  }}
                >
                  <Text style={styles.filterSheetRowText}>{label}</Text>
                  {status === val ? <Ionicons name="checkmark" size={22} color="#0a7ea4" /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={yearPickerOpen} transparent animationType="fade">
        <Pressable style={styles.modalBackdropLight} onPress={() => setYearPickerOpen(false)}>
          <Pressable style={styles.pickSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.pickTitle}>Akademisches Jahr</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              <TouchableOpacity
                style={styles.pickRow}
                onPress={() => {
                  setSelectedAcademicYearId(null);
                  setYearPickerOpen(false);
                }}
              >
                <Text style={styles.pickRowText}>Alle Jahre</Text>
                {selectedAcademicYearId == null ? <Ionicons name="checkmark" size={20} color="#0a7ea4" /> : null}
              </TouchableOpacity>
              {academicYearOptions.map((y) => (
                <TouchableOpacity
                  key={y.id}
                  style={styles.pickRow}
                  onPress={() => {
                    setSelectedAcademicYearId(y.id);
                    setYearPickerOpen(false);
                  }}
                >
                  <Text style={styles.pickRowText}>{y.year}</Text>
                  {y.id === selectedAcademicYearId ? <Ionicons name="checkmark" size={20} color="#0a7ea4" /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!confirmDeleteId} transparent animationType="fade">
        <Pressable style={styles.modalBackdropLight} onPress={() => setConfirmDeleteId(null)}>
          <Pressable style={styles.confirmSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.confirmTitle}>Nachricht löschen</Text>
            <Text style={styles.confirmBody}>
              Sind Sie sicher? Diese Aktion kann nicht rückgängig gemacht werden.
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.btnOutline} onPress={() => setConfirmDeleteId(null)}>
                <Text style={styles.btnOutlineText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnDanger}
                onPress={() => {
                  if (confirmDeleteId) {
                    deleteMessage(confirmDeleteId);
                    setConfirmDeleteId(null);
                  }
                }}
              >
                <Text style={styles.btnDangerText}>Löschen</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {facilityIdForCompose && staffUserId ? (
        <NotificationComposeModal
          visible={composeOpen}
          onClose={() => {
            setComposeOpen(false);
            load();
          }}
          facilityId={facilityIdForCompose}
          academicYearId={selectedAcademicYearId}
          createdByUserId={staffUserId}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16, backgroundColor: '#f9fafb' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
    flexWrap: 'wrap',
  },
  titleBlock: { flex: 1, minWidth: 200 },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 10,
    alignSelf: 'flex-end',
  },
  yearGroup: { alignItems: 'flex-end' },
  yearLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4, alignSelf: 'stretch', textAlign: 'right' },
  h1: { fontSize: 20, fontWeight: '700', color: '#111827' },
  sub: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  yearChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    minWidth: 112,
    maxWidth: 168,
  },
  yearChipText: { fontSize: 14, color: '#111827', fontWeight: '500', flex: 1 },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0f172a',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  statCard: {
    flex: 1,
    minWidth: '22%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
  },
  statLbl: { fontSize: 12, color: '#6b7280' },
  statVal: { fontSize: 18, fontWeight: '700', color: '#111827', marginTop: 4 },
  searchFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  searchWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
  },
  searchIcon: { marginRight: 6 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 10, color: '#111827' },
  filterTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 110,
    maxWidth: 160,
  },
  filterTriggerText: { fontSize: 14, color: '#111827', fontWeight: '500', flex: 1 },
  filterBottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
    maxHeight: '55%',
  },
  filterSheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e5e7eb',
    marginTop: 10,
    marginBottom: 12,
  },
  filterSheetTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 8 },
  filterSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  filterSheetRowText: { fontSize: 16, color: '#111827' },
  tableArea: { flex: 1, minHeight: 0 },
  tableShell: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
    minHeight: 200,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  tableList: { flex: 1 },
  tableListContent: { paddingBottom: 8 },
  tableListContentEmpty: { flexGrow: 1, justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 16 },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  th: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  thTitle: { flex: 2, minWidth: 0 },
  thDate: { flex: 1, minWidth: 0 },
  thDist: { flex: 1, minWidth: 0 },
  thRec: { flex: 1, minWidth: 0 },
  thStat: { flex: 1, minWidth: 0 },
  tableDataRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
  },
  tableDataRowSel: { backgroundColor: '#f0f9ff' },
  td: { fontSize: 13, color: '#374151' },
  tdTitle: { flex: 2, minWidth: 0, fontWeight: '600', color: '#111827', paddingRight: 6 },
  tdDate: { flex: 1, minWidth: 0 },
  tdDist: { flex: 1, minWidth: 0 },
  tdRec: { flex: 1, minWidth: 0 },
  tdStat: { flex: 1, minWidth: 0 },
  err: { color: '#b91c1c', marginBottom: 8 },
  detailScroll: { flex: 1 },
  empty: { color: '#9ca3af', textAlign: 'center', fontSize: 14 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardSel: { borderColor: '#0a7ea4', backgroundColor: '#f0f9ff' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827', flex: 1 },
  facLine: { fontSize: 13, color: '#0a7ea4', marginTop: 4 },
  tableRow: { flexDirection: 'row', marginTop: 6, gap: 8 },
  colLbl: { width: 88, fontSize: 12, color: '#9ca3af', fontWeight: '600' },
  colVal: { flex: 1, fontSize: 13, color: '#374151' },
  muted: { fontSize: 14, color: '#9ca3af' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  pill: { backgroundColor: '#e0f2fe', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 12, color: '#0369a1', fontWeight: '600' },
  pillMuted: { backgroundColor: '#f3f4f6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillTextMuted: { fontSize: 12, color: '#4b5563' },
  pillMini: { backgroundColor: '#eef2ff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  pillMiniText: { fontSize: 11, color: '#4338ca' },
  detailTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 8 },
  detailMeta: { fontSize: 14, color: '#374151', marginTop: 4 },
  detailSection: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 16, marginBottom: 8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalBackdropLight: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '88%',
  },
  pickSheet: { backgroundColor: '#fff', borderRadius: 12, padding: 16, maxHeight: '80%' },
  pickTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  pickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  pickRowText: { fontSize: 16, color: '#111827' },
  confirmSheet: { backgroundColor: '#fff', borderRadius: 12, padding: 20, maxWidth: 400, alignSelf: 'center', width: '100%' },
  confirmTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  confirmBody: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  btnOutline: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  btnOutlineText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  btnDanger: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#b91c1c' },
  btnDangerText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  closeBtn: { marginTop: 16, alignSelf: 'center', padding: 12 },
  closeBtnText: { color: '#0a7ea4', fontWeight: '700', fontSize: 16 },
});
