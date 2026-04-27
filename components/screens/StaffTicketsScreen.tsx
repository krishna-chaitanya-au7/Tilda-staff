import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { SCREEN_HEADER_TOP_PAD } from '@/constants/theme';
import { useIsMobile } from '@/hooks/use-is-mobile';
import type { SingleFacilityScope, SupervisorFacilityScope } from '@/lib/staffFacilityScope';

type Scope = SingleFacilityScope | SupervisorFacilityScope;

type UserStub = { id?: string; first_name?: string; family_name?: string; name?: string };

export type TicketRow = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  category?: string;
  created_by?: UserStub | null;
  created_by_user?: UserStub | null;
  snippet?: string;
};

type Tm = {
  id: string;
  message: string;
  created_at: string;
  user_id: string;
  users?: { first_name?: string; family_name?: string; name?: string; user_type?: string | null };
};

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'closed', label: 'Closed' },
];

function formatDisplayDate(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso.includes('T') ? iso : `${iso}T12:00:00`), 'dd/MM/yyyy', { locale: de });
  } catch {
    return iso;
  }
}

function userLabel(u?: UserStub | null): string {
  if (!u) return '—';
  const n = [u.first_name, u.family_name].filter(Boolean).join(' ').trim();
  if (n) return n;
  if (u.name) return u.name;
  return '—';
}

function childLabel(t: TicketRow): string {
  return userLabel(t.created_by as UserStub);
}

function creatorLabel(t: TicketRow): string {
  if (t.created_by_user) return userLabel(t.created_by_user);
  return childLabel(t);
}

/** Parents/children portal — left; staff & facility roles — right (support-desk layout). */
function isPortalUserMessage(u?: { user_type?: string | null }): boolean {
  const t = String(u?.user_type || '').toLowerCase();
  return ['user', 'child', 'parent', 'guardian'].includes(t);
}

export default function StaffTicketsScreen({
  scopeLoader,
}: {
  scopeLoader: () => Promise<Scope | null>;
}) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const isMobile = useIsMobile();
  const msgListRef = useRef<FlatList>(null);
  const [infoExpanded, setInfoExpanded] = useState(false);

  const [rawTickets, setRawTickets] = useState<TicketRow[]>([]);
  const [selected, setSelected] = useState<TicketRow | null>(null);
  const [messages, setMessages] = useState<Tm[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  /** Tiny lift so the composer clears the keyboard edge (1px) when open. */
  const [keyboardOpenNudgePx, setKeyboardOpenNudgePx] = useState(0);

  const availableCategories = useMemo(() => {
    const s = new Set<string>();
    rawTickets.forEach((t) => {
      if (t.category) s.add(t.category);
    });
    return Array.from(s).sort();
  }, [rawTickets]);

  const tickets = useMemo(() => {
    let list = rawTickets;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          childLabel(t).toLowerCase().includes(q) ||
          creatorLabel(t).toLowerCase().includes(q)
      );
    }
    if (filterStatus !== 'all') {
      list = list.filter((t) => String(t.status).toLowerCase() === filterStatus.toLowerCase());
    }
    if (filterCategory !== 'all') {
      list = list.filter((t) => String(t.category || '') === filterCategory);
    }
    return list;
  }, [rawTickets, searchQuery, filterStatus, filterCategory]);

  const loadLastSnippets = async (ticketIds: string[]) => {
    if (!ticketIds.length) return new Map<string, string>();
    const { data } = await supabase
      .from('ticket_messages')
      .select('ticket_id, message, created_at')
      .in('ticket_id', ticketIds)
      .order('created_at', { ascending: false });
    const map = new Map<string, string>();
    (data || []).forEach((row: any) => {
      if (!map.has(row.ticket_id) && row.message) {
        const text = String(row.message).replace(/\s+/g, ' ').trim();
        map.set(row.ticket_id, text.length > 80 ? `${text.slice(0, 80)}…` : text);
      }
    });
    return map;
  };

  const loadTickets = useCallback(async () => {
    setError(null);
    const s = await scopeLoader();
    if (!s?.facilityIds?.length) {
      setRawTickets([]);
      return;
    }
    const { data, error: qErr } = await supabase
      .from('ticket_assignees')
      .select(
        `
        ticket_id,
        tickets!inner (
          id,
          title,
          status,
          created_at,
          updated_at,
          category,
          is_deleted,
          created_by:users!tickets_created_by_fkey(id, first_name, family_name, name),
          created_by_user:users!tickets_created_by_user_fkey(id, first_name, family_name, name)
        )
      `
      )
      .in('facility_id', s.facilityIds)
      .eq('tickets.is_deleted', false)
      .order('created_at', { foreignTable: 'tickets', ascending: false });
    if (qErr) throw qErr;
    const list = (data || []).map((row: any) => row.tickets).filter(Boolean) as TicketRow[];
    const ids = list.map((t) => t.id);
    const snippets = await loadLastSnippets(ids);
    setRawTickets(
      list.map((t) => ({
        ...t,
        snippet: snippets.get(t.id),
      }))
    );
  }, [scopeLoader]);

  const loadMessages = useCallback(async (ticketId: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoadingMsg(true);
    const { data, error: mErr } = await supabase
      .from('ticket_messages')
      .select(
        `
        id,
        message,
        created_at,
        user_id,
        users:user_id ( first_name, family_name, name, user_type )
      `
      )
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
    if (!opts?.silent) setLoadingMsg(false);
    if (mErr) {
      setMessages([]);
      return;
    }
    const normalized = (data || []).map((row: any) => ({
      ...row,
      users: Array.isArray(row.users) ? row.users[0] : row.users,
    }));
    setMessages(normalized as Tm[]);
  }, []);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      try {
        await loadTickets();
      } catch (e: any) {
        if (!c) setError(e?.message || 'Tickets konnten nicht geladen werden');
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [loadTickets]);

  useEffect(() => {
    if (selected?.id) loadMessages(selected.id);
    else setMessages([]);
  }, [selected?.id, loadMessages]);

  useEffect(() => {
    if (messages.length && !loadingMsg) {
      setTimeout(() => msgListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, loadingMsg]);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subShow = Keyboard.addListener(showEvt, () => setKeyboardOpenNudgePx(1));
    const subHide = Keyboard.addListener(hideEvt, () => setKeyboardOpenNudgePx(0));
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadTickets();
      if (selected) await loadMessages(selected.id);
    } catch {
      /* ignore */
    }
    setRefreshing(false);
  };

  const updateTicketStatus = async (newStatus: string) => {
    if (!selected) return;
    setStatusPickerOpen(false);
    const { error: uErr } = await supabase.from('tickets').update({ status: newStatus }).eq('id', selected.id);
    if (!uErr) {
      setSelected({ ...selected, status: newStatus });
      await loadTickets();
    }
  };

  const openUserDetails = (userId: string | undefined) => {
    if (!userId) return;
    router.push({ pathname: '/user-details', params: { id: userId } } as any);
  };

  const sendMessage = async () => {
    if (!selected || !draft.trim() || sending) return;
    if (selected.status === 'closed') return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: urow } = await supabase.from('users').select('id').eq('auth_id', user.id).single();
    if (!urow?.id) return;
    const text = draft.trim();
    setSending(true);
    setDraft('');
    try {
      const { data: inserted, error: insErr } = await supabase
        .from('ticket_messages')
        .insert({
          ticket_id: selected.id,
          message: text,
          user_id: urow.id,
        })
        .select(
          `
          id,
          message,
          created_at,
          user_id,
          users:user_id ( first_name, family_name, name, user_type )
        `
        )
        .single();
      if (insErr || !inserted) {
        setDraft(text);
        return;
      }
      const row = inserted as any;
      const normalized: Tm = {
        ...row,
        users: Array.isArray(row.users) ? row.users[0] : row.users,
      };
      setMessages((prev) => {
        if (prev.some((m) => m.id === normalized.id)) return prev;
        return [...prev, normalized];
      });
      await supabase.from('tickets').update({ updated_at: new Date().toISOString() }).eq('id', selected.id);
      void loadTickets();
    } finally {
      setSending(false);
    }
  };

  const formatMsgTime = (iso: string) => {
    try {
      return format(parseISO(iso), 'dd.MM.yyyy HH:mm', { locale: de });
    } catch {
      return iso;
    }
  };

  /** Short time for mobile bubbles: today→HH:mm, yesterday→Gestern HH:mm, older→dd.MM HH:mm. */
  const formatMsgTimeShort = (iso: string) => {
    try {
      const d = parseISO(iso);
      if (isToday(d)) return format(d, 'HH:mm');
      if (isYesterday(d)) return `Gestern ${format(d, 'HH:mm')}`;
      return format(d, 'dd.MM. HH:mm');
    } catch {
      return iso;
    }
  };

  const statusStyle = (s: string) => {
    const v = String(s).toLowerCase();
    if (v === 'open') return { bg: '#111827', fg: '#FFFFFF', label: 'Open' };
    if (v === 'in_progress') return { bg: '#E5E7EB', fg: '#111827', label: 'In Progress' };
    if (v === 'closed') return { bg: '#F3F4F6', fg: '#6B7280', label: 'Closed' };
    return { bg: '#E5E7EB', fg: '#374151', label: s };
  };

  const msgAuthor = (m: Tm) => {
    if (m.users) {
      const n = [m.users.first_name, m.users.family_name].filter(Boolean).join(' ').trim();
      if (n) return n;
      if (m.users.name) return m.users.name;
    }
    return 'User';
  };

  const listPane = (
    <View style={[styles.listPane, isWide && styles.listPaneWide]}>
      <Text style={styles.h1}>Tickets</Text>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Suchen"
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#9ca3af"
        />
        <TouchableOpacity style={styles.filterBtn} onPress={() => setFilterOpen(true)}>
          <Ionicons
            name="filter"
            size={22}
            color={filterStatus !== 'all' || filterCategory !== 'all' ? '#111827' : '#374151'}
          />
        </TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 16 }} />
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {searchQuery || filterStatus !== 'all' || filterCategory !== 'all'
                ? 'Keine Tickets passen zu den Filtern.'
                : 'Keine Tickets.'}
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.ticketRow, selected?.id === item.id && styles.ticketRowActive]}
              onPress={() => setSelected(item)}
            >
              <View style={styles.ticketRowTop}>
                <Text style={styles.ticketChildName} numberOfLines={1}>
                  {childLabel(item)}
                </Text>
                <Text style={styles.ticketDate}>{formatDisplayDate(item.updated_at)}</Text>
              </View>
              <Text style={styles.ticketTitle} numberOfLines={2}>
                {item.title}
              </Text>
              {item.snippet ? (
                <Text style={styles.ticketSnippet} numberOfLines={2}>
                  {item.snippet}
                </Text>
              ) : null}
              <View style={styles.ticketRowBottom}>
                <Text style={styles.ticketCategory}>
                  {item.category
                    ? item.category.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
                    : ''}
                </Text>
                <View style={styles.statusPill}>
                  <Text style={styles.statusPillText}>{item.status}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={filterOpen} transparent animationType="fade">
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setFilterOpen(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Filter</Text>
            <Text style={styles.modalLabel}>Status</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {['all', 'open', 'in_progress', 'closed'].map((st) => (
                <TouchableOpacity
                  key={st}
                  style={[styles.chip, filterStatus === st && styles.chipActive]}
                  onPress={() => setFilterStatus(st)}
                >
                  <Text style={[styles.chipText, filterStatus === st && styles.chipTextActive]}>
                    {st === 'all' ? 'Alle' : st}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {availableCategories.length > 0 ? (
              <>
                <Text style={styles.modalLabel}>Kategorie</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                  <TouchableOpacity
                    style={[styles.chip, filterCategory === 'all' && styles.chipActive]}
                    onPress={() => setFilterCategory('all')}
                  >
                    <Text style={[styles.chipText, filterCategory === 'all' && styles.chipTextActive]}>Alle</Text>
                  </TouchableOpacity>
                  {availableCategories.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.chip, filterCategory === cat && styles.chipActive]}
                      onPress={() => setFilterCategory(cat)}
                    >
                      <Text style={[styles.chipText, filterCategory === cat && styles.chipTextActive]}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            ) : null}
            <TouchableOpacity style={styles.modalDone} onPress={() => setFilterOpen(false)}>
              <Text style={styles.modalDoneText}>Fertig</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );

  const mobileDetailPane = selected ? (
    <KeyboardAvoidingView
      style={chat.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + keyboardOpenNudgePx : keyboardOpenNudgePx}
    >
      {/* Sticky header: back + title + status pill */}
      <View style={chat.header}>
        <TouchableOpacity onPress={() => setSelected(null)} hitSlop={12} style={chat.backBtn}>
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </TouchableOpacity>
        <View style={chat.headerCenter}>
          <Text style={chat.headerTitle} numberOfLines={1}>
            {selected.title || 'Ticket'}
          </Text>
          <Text style={chat.headerSubtitle} numberOfLines={1}>
            {childLabel(selected)}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setStatusPickerOpen(true)} hitSlop={8}>
          <View style={[chat.statusPill, { backgroundColor: statusStyle(selected.status).bg }]}>
            <Text style={[chat.statusPillText, { color: statusStyle(selected.status).fg }]}>
              {statusStyle(selected.status).label}
            </Text>
            <Ionicons name="chevron-down" size={12} color={statusStyle(selected.status).fg} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Collapsible info bar */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setInfoExpanded((v) => !v)}
        style={chat.infoBar}
      >
        <Ionicons name="information-circle-outline" size={16} color="#64748B" />
        <Text style={chat.infoBarText} numberOfLines={1}>
          {infoExpanded ? 'Details ausblenden' : 'Details anzeigen'}
        </Text>
        <Ionicons name={infoExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="#64748B" />
      </TouchableOpacity>

      {infoExpanded ? (
        <View style={chat.infoExpanded}>
          <View style={chat.infoRow}>
            <Text style={chat.infoLabel}>Kind</Text>
            <Text style={chat.infoValue} numberOfLines={1}>{childLabel(selected)}</Text>
            {(selected.created_by as UserStub)?.id ? (
              <TouchableOpacity onPress={() => openUserDetails((selected.created_by as UserStub).id)} hitSlop={8}>
                <Ionicons name="open-outline" size={16} color="#111827" />
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={chat.infoRow}>
            <Text style={chat.infoLabel}>Erstellt von</Text>
            <Text style={chat.infoValue} numberOfLines={1}>{creatorLabel(selected)}</Text>
            {(selected.created_by_user?.id || (selected.created_by as UserStub)?.id) ? (
              <TouchableOpacity
                onPress={() =>
                  openUserDetails(selected.created_by_user?.id || (selected.created_by as UserStub)?.id)
                }
                hitSlop={8}
              >
                <Ionicons name="open-outline" size={16} color="#111827" />
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={chat.infoRow}>
            <Text style={chat.infoLabel}>Erstellt</Text>
            <Text style={chat.infoValue}>{formatDisplayDate(selected.created_at)}</Text>
          </View>
          <View style={chat.infoRow}>
            <Text style={chat.infoLabel}>Stand</Text>
            <Text style={chat.infoValue}>{formatDisplayDate(selected.updated_at)}</Text>
          </View>
        </View>
      ) : null}

      {/* Messages */}
      {loadingMsg ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          ref={msgListRef}
          data={messages}
          keyExtractor={(m) => m.id}
          style={chat.msgList}
          contentContainerStyle={chat.msgListContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            <View style={chat.emptyWrap}>
              <Ionicons name="chatbubbles-outline" size={42} color="#CBD5E1" />
              <Text style={chat.emptyText}>Noch keine Nachrichten</Text>
              <Text style={chat.emptySub}>Schreibe die erste Nachricht unten</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const externalUser = isPortalUserMessage(item.users);
            const alignLeft = externalUser;
            const prev = index > 0 ? messages[index - 1] : null;
            const next = index < messages.length - 1 ? messages[index + 1] : null;
            const prevSameSide = prev ? isPortalUserMessage(prev.users) === externalUser : false;
            const nextSameSide = next ? isPortalUserMessage(next.users) === externalUser : false;
            const showAuthor = alignLeft && !prevSameSide;
            const isFirst = !prevSameSide;
            const isLast = !nextSameSide;

            const bubbleStyles: any[] = [chat.bubble];
            if (alignLeft) bubbleStyles.push(chat.bubbleLeft);
            else bubbleStyles.push(chat.bubbleRight);
            if (isFirst && isLast) bubbleStyles.push(alignLeft ? chat.bubbleLeftSolo : chat.bubbleRightSolo);
            else if (isFirst) bubbleStyles.push(alignLeft ? chat.bubbleLeftFirst : chat.bubbleRightFirst);
            else if (isLast) bubbleStyles.push(alignLeft ? chat.bubbleLeftLast : chat.bubbleRightLast);
            else bubbleStyles.push(alignLeft ? chat.bubbleLeftMid : chat.bubbleRightMid);

            return (
              <View style={[chat.row, !isLast && chat.rowTight]}>
                <View style={bubbleStyles}>
                  {showAuthor ? (
                    <Text style={chat.bubbleAuthor}>{msgAuthor(item)}</Text>
                  ) : null}
                  <Text style={[chat.bubbleText, !alignLeft && chat.bubbleTextRight]}>
                    {item.message}
                  </Text>
                  {isLast ? (
                    <Text
                      style={[
                        chat.bubbleTime,
                        alignLeft ? chat.bubbleTimeLeft : chat.bubbleTimeRight,
                      ]}
                    >
                      {formatMsgTimeShort(item.created_at)}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Composer */}
      <View style={chat.composer}>
        <View style={chat.inputWrap}>
          <TextInput
            style={chat.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={selected.status === 'closed' ? 'Ticket geschlossen' : 'Nachricht schreiben…'}
            placeholderTextColor="#94A3B8"
            multiline
            editable={selected.status !== 'closed'}
            onFocus={() => {
              setTimeout(() => msgListRef.current?.scrollToEnd({ animated: true }), 250);
            }}
          />
        </View>
        <TouchableOpacity
          style={[
            chat.sendBtn,
            (!draft.trim() || selected.status === 'closed' || sending) && chat.sendBtnDisabled,
          ]}
          onPress={sendMessage}
          disabled={sending || !draft.trim() || selected.status === 'closed'}
          hitSlop={6}
        >
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="send" size={18} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={statusPickerOpen} transparent animationType="fade">
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setStatusPickerOpen(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Status ändern</Text>
            {STATUS_OPTIONS.map((o) => (
              <TouchableOpacity
                key={o.value}
                style={styles.statusOption}
                onPress={() => updateTicketStatus(o.value)}
              >
                <Text style={styles.statusOptionText}>{o.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalDone} onPress={() => setStatusPickerOpen(false)}>
              <Text style={styles.modalDoneText}>Abbrechen</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  ) : null;

  const detailPane = (
    <KeyboardAvoidingView
      style={[styles.detailPane, isWide && styles.detailPaneWide]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + keyboardOpenNudgePx : keyboardOpenNudgePx}
    >
      {!selected ? (
        <Text style={styles.placeholder}>Ticket auswählen</Text>
      ) : (
        <>
          {!isWide && (
            <TouchableOpacity
              style={styles.backBtnTop}
              onPress={() => setSelected(null)}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={22} color="#111827" />
              <Text style={styles.backBtnText}>Liste</Text>
            </TouchableOpacity>
          )}
          <ScrollView style={styles.detailHeader} keyboardShouldPersistTaps="handled">
            <Text style={styles.detailTitle}>{selected.title}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Kind:</Text>
              <Text style={styles.metaValue}>{childLabel(selected)}</Text>
              {(selected.created_by as UserStub)?.id ? (
                <TouchableOpacity onPress={() => openUserDetails((selected.created_by as UserStub).id)} hitSlop={8}>
                  <Ionicons name="information-circle-outline" size={22} color="#111827" />
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Erstellt von:</Text>
              <Text style={styles.metaValue}>{creatorLabel(selected)}</Text>
              {(selected.created_by_user?.id || (selected.created_by as UserStub)?.id) ? (
                <TouchableOpacity
                  onPress={() =>
                    openUserDetails(selected.created_by_user?.id || (selected.created_by as UserStub)?.id)
                  }
                  hitSlop={8}
                >
                  <Ionicons name="information-circle-outline" size={22} color="#111827" />
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.datesRow}>
              <Text style={styles.dateSmall}>erstellt {formatDisplayDate(selected.created_at)}</Text>
              <Text style={styles.dateSmall}>Stand {formatDisplayDate(selected.updated_at)}</Text>
            </View>
            <TouchableOpacity style={styles.statusSelect} onPress={() => setStatusPickerOpen(true)}>
              <Text style={styles.statusSelectLabel}>Status</Text>
              <Text style={styles.statusSelectValue}>
                {STATUS_OPTIONS.find((o) => o.value === selected.status)?.label || selected.status}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#6b7280" />
            </TouchableOpacity>
          </ScrollView>

          <Modal visible={statusPickerOpen} transparent animationType="fade">
            <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setStatusPickerOpen(false)}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Status ändern</Text>
                {STATUS_OPTIONS.map((o) => (
                  <TouchableOpacity
                    key={o.value}
                    style={styles.statusOption}
                    onPress={() => updateTicketStatus(o.value)}
                  >
                    <Text style={styles.statusOptionText}>{o.label}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.modalDone} onPress={() => setStatusPickerOpen(false)}>
                  <Text style={styles.modalDoneText}>Abbrechen</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>

          {loadingMsg ? (
            <ActivityIndicator style={{ marginTop: 16 }} />
          ) : (
            <FlatList
              ref={msgListRef}
              data={messages}
              keyExtractor={(m) => m.id}
              style={styles.msgList}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              renderItem={({ item }) => {
                const alignLeft = isPortalUserMessage(item.users);
                return (
                  <View style={[styles.bubble, alignLeft ? styles.bubbleLeft : styles.bubbleRight]}>
                    <Text style={[styles.bubbleAuthor, alignLeft ? styles.bubbleAuthorLeft : styles.bubbleAuthorRight]}>
                      {msgAuthor(item)}
                    </Text>
                    <Text style={styles.bubbleText}>{item.message}</Text>
                    <Text style={[styles.bubbleTime, alignLeft ? { textAlign: 'left' } : { textAlign: 'right' }]}>
                      {formatMsgTime(item.created_at)}
                    </Text>
                  </View>
                );
              }}
            />
          )}
          <View style={[styles.inputRow, { marginBottom: keyboardOpenNudgePx }]}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder={selected.status === 'closed' ? 'Ticket geschlossen' : 'Nachricht…'}
              placeholderTextColor="#9ca3af"
              multiline
              editable={selected.status !== 'closed'}
              onFocus={() => {
                setTimeout(() => msgListRef.current?.scrollToEnd({ animated: true }), 250);
              }}
            />
            <TouchableOpacity
              style={[styles.sendBtn, selected.status === 'closed' && styles.sendBtnDisabled]}
              onPress={sendMessage}
              disabled={sending || selected.status === 'closed'}
            >
              <Text style={styles.sendBtnText}>{sending ? '…' : 'Senden'}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );

  const rootBottomPad = tabBarHeight > 0 ? tabBarHeight : insets.bottom;

  // Mobile detail view takes over the whole screen (no top pad from parent, handled inside)
  if (isMobile && selected) {
    // iOS tab bar is absolute → need padding to clear it.
    // Android tab bar takes layout space → padding would create a gray gap above tab bar.
    const mobileBottomPad = Platform.OS === 'ios' ? (tabBarHeight > 0 ? tabBarHeight : insets.bottom) : 0;
    return (
      <View style={[chat.page, { paddingTop: insets.top, paddingBottom: mobileBottomPad }]}>
        {mobileDetailPane}
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + SCREEN_HEADER_TOP_PAD, paddingBottom: rootBottomPad }]}>
      {error ? <Text style={styles.err}>{error}</Text> : null}
      {isWide ? (
        <View style={styles.split}>
          {listPane}
          {detailPane}
        </View>
      ) : (
        <View style={{ flex: 1 }}>{selected ? detailPane : listPane}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafb' },
  err: { color: '#111827', paddingHorizontal: 16, marginBottom: 8 },
  split: { flex: 1, flexDirection: 'row' },
  listPane: { flex: 1, paddingHorizontal: 12, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: '#e5e7eb' },
  listPaneWide: { flex: 0.38, maxWidth: 400 },
  detailPane: { flex: 1, paddingHorizontal: 12 },
  detailPaneWide: { flex: 0.62 },
  h1: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    fontSize: 15,
  },
  filterBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  empty: { color: '#6b7280', marginTop: 24 },
  ticketRow: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  ticketRowActive: { borderColor: '#111827', borderWidth: 2, backgroundColor: '#F1F5F9' },
  ticketRowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  ticketChildName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#111827' },
  ticketDate: { fontSize: 12, color: '#9ca3af' },
  ticketTitle: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 4 },
  ticketSnippet: { fontSize: 13, color: '#6b7280', marginBottom: 8 },
  ticketRowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 },
  ticketCategory: { fontSize: 13, color: '#374151' },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  statusPillText: { fontSize: 12, fontWeight: '600', color: '#374151', textTransform: 'capitalize' },
  placeholder: { color: '#6b7280', marginTop: 32, textAlign: 'center' },
  detailHeader: { maxHeight: 220 },
  detailTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  metaLabel: { fontSize: 14, color: '#6b7280', width: 100 },
  metaValue: { flex: 1, fontSize: 14, color: '#111827', fontWeight: '500' },
  datesRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, marginBottom: 12 },
  dateSmall: { fontSize: 12, color: '#9ca3af' },
  statusSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#fff',
    marginBottom: 12,
    gap: 8,
  },
  statusSelectLabel: { fontSize: 13, color: '#6b7280', marginRight: 8 },
  statusSelectValue: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111827' },
  msgList: { flex: 1 },
  bubble: {
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
    maxWidth: '88%',
    borderWidth: 1,
  },
  bubbleLeft: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderColor: '#e5e7eb',
  },
  bubbleRight: {
    alignSelf: 'flex-end',
    backgroundColor: '#F1F5F9',
    borderColor: '#D1D5DB',
  },
  bubbleAuthor: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  bubbleAuthorLeft: { color: '#111827' },
  bubbleAuthorRight: { color: '#111827', textAlign: 'right' },
  bubbleText: { fontSize: 15, color: '#111827' },
  bubbleTime: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 8, paddingBottom: 2 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    fontSize: 15,
  },
  sendBtn: { backgroundColor: '#111827', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10 },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: '#fff', fontWeight: '600' },
  backBtnTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  backBtnText: { color: '#111827', fontWeight: '600', fontSize: 15 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16, color: '#111827' },
  modalLabel: { fontSize: 14, color: '#6b7280', marginBottom: 8 },
  chipRow: { marginBottom: 16 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    marginRight: 8,
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: '#111827', borderColor: '#111827' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  modalDone: { marginTop: 8, paddingVertical: 12, alignItems: 'center' },
  modalDoneText: { color: '#111827', fontWeight: '600', fontSize: 16 },
  statusOption: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  statusOptionText: { fontSize: 16, color: '#111827' },
});

/** Mobile-only chat detail styles (WhatsApp-style). */
const chat = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#EAEEF2' },
  root: { flex: 1 },

  // Sticky header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  headerCenter: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  headerSubtitle: { fontSize: 12, color: '#64748B', marginTop: 1 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusPillText: { fontSize: 11, fontWeight: '700' },

  // Info bar
  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  infoBarText: { flex: 1, fontSize: 12, color: '#64748B', fontWeight: '500' },
  infoExpanded: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoLabel: { fontSize: 12, color: '#64748B', width: 92 },
  infoValue: { flex: 1, fontSize: 13, color: '#0F172A', fontWeight: '500' },

  // Message list
  msgList: { flex: 1 },
  msgListContent: { paddingHorizontal: 10, paddingVertical: 10 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { fontSize: 15, fontWeight: '600', color: '#475569' },
  emptySub: { fontSize: 13, color: '#94A3B8' },

  // Rows
  row: { marginBottom: 4 },
  rowTight: { marginBottom: 2 },

  // Bubbles
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleLeft: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
  },
  bubbleRight: {
    alignSelf: 'flex-end',
    backgroundColor: '#F1F5F9',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D1D5DB',
  },
  // Tail rounding — chat bubbles with visual grouping
  bubbleLeftSolo: {
    borderTopLeftRadius: 4,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  bubbleLeftFirst: {
    borderTopLeftRadius: 4,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  bubbleLeftMid: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  bubbleLeftLast: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  bubbleRightSolo: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  bubbleRightFirst: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  bubbleRightMid: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  bubbleRightLast: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },

  bubbleAuthor: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  bubbleText: {
    fontSize: 15,
    color: '#0F172A',
    lineHeight: 20,
  },
  bubbleTextRight: { color: '#0F172A' },
  bubbleTime: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 4,
  },
  bubbleTimeLeft: { textAlign: 'left' },
  bubbleTimeRight: { textAlign: 'right', color: '#64748B' },

  // Composer
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  inputWrap: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    minHeight: 40,
    maxHeight: 120,
    justifyContent: 'center',
  },
  input: {
    fontSize: 15,
    color: '#0F172A',
    padding: 0,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#94A3B8' },
});
