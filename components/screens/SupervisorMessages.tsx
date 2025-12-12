import { useEffect, useState, useMemo, useRef } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View, Image, ActivityIndicator, TextInput, ScrollView, useWindowDimensions, Text, KeyboardAvoidingView, Platform, Modal, Alert, Switch, Linking, Pressable } from 'react-native';
import { formatDistanceToNow, parseISO, format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';
import { RoleBadge } from '@/components/RoleBadge';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

interface PollOption {
  id: string;
  label: string;
  position: number;
  votes: number;
  selected: boolean;
}

interface Poll {
  id: string;
  question: string;
  multiple_choice: boolean;
  options: PollOption[];
}

interface MessageThread {
  id: string;
  title?: string;
  updated_at: string;
  unread?: boolean;
  last_message?: {
    content: string;
    created_at: string;
    sender_id: string;
  };
  participants: {
    user_id: string;
    status?: string;
    users: {
      id: string;
      first_name: string;
      family_name: string;
      user_type?: string;
    }
  }[];
  is_group: boolean;
}

interface Message {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  attachments?: any[];
  poll?: Poll;
  readBy?: string[]; // Add readBy property
}

interface ParentOption {
  id: string;
  name: string;
  email?: string;
}

const FilterChip = ({ label, active, onPress }: { label: string, active: boolean, onPress: () => void }) => (
  <TouchableOpacity 
    style={[styles.filterChip, active && styles.filterChipActive]} 
    onPress={onPress}
  >
    <ThemedText style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</ThemedText>
  </TouchableOpacity>
);


export default function SupervisorMessages() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // --- STATE DEFINITIONS ---
  
  const [loading, setLoading] = useState(true);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'parents' | 'teachers'>('all');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  
  const [userRow, setUserRow] = useState<any>(null);
  const [supervisorId, setSupervisorId] = useState<string | null>(null);

  // Chat State
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessageText, setNewMessageText] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const messagesRef = useRef<Message[]>([]); // Ref to access current messages in realtime callbacks

  // Keep ref synced with state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // New Conversation Modal State
  const [isNewConvModalVisible, setIsNewConvModalVisible] = useState(false);
  const [loadingParents, setLoadingParents] = useState(false);
  const [parentOptions, setParentOptions] = useState<ParentOption[]>([]);
  const [parentSearch, setParentSearch] = useState('');
  
  // New Conversation Selection
  const [selectedRecipient, setSelectedRecipient] = useState<ParentOption | null>(null);
  const [initialMessage, setInitialMessage] = useState('');
  const [sendingStart, setSendingStart] = useState(false);

  // Other Modals
  const [isParticipantsModalVisible, setIsParticipantsModalVisible] = useState(false);
  const [showParticipantsOverlay, setShowParticipantsOverlay] = useState(false);
  const [showPollComposer, setShowPollComposer] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['Yes', 'No']);
  const [pollMultiple, setPollMultiple] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Image Viewer State
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Action Sheet and Report State
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [actionTarget, setActionTarget] = useState<Message | null>(null);
  const [showReportSheet, setShowReportSheet] = useState(false);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);

  // --- DERIVED STATE ---
  
  const isMobile = width < 768;
  // 3-column layout: Left (List), Middle (Chat), Right (Participants)
  // On Mobile: Only 1 column visible at a time
  // On Tablet/Desktop:
  //   - If Thread selected: 
  //       - Width < 1200: List (small) | Chat (flex)
  //       - Width >= 1200: List (25%) | Chat (50%) | Participants (25%)
  //   - If No Thread: List (100%) or List | Placeholder
  
  const showLeftColumn = isMobile ? !selectedThreadId : true;
  const showMiddleColumn = isMobile ? !!selectedThreadId : true;
  // Force right column to be hidden as participants are now in the left column
  const showRightColumn = false;

  const leftColumnWidth = isMobile ? '100%' : (width >= 1200 ? '25%' : '35%');
  const middleColumnFlex = isMobile ? 1 : 1;
  
  // --- EFFECTS ---

  useEffect(() => {
    fetchThreads(true);
  }, []);

  useEffect(() => {
    if (selectedThreadId) {
       fetchMessages(selectedThreadId);
       subscribeToMessages(selectedThreadId);

       // Polling fallback: Refresh messages every 5 seconds to ensure vote counts are up to date
       // This covers cases where Realtime events are missed or delayed
       const intervalId = setInterval(() => {
          if (messagesRef.current.some(m => m.poll)) {
             // Only poll if there's a poll in the thread to save resources
             fetchMessages(selectedThreadId, false);
          }
       }, 5000);

       return () => {
          clearInterval(intervalId);
          supabase.removeAllChannels();
       };
    } else {
       setMessages([]);
    }
  }, [selectedThreadId]);

  // Load blocked users
  useEffect(() => {
    const loadBlocked = async () => {
      try {
        if (!userRow?.id) return;
        const { data, error } = await supabase
          .from('msg_thread_blocked')
          .select('blocked_user_id')
          .eq('blocked_by', userRow.id);
        if (error) {
          console.warn('getBlockedUsers error', error);
          return;
        }
        setBlockedUserIds((data || []).map((r: any) => r.blocked_user_id));
      } catch (e) {
        console.error('Error loading blocked users:', e);
      }
    };
    loadBlocked();
  }, [userRow?.id]);

  // --- FUNCTIONS ---

  const subscribeToMessages = (threadId: string) => {
    const channel = supabase
      .channel(`messages:${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'msg_thread_messages',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const newMsg = payload.new as any;
          
          // If message is empty (no body, no attachments), it's likely a poll being created.
          // We should NOT add it here, because we don't have the poll data yet.
          // We will wait for the 'msg_polls' INSERT event or the manual fetch to load it with the poll.
          // This prevents a "blank message" bubble from appearing before the poll data is ready.
          if (!newMsg.body && (!newMsg.attachments || newMsg.attachments.length === 0)) {
             return;
          }

          // Filter out messages from blocked users in realtime
          if (newMsg.sender_id !== userRow?.id && blockedUserIds.includes(newMsg.sender_id)) {
             return;
          }

          setMessages((prev) => {
             // If we already have this message (e.g. from fetchMessages), don't duplicate/overwrite
             // unless we want to ensure it's visible. 
             // But fetchMessages fetches the POLL data too. The realtime payload DOES NOT have poll data.
             // So if we overwrite a full message with this partial one, we lose the poll.
             if (prev.find(m => m.id === newMsg.id)) return prev;
             
             return [{
               id: newMsg.id,
               content: newMsg.body,
               created_at: newMsg.created_at,
               sender_id: newMsg.sender_id,
               attachments: newMsg.attachments
             }, ...prev];
          });
        }
      )
      .on(
         'postgres_changes',
         {
            event: 'INSERT',
            schema: 'public',
            table: 'msg_polls',
         },
         (payload) => {
            // Only refresh if the poll belongs to a message in this thread
            const messageId = payload.new.message_id;
            const isRelevant = messagesRef.current.some(m => m.id === messageId);
            
            if (isRelevant) {
               console.log("New poll detected for current thread, refreshing...");
               fetchMessages(threadId, false);
            }
         }
      )
      .on(
         'postgres_changes',
         {
            event: '*', // Listen for votes (inserts/deletes)
            schema: 'public',
            table: 'msg_poll_votes',
         },
         (payload) => {
             // Refresh messages on any vote change to ensure we catch it
             console.log("Vote detected, refreshing thread...");
             fetchMessages(threadId, false);
         }
      )
      .on(
         'postgres_changes',
         {
            event: '*', 
            schema: 'public',
            table: 'msg_thread_reads',
            filter: `thread_id=eq.${threadId}`,
         },
         (payload) => {
             console.log("Read receipt update, refreshing...");
             fetchMessages(threadId, false);
         }
      )
      .subscribe();
  };

  const fetchMessages = async (threadId: string, showLoading = true) => {
    if (showLoading) setLoadingMessages(true);
    try {
       // 1. Fetch Messages first (without polls to avoid embedding errors)
       const { data: msgs, error } = await supabase
         .from('msg_thread_messages')
         .select(`
            id, body, created_at, sender_id, attachments, thread_id,
            sender:users(id, first_name, family_name, user_type)
         `)
         .eq('thread_id', threadId)
         .order('created_at', { ascending: false });
       
       if (error) throw error;

       // Fetch Read Receipts
       const { data: readReceipts } = await supabase
          .from('msg_thread_reads')
          .select('user_id, last_read_message_id')
          .eq('thread_id', threadId);

       // 2. Fetch Polls for messages (Parallel, per message - matching web app logic)
       const pollsByMsg = new Map<string, Poll>();
       
       if (msgs && msgs.length > 0) {
          await Promise.all(msgs.map(async (m: any) => {
             // Check for poll
             const { data: pollRow } = await supabase
                .from('msg_polls')
                .select('id, question, multiple_choice')
                .eq('message_id', m.id)
                .maybeSingle();

             if (pollRow) {
                // Fetch options
                const { data: options } = await supabase
                   .from('msg_poll_options')
                   .select('id, label, position')
                   .eq('poll_id', pollRow.id)
                   .order('position');

                // Fetch votes
                const { data: votes } = await supabase
                   .from('msg_poll_votes')
                   .select('option_id, voter_id')
                   .eq('poll_id', pollRow.id);

                // Assemble poll object
                const pollObj: Poll = {
                   id: pollRow.id,
                   question: pollRow.question,
                   multiple_choice: pollRow.multiple_choice,
                   options: (options || []).map((o: any) => {
                      const relevantVotes = votes?.filter((v: any) => v.option_id === o.id) || [];
                      return {
                         id: o.id,
                         label: o.label,
                         position: o.position,
                         votes: relevantVotes.length,
                         selected: relevantVotes.some((v: any) => v.voter_id === userRow?.id)
                      };
                   }).sort((a: any, b: any) => a.position - b.position)
                };
                
                pollsByMsg.set(m.id, pollObj);
             }
          }));
       }

       // Filter out messages from blocked users
       const filteredMsgs = (msgs || []).filter((m: any) => {
          // Don't filter my own messages
          if (m.sender_id === userRow?.id) return true;
          // Filter out messages from blocked users
          return !blockedUserIds.includes(m.sender_id);
       });

       const formatted = filteredMsgs.map((m: any) => {
          const poll = pollsByMsg.get(m.id);
          
          // Calculate who read this message
          // A user has read this message if their last_read_message_id >= this message's ID
          // Note: IDs are usually time-ordered or sequential, but UUIDs are not. 
          // Assuming messages are ordered by created_at descending, we can check if the receipt's last_read_msg created_at >= this msg
          // BUT msg_thread_reads usually stores the ID.
          // IMPORTANT: UUID comparison is not valid for time. We need to rely on the fact that if a user has read a LATER message, they read this one.
          // But finding "later" requires looking up the created_at of the read message.
          // SIMPLIFIED APPROACH: Client-side, we know the order. 
          // Server-side logic usually updates last_read_message_id to the NEWEST message read.
          
          // Let's map message IDs to their index/date to check "read status" properly?
          // Or just check if this specific ID is in the "read list"? No, it's a cursor.
          // Ideally, we fetch read receipts, find the message corresponding to that ID, get its date, and compare.
          // Optimization: Just return the list of users who have read *at least* this message.
          
          // For now, let's just attach the raw read receipts to the state or processed list if we can map them.
          // Actually, to show double ticks, we just need to know if *anyone other than me* has read it? 
          // Or specifically the recipient?
          // "readBy" should be a list of user IDs.
          
          // We need to know which messages are "older or equal" to the last_read_message_id for each user.
          // Since we don't have easy comparison of UUIDs, we'll do this:
          // 1. Find the "index" or "timestamp" of the message referenced in the receipt.
          // 2. Compare with current message.
          
          const readBy = (readReceipts || [])
             .filter((r: any) => {
                if (r.user_id === userRow?.id) return false; // Ignore self
                // We need to check if m is "before or equal" to r.last_read_message_id
                // This is O(N*M) potentially slow.
                // Fast hack: If we assume the list `msgs` is sorted DESC (newest first):
                // find index of receipt msg, find index of `m`. 
                // If index(m) >= index(receipt_msg), then m is older/equal (since list is DESC).
                const receiptMsgIndex = filteredMsgs?.findIndex((msg: any) => msg.id === r.last_read_message_id);
                const currentMsgIndex = filteredMsgs?.findIndex((msg: any) => msg.id === m.id);
                
                if (receiptMsgIndex !== -1 && currentMsgIndex !== -1) {
                   // If current message is "after" (higher index = older in DESC list) or same as receipt message
                   return currentMsgIndex >= receiptMsgIndex; 
                }
                return false;
             })
             .map((r: any) => r.user_id);

          return {
            id: m.id,
            content: m.body,
            created_at: m.created_at,
            sender_id: m.sender_id,
            sender: m.sender, 
            attachments: m.attachments,
            poll,
            readBy
          };
       });

       // Mark latest message as read by ME
       if (msgs && msgs.length > 0 && userRow) {
          const latestMsg = msgs[0];
          // Only update if we haven't already marked it (optimistic check)
          // We should do this in the background
          supabase.from('msg_thread_reads')
             .upsert({ 
                thread_id: threadId, 
                user_id: userRow.id, 
                last_read_message_id: latestMsg.id,
                read_at: new Date().toISOString()
             }, { onConflict: 'thread_id, user_id' })
             .then(({ error }) => {
                if (error) console.error("Error marking read:", error);
             });
       }

       setMessages(prev => {
          // Create a map of new messages
          const newMessages = formatted;
          
          // Intelligent merge
          return newMessages.map(newMsg => {
             const existingMsg = prev.find(p => p.id === newMsg.id);
             
             // Preservation Rule 1: Poll Data
             // If new message has no poll, but existing one does, and new message looks like a poll placeholder (empty body), keep the poll
             if (!newMsg.poll && existingMsg?.poll && !newMsg.content && (!newMsg.attachments || newMsg.attachments.length === 0)) {
                return { ...newMsg, poll: existingMsg.poll };
             }
             
             return newMsg;
          });
       });
    } catch (err) {
       console.error("Error fetching messages:", err);
    } finally {
       if (showLoading) setLoadingMessages(false);
    }
  };

  const fetchThreads = async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Not authenticated');
        return;
      }

      // 1. Resolve Supervisor ID
      const { data: uRow, error: userError } = await supabase
        .from('users')
        .select('id, record_id, first_name, family_name')
        .eq('auth_id', user.id)
        .single();

      if (userError || !uRow) {
         setError('User profile not found');
         return;
      }
      setUserRow(uRow);

      // Load blocked users
      const { data: blockedData } = await supabase
        .from('msg_thread_blocked')
        .select('blocked_user_id')
        .eq('blocked_by', uRow.id);
      const currentBlockedIds = (blockedData || []).map((r: any) => r.blocked_user_id);
      setBlockedUserIds(currentBlockedIds);

      const { data: accessRows } = await supabase
          .from('user_access')
          .select('resource_type, resource_id, user_id')
          .or(`user_id.eq.${user.id},user_id.eq.${uRow.id}`);

      const supervisorAccess = (accessRows || []).find(
        (row: any) => row.resource_type === 'supervisor',
      );

      const supId = supervisorAccess?.resource_id || uRow.record_id;
      setSupervisorId(supId);

      if (!supId) {
        setError('No supervisor access found');
        setLoading(false);
        return;
      }
      
      // 2. Fetch Threads
      const { data: threadsData, error: threadsError } = await supabase
        .from('msg_threads')
        .select(`
          id, 
          created_at,
          is_group,
          is_predefined,
          active,
          title,
          supervisor_id,
          facility_id,
          msg_thread_participants(
            user_id,
            status,
            users(id, first_name, family_name, user_type)
          )
        `)
        .eq('supervisor_id', supId)
        .order('created_at', { ascending: false });

      if (threadsError) throw threadsError;

      if (!threadsData || threadsData.length === 0) {
        setThreads([]);
        setLoading(false);
        return;
      }

      // Filter out disabled predefined groups
      let validThreads = threadsData.filter((t: any) => {
         if (t.is_predefined === true && t.active === false) return false;
         return true;
      });

      validThreads = validThreads.filter((t: any) => 
        t.msg_thread_participants?.some((p: any) => p.users?.id === uRow.id || p.user_id === uRow.id)
      );

      // 3. Fetch Last Messages (Batch)
      const threadIds = validThreads.map((t: any) => t.id);
      if (threadIds.length > 0) {
         const { data: allMessages } = await supabase
          .from("msg_thread_messages")
          .select("thread_id, body, created_at, id, sender_id")
          .in("thread_id", threadIds)
          .order("created_at", { ascending: false });

         const lastMessageMap = new Map();
         (allMessages || []).forEach((msg: any) => {
            if (!lastMessageMap.has(msg.thread_id)) {
              lastMessageMap.set(msg.thread_id, msg);
            }
         });

         // Filter out threads with blocked users (for direct threads only)
         const finalThreads = validThreads
            .filter((t: any) => {
               // Keep group threads
               if (t.is_group) return true;
               // For direct threads, check if the other participant is blocked
               const parts = t.msg_thread_participants || [];
               const other = parts.find((p: any) => p.user_id !== uRow.id);
               if (!other) return true; // Keep if no other participant found
               return !currentBlockedIds.includes(other.user_id);
            })
            .map((t: any) => {
             const lastMsg = lastMessageMap.get(t.id);
             const parts = t.msg_thread_participants || [];
             
             return {
               id: t.id,
               title: t.title,
               updated_at: lastMsg?.created_at || t.created_at,
               participants: parts,
               is_group: t.is_group,
               last_message: lastMsg ? {
                 content: lastMsg.body,
                 created_at: lastMsg.created_at,
                 sender_id: lastMsg.sender_id
               } : undefined
             };
         });

         finalThreads.sort((a: any, b: any) => {
            const timeA = new Date(a.updated_at).getTime();
            const timeB = new Date(b.updated_at).getTime();
            return timeB - timeA;
         });

         setThreads(finalThreads);
      } else {
         setThreads([]);
      }

    } catch (err: any) {
      console.error('Error fetching threads:', err);
      setError(err.message || 'Failed to load messages');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // --- New Conversation Logic ---

  const openNewConversationModal = async () => {
     setIsNewConvModalVisible(true);
     setSelectedRecipient(null);
     setInitialMessage('');
     setParentSearch('');
     // Clear previous results when opening fresh
     setParentOptions([]);
  };

  // Effect to perform dynamic search when parentSearch changes
  useEffect(() => {
     const timer = setTimeout(() => {
        if (parentSearch.trim().length >= 2) {
           performSearch(parentSearch);
        } else if (parentSearch.trim().length === 0) {
           setParentOptions([]);
        }
     }, 500);
     return () => clearTimeout(timer);
  }, [parentSearch]);

  const performSearch = async (query: string) => {
     setLoadingParents(true);
     try {
       if (!supervisorId || !userRow) return;
       
       // 1. Get facilities
       const { data: coordinatorLinks } = await supabase
         .from('supervisor_coordinator_facilities')
         .select('facility_id')
         .eq('staff_user_id', userRow.id);

       const coordinatorIds = coordinatorLinks?.map((l: any) => l.facility_id) || [];

       const { data: ownedFacilities } = await supabase
         .from('facilities')
         .select('id')
         .eq('supervisor_id', supervisorId)
         .eq('is_deleted', false);

       const ownedIds = ownedFacilities?.map(f => f.id) || [];
       const facilityIds = Array.from(new Set([...coordinatorIds, ...ownedIds]));
       
       if (facilityIds.length === 0) {
          setParentOptions([]);
          return;
       }

       // Get current academic year (optional but good for context)
       const { data: ay } = await supabase.from('academic_years').select('id').eq('is_current', true).single();
       const currentAyId = ay?.id;

       // --- Search Logic mirroring Web App ---
       
       const results: ParentOption[] = [];
       const seenIds = new Set<string>();

       // 1) Search children by name -> get their parents (manager_id)
       let childrenQuery = supabase
         .from("children_info")
         .select(`
            user_id,
            users:users!inner(id, first_name, family_name, manager_id, user_type)
         `)
         .in("facility_id", facilityIds)
         .eq("is_deleted", false)
         .eq("users.is_deleted", false)
         .ilike("users.name", `%${query}%`) // Assuming 'name' column exists or construct it? Supabase doesn't support computed col search easily unless generated col. 
         // Actually 'users' usually has first_name, family_name. Web app uses .ilike("users.name", ...) which implies a generated column or view?
         // Let's try searching first_name or family_name or constructing a text search if possible.
         // Simpler: .or(`first_name.ilike.%${query}%,family_name.ilike.%${query}%`) on users table joined?
         // Supabase join filtering is tricky.
         // Web app code: .ilike("users.name", `%${q}%`) -> looks like they might have a 'name' column on users table which is a generated col?
         // Let's assume users has a 'name' column or search first/last.
         // Let's search users table directly for children first.
       ;
       
       // Strategy: Search users table for matches, then filter by facility permissions
       const { data: userMatches } = await supabase
          .from('users')
          .select('id, first_name, family_name, email, user_type, manager_id, related_children')
          .or(`first_name.ilike.%${query}%,family_name.ilike.%${query}%`)
          .eq('is_deleted', false)
          .limit(50);

       if (userMatches) {
          // For each user match, check if they are relevant to our facilities
          
          // A) If User is CHILD
          const childMatches = userMatches.filter((u: any) => u.user_type === 'child');
          if (childMatches.length > 0) {
             const { data: childInfos } = await supabase
                .from('children_info')
                .select('user_id, facility_id')
                .in('user_id', childMatches.map((c: any) => c.id))
                .in('facility_id', facilityIds) // Must be in our facilities
                .eq('is_deleted', false);
             
             const validChildIds = new Set(childInfos?.map((ci: any) => ci.user_id));
             
             // For valid children, fetch their PARENTS (managers)
             const managerIds = childMatches
                .filter((c: any) => validChildIds.has(c.id) && c.manager_id)
                .map((c: any) => c.manager_id);
             
             if (managerIds.length > 0) {
                const { data: parentsOfChildren } = await supabase
                   .from('users')
                   .select('id, first_name, family_name, email')
                   .in('id', managerIds);
                
                parentsOfChildren?.forEach((p: any) => {
                   if (!seenIds.has(p.id)) {
                      seenIds.add(p.id);
                      results.push({
                         id: p.id,
                         name: `${p.first_name} ${p.family_name}`,
                         email: p.email
                      });
                   }
                });
             }
          }

          // B) If User is PARENT/GUARDIAN
          const parentMatches = userMatches.filter((u: any) => u.user_type === 'parent' || u.user_type === 'guardian');
          // To verify a parent is relevant, we need to check if they have any children in our facilities
          
          // Parents linked via manager_id
          // We need to find children where manager_id is in parentMatches AND facility_id is in our list
          const parentIds = parentMatches.map((p: any) => p.id);
          if (parentIds.length > 0) {
             // Check if these parents have ANY child in our facilities
             // 1. Find children managed by these parents
             const { data: managedChildren } = await supabase
                .from('users')
                .select('id, manager_id')
                .in('manager_id', parentIds);
             
             const managedChildIds = managedChildren?.map((c: any) => c.id) || [];
             
             // 2. Check if those children are in our facilities
             if (managedChildIds.length > 0) {
                const { data: facilityChildren } = await supabase
                   .from('children_info')
                   .select('user_id')
                   .in('user_id', managedChildIds)
                   .in('facility_id', facilityIds)
                   .eq('is_deleted', false);
                
                const validChildIdSet = new Set(facilityChildren?.map((fc: any) => fc.user_id));
                
                // Filter parents who have at least one valid child
                const validParentIds = new Set();
                managedChildren?.forEach((c: any) => {
                   if (validChildIdSet.has(c.id)) {
                      validParentIds.add(c.manager_id);
                   }
                });

                parentMatches.forEach((p: any) => {
                   if (validParentIds.has(p.id) && !seenIds.has(p.id)) {
                      seenIds.add(p.id);
                      results.push({
                         id: p.id,
                         name: `${p.first_name} ${p.family_name}`,
                         email: p.email
                      });
                   }
                });
             }
          }
       }

       setParentOptions(results.sort((a, b) => a.name.localeCompare(b.name)));

     } catch (err) {
       console.error("Error searching:", err);
     } finally {
       setLoadingParents(false);
     }
  };

  const handleStartConversation = async () => {
     if (!selectedRecipient) return;
     
     const targetUserId = selectedRecipient.id;
     const text = initialMessage.trim();
     
     setSendingStart(true);
     
     try {
        const existing = threads.find(t => 
           !t.is_group && 
           t.participants.some(p => p.user_id === targetUserId) &&
           t.participants.some(p => p.user_id === userRow.id) &&
           t.participants.length === 2
        );

        let targetThreadId = existing?.id;

        if (!targetThreadId) {
            const { data: threadData, error: threadError } = await supabase
              .from('msg_threads')
              .insert({
                 supervisor_id: supervisorId,
                 scope: 'direct',
                 created_by: userRow.id
              })
              .select('id')
              .single();

            if (threadError) throw threadError;
            targetThreadId = threadData.id;

            await supabase.from('msg_thread_participants').insert([
               { thread_id: targetThreadId, user_id: userRow.id },
               { thread_id: targetThreadId, user_id: targetUserId }
            ]);
        }

        if (text && targetThreadId) {
            await supabase.from('msg_thread_messages').insert({
               thread_id: targetThreadId,
               sender_id: userRow.id,
               body: text,
               attachments: []
            });
        }

        await fetchThreads();
        if (targetThreadId) {
           setSelectedThreadId(targetThreadId);
           setIsNewConvModalVisible(false);
        }

     } catch (err) {
        console.error("Error creating thread:", err);
        Alert.alert("Error", "Failed to create conversation.");
     } finally {
        setSendingStart(false);
     }
  };

  // ... Image/Poll handlers ...
  const handlePickImage = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*', // Allow all file types
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        await uploadAttachment(result.assets[0]);
      }
    } catch (err) {
      console.error("Document picker error:", err);
      Alert.alert("Error", "Failed to pick file");
    }
  };

  const uploadAttachment = async (asset: DocumentPicker.DocumentPickerAsset) => {
    if (!selectedThreadId || !userRow || !supervisorId) return;
    
    setUploading(true);
    try {
      // 1. Read file
      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();
      
      // 2. Upload to Supabase
      const fileName = asset.name || `file_${Date.now()}`;
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `supervisor/${supervisorId}/${selectedThreadId}/${Date.now()}_${safeName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('messenger')
        .upload(path, arrayBuffer, {
          contentType: asset.mimeType || 'application/octet-stream',
          cacheControl: '3153600000',
          upsert: false
        });
        
      if (uploadError) throw uploadError;
      
      // 3. Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('messenger')
        .getPublicUrl(path);
        
      // 4. Create Message
      const attachment = {
        name: fileName,
        size: asset.size,
        type: asset.mimeType?.startsWith('image/') ? 'image' : 'file',
        url: publicUrl,
        path: path
      };
      
      const { error: msgError } = await supabase.from('msg_thread_messages').insert({
         thread_id: selectedThreadId,
         sender_id: userRow.id,
         body: '', 
         attachments: [attachment]
      });
      
      if (msgError) throw msgError;
      
      fetchMessages(selectedThreadId, false);
      
    } catch (err: any) {
      console.error("Upload error:", err);
      Alert.alert("Error", "Failed to upload file: " + err.message);
    } finally {
      setUploading(false);
    }
  };
  
  const handleOpenFile = (url: string) => {
    Linking.openURL(url).catch(err => Alert.alert('Error', 'Could not open file'));
  };
  
  // ... Polls logic ...
  const openPollComposer = () => {
    setShowPollComposer(true);
    setPollQuestion('');
    setPollOptions(['Yes', 'No']);
    setPollMultiple(false);
  };

  const handleCreatePoll = async () => {
     if (!selectedThreadId || !userRow || !pollQuestion.trim()) return;
     setUploading(true);

     try {
        const tempId = `temp_${Date.now()}`;
        const tempPoll: Poll = {
          id: tempId,
          question: pollQuestion,
          multiple_choice: pollMultiple,
          options: pollOptions.filter(o => o.trim().length > 0).map((label, idx) => ({
             id: `temp_opt_${idx}`,
             label,
             position: idx,
             votes: 0,
             selected: false
          }))
        };

        // Optimistic update
        const optimisticMsg: Message = {
           id: tempId,
           content: '',
           created_at: new Date().toISOString(),
           sender_id: userRow.id,
           sender: userRow,
           attachments: [],
           poll: tempPoll
        };

        setMessages(prev => [optimisticMsg, ...prev]);
        setShowPollComposer(false);
        setPollQuestion('');
        setPollOptions(['Yes', 'No']);

        const { data: msgData, error: msgError } = await supabase
           .from('msg_thread_messages')
           .insert({
              thread_id: selectedThreadId,
              sender_id: userRow.id,
              body: '', // Empty body for polls
              attachments: []
           })
           .select('id')
           .single();
        
        if (msgError) throw msgError;
        const messageId = msgData.id;

        const { data: pollData, error: pollError } = await supabase
           .from('msg_polls')
           .insert({
              message_id: messageId,
              question: tempPoll.question,
              multiple_choice: tempPoll.multiple_choice
           })
           .select('id')
           .single();
        
        if (pollError) throw pollError;
        const pollId = pollData.id;

        const optionsToInsert = tempPoll.options.map(opt => ({
              poll_id: pollId,
              label: opt.label,
              position: opt.position
           }));
        
        const { error: optError } = await supabase
           .from('msg_poll_options')
           .insert(optionsToInsert);
        
        if (optError) throw optError;

        // Update state with REAL ID and Poll Data immediately to prevent flickering/blank message
        // This avoids waiting for the fetch/realtime which might race against the database commit
        const finalPoll: Poll = {
           id: pollId,
           question: tempPoll.question,
           multiple_choice: tempPoll.multiple_choice,
           options: optionsToInsert.map((o, i) => ({
              id: `new_opt_${i}`, // We don't have real option IDs yet, but that's okay for display until refresh
              label: o.label,
              position: o.position,
              votes: 0,
              selected: false
           }))
        };

        const finalMsg: Message = {
           id: messageId, // Real UUID
           content: '',
           created_at: new Date().toISOString(),
           sender_id: userRow.id,
           sender: userRow,
           attachments: [],
           poll: finalPoll
        };

        setMessages(prev => prev.map(m => m.id === tempId ? finalMsg : m));

        // Background fetch to eventually get consistent IDs for options etc.
        // Delay slightly to ensure DB is consistent
        setTimeout(() => {
           fetchMessages(selectedThreadId, false);
        }, 1000);

     } catch (err: any) {
        console.error("Poll creation error:", err);
        Alert.alert("Error", "Failed to create poll: " + err.message);
        // Revert optimistic update by removing the temp message
        setMessages(prev => prev.filter(m => m.id !== tempId));
     } finally {
        setUploading(false);
     }
  };

  const handleVote = async (pollId: string, optionId: string, currentSelected: boolean, multiple: boolean) => {
     if (!userRow) return;
     
     // Optimistic Update for Vote
     setMessages(prev => prev.map(m => {
        if (m.poll?.id === pollId) {
           const newOptions = m.poll.options.map(o => {
              if (o.id === optionId) {
                 return {
                    ...o,
                    selected: !currentSelected,
                    votes: currentSelected ? o.votes - 1 : o.votes + 1
                 };
              }
              if (!multiple && !currentSelected && o.selected) {
                 // Deselect others if single choice and we are selecting a new one
                 return { ...o, selected: false, votes: o.votes - 1 };
              }
              return o;
           });
           return { ...m, poll: { ...m.poll, options: newOptions } };
        }
        return m;
     }));

     try {
        if (currentSelected) {
           await supabase.from('msg_poll_votes').delete().match({ poll_id: pollId, option_id: optionId, voter_id: userRow.id });
        } else {
           if (!multiple) {
              await supabase.from('msg_poll_votes').delete().match({ poll_id: pollId, voter_id: userRow.id });
           }
           await supabase.from('msg_poll_votes').insert({ poll_id: pollId, option_id: optionId, voter_id: userRow.id });
        }
        if (selectedThreadId) fetchMessages(selectedThreadId);
     } catch (err) {
        console.error("Voting error:", err);
     }
  };

  // Action Sheet Handlers
  const openActionSheet = (target: Message) => {
    setActionTarget(target);
    setActionSheetVisible(true);
  };

  const closeActionSheet = () => {
    setActionSheetVisible(false);
    setActionTarget(null);
  };

  const reportReasons = [
    'Spam or advertising',
    'Harassment or bullying',
    'Hate speech',
    'Nudity or sexual content',
    'Violence or dangerous acts',
    'Other',
  ];

  const submitReport = async (reason: string) => {
    try {
      if (!actionTarget || !userRow) return;
      const payload = {
        message_id: typeof actionTarget.id === 'string' ? Number(actionTarget.id) || null : actionTarget.id,
        reported_user_id: actionTarget.sender_id,
        reporter_user_id: userRow.id,
        reason,
        source: 'staff',
      };
      const { error } = await supabase
        .from('msg_thread_reports')
        .insert(payload);
      if (error) throw error;
      setShowReportSheet(false);
      Alert.alert('Reported', 'Thanks for your report.');
    } catch (e: any) {
      console.error('Report failed:', e);
      setShowReportSheet(false);
      Alert.alert('Report failed', e?.message || 'Unknown error');
    }
  };

  const addBlockedUser = async (targetUserId: string) => {
    if (!userRow) return;
    try {
      const { error } = await supabase
        .from('msg_thread_blocked')
        .insert({ blocked_user_id: targetUserId, blocked_by: userRow.id });
      if (error && !String(error.message).includes('duplicate')) {
        throw error;
      }
      // Update blocked users list
      const updatedBlocked = [...blockedUserIds, targetUserId];
      setBlockedUserIds(updatedBlocked);
      
      // Filter out messages from blocked user immediately
      setMessages(prev => prev.filter(m => m.sender_id !== targetUserId));
      
      // Refresh messages to ensure consistency
      if (selectedThreadId) {
        fetchMessages(selectedThreadId, false);
      }
      
      // Refresh threads to remove threads with blocked user
      fetchThreads(false);
      
      const { data } = await supabase
        .from('users')
        .select('first_name, family_name, name')
        .eq('id', targetUserId)
        .single();
      const name = data?.name || `${data?.first_name || ''} ${data?.family_name || ''}`.trim() || targetUserId;
      Alert.alert('User blocked', `${name} has been blocked.`);
      closeActionSheet();
    } catch (e: any) {
      console.error('Block failed:', e);
      Alert.alert('Error', e?.message || 'Failed to block user');
    }
  };

  const handleSendMessage = async () => {
     if (!newMessageText.trim() || !selectedThreadId || !userRow) return;
     
     // Check if we're trying to send to a blocked user
     const selectedThread = threads.find(t => t.id === selectedThreadId);
     if (selectedThread && !selectedThread.is_group) {
        const otherParticipant = selectedThread.participants.find(p => p.user_id !== userRow.id);
        if (otherParticipant && blockedUserIds.includes(otherParticipant.user_id)) {
           Alert.alert('Cannot send message', 'You have blocked this user. Unblock them to send messages.');
           return;
        }
     }
     
     const text = newMessageText.trim();
     setNewMessageText('');

     // Optimistic update
     const tempId = `temp_${Date.now()}`;
     const optimisticMsg: Message = {
        id: tempId,
        content: text,
        created_at: new Date().toISOString(),
        sender_id: userRow.id,
        attachments: [],
        readBy: [], // Add readBy for consistency
        // Poll is undefined
     };

     setMessages(prev => [optimisticMsg, ...prev]);

     // Update thread list immediately
     setThreads(prev => prev.map(t => {
        if (t.id === selectedThreadId) {
           return {
              ...t,
              updated_at: new Date().toISOString(),
              last_message: {
                 content: text,
                 created_at: new Date().toISOString(),
                 sender_id: userRow.id
              }
           };
        }
        return t;
     }).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()));

     try {
        const { data, error } = await supabase.from('msg_thread_messages').insert({
           thread_id: selectedThreadId,
           sender_id: userRow.id,
           body: text,
           attachments: []
        }).select().single();

        if (error) throw error;

        // Replace optimistic message with real one
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: data.id, created_at: data.created_at } : m));
        
        // No need to fetchThreads() or fetchMessages() as we updated optimistically and Realtime will handle others
     } catch (err) {
        console.error("Error sending message:", err);
        // Revert optimistic update on failure
        setMessages(prev => prev.filter(m => m.id !== tempId));
        setNewMessageText(text); // restore text
        Alert.alert("Error", "Failed to send message. Please try again.");
     }
  };

   // --- Helpers ---
   const formatMessageTime = (dateStr: string) => {
      if (!dateStr) return '';
      try {
         const date = parseISO(dateStr);
         return format(date, 'dd.MM.yyyy HH:mm');
      } catch (e) {
         return '';
      }
   };

  const getThreadTitle = (thread: MessageThread) => {
    if (thread.is_group && thread.title) return thread.title;
    const names = thread.participants
      .filter(p => p.user_id !== userRow?.id)
      .map(p => `${p.users?.first_name} ${p.users?.family_name}`)
      .filter(n => n.trim().length > 0)
      .join(', ');
    return names || 'Unbekannt';
  };

  const filteredThreads = useMemo(() => {
    return threads.filter(t => {
      if (searchTerm) {
         const title = getThreadTitle(t).toLowerCase();
         const lastMsg = t.last_message?.content.toLowerCase() || '';
         if (!title.includes(searchTerm.toLowerCase()) && !lastMsg.includes(searchTerm.toLowerCase())) {
           return false;
         }
      }
      if (filter === 'unread') return t.unread;
      return true;
    });
  }, [threads, searchTerm, filter, userRow]);

  const filteredParents = useMemo(() => {
     // With dynamic search, parentOptions ARE the filtered results
     return parentOptions;
  }, [parentOptions]);

  const selectedThread = threads.find(t => t.id === selectedThreadId);

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator size="large" />
        <ThemedText style={{ marginTop: 10 }}>Nachrichten werden geladen...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
       <View style={styles.mainRow}>
         {showLeftColumn && (
           <View style={[styles.leftColumn, { width: isMobile ? '100%' : leftColumnWidth }]}>
              <View style={{ flex: 1 }}>
                <View style={{ flex: isMobile ? 1 : 1 }}>
                   <View style={styles.header}>
                      <Text style={styles.title}>Nachrichten</Text>
                   </View>
                   <View style={styles.searchContainer}>
                     <Ionicons name="search" size={16} color="#999" style={{ marginRight: 8 }} />
                     <TextInput style={styles.searchInput} placeholder="Suchen..." value={searchTerm} onChangeText={setSearchTerm} placeholderTextColor="#999" />
                   </View>
                   <View style={styles.filterRow}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
                         <FilterChip label="Alle" active={filter === 'all'} onPress={() => setFilter('all')} />
                         <FilterChip label="Ungelesen" active={filter === 'unread'} onPress={() => setFilter('unread')} />
                         <FilterChip label="Eltern" active={filter === 'parents'} onPress={() => setFilter('parents')} />
                         <FilterChip label="Lehrer" active={filter === 'teachers'} onPress={() => setFilter('teachers')} />
                      </ScrollView>
                   </View>
                   <View style={{ flex: 1 }}>
                      <FlatList
                         data={filteredThreads}
                         keyExtractor={item => item.id}
                         contentContainerStyle={styles.listContent}
                                 renderItem={({ item }) => (
                                    <TouchableOpacity 
                                       style={[styles.threadItem, { backgroundColor: selectedThreadId === item.id ? '#000000' : 'transparent' }, selectedThreadId === item.id && !isMobile && styles.threadItemSelected]}
                                       onPress={() => setSelectedThreadId(item.id)}
                                    >
                               <View style={styles.avatarContainer}>
                                  <View style={[styles.avatar, styles.avatarPlaceholder]}><ThemedText style={styles.avatarInitials}>{getThreadTitle(item).substring(0, 2).toUpperCase()}</ThemedText></View>
                               </View>
                               <View style={styles.threadContent}>
                                  <View style={styles.threadHeader}>
                                     <ThemedText style={[styles.threadTitle, selectedThreadId === item.id ? { color: '#fff' } : { color: '#000' }]} numberOfLines={1}>{getThreadTitle(item)}</ThemedText>
                                     <ThemedText style={[styles.timestamp, selectedThreadId === item.id ? { color: 'rgba(255,255,255,0.7)' } : { color: '#8E8E93' }]}>{item.updated_at ? formatDistanceToNow(parseISO(item.updated_at), { addSuffix: true, locale: de }) : ''}</ThemedText>
                                  </View>
                                  <ThemedText style={[styles.previewText, selectedThreadId === item.id ? { color: 'rgba(255,255,255,0.7)' } : { color: '#8E8E93' }]} numberOfLines={2}>{item.last_message?.content || 'Keine Nachrichten'}</ThemedText>
                               </View>
                            </TouchableOpacity>
                         )}
                      />
                   </View>
                   <View style={styles.newConvButtonContainer}>
                      <TouchableOpacity style={styles.newConvButton} onPress={openNewConversationModal}>
                         <Ionicons name="add" size={20} color="#fff" />
                         <Text style={styles.newConvButtonText}>Neue Unterhaltung</Text>
                      </TouchableOpacity>
                   </View>
                </View>
              </View>
           </View>
         )}

         {showMiddleColumn && (
           <View style={[styles.middleColumn, isMobile && { margin: 0, borderWidth: 0, borderRadius: 0 }, { flex: middleColumnFlex }]}>
             {/* Shared Header */}
             <View style={[styles.chatHeader, { flexShrink: 0 }]}>
                 <View style={styles.chatHeaderLeft}>
                    {isMobile && selectedThread && (
                       <TouchableOpacity onPress={() => setSelectedThreadId(null)} style={{ marginRight: 8 }}>
                          <Ionicons name="arrow-back" size={24} color="#007AFF" />
                       </TouchableOpacity>
                    )}
                    {selectedThread ? (
                        <>
                            <View style={[styles.avatarSmall, styles.avatarPlaceholder]}>
                                <ThemedText style={styles.avatarInitialsSmall}>{getThreadTitle(selectedThread).substring(0, 2).toUpperCase()}</ThemedText>
                            </View>
                            <ThemedText type="subtitle" style={{ marginLeft: 10, flex: 1, color: '#000000' }} numberOfLines={1}>{getThreadTitle(selectedThread)}</ThemedText>
                        </>
                    ) : (
                        <>
                             <View style={styles.questionIcon}><Ionicons name="help" size={18} color="#666" /></View>
                             <ThemedText style={{ fontSize: 16, fontWeight: '500', marginLeft: 10 }}>Unbekannter Benutzer</ThemedText>
                        </>
                    )}
                 </View>
                 <TouchableOpacity 
                    onPress={() => isMobile ? setIsParticipantsModalVisible(true) : setShowParticipantsOverlay(!showParticipantsOverlay)} 
                    style={{ padding: 8, marginRight: 2}}
                 >
                    <Ionicons name={!isMobile && showParticipantsOverlay ? "people" : "people-outline"} size={24} color="#007AFF" />
                 </TouchableOpacity>
            </View>

             {selectedThread ? (
                <KeyboardAvoidingView 
                   behavior={Platform.OS === "ios" ? "padding" : undefined} 
                   keyboardVerticalOffset={Platform.OS === "ios" ? (isMobile ? 90 : 100) : 0} 
                   style={{ flex: 1, flexDirection: 'column' }}
                >
                    <View style={{ flex: 1, backgroundColor: '#fff' }}>
                        <View style={[styles.chatArea, { flex: 1 }]}>
                           {loadingMessages ? (
                              <ActivityIndicator style={{ marginTop: 20 }} />
                           ) : (
                              <FlatList
                                 ref={flatListRef}
                                 data={messages}
                                 inverted
                                 keyExtractor={item => item.id}
                                 contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
                                 renderItem={({ item }) => {
                                    const isMe = item.sender_id === userRow?.id;
                                    const senderName = isMe 
                                       ? (userRow?.first_name && userRow?.family_name ? `${userRow.first_name} ${userRow.family_name}` : 'Ich') 
                                       : (item.sender ? `${item.sender.first_name} ${item.sender.family_name}` : 'Unbekannt');
                                    const senderRole = item.sender?.user_type || 'child';
   
                                    return (
                                       <TouchableOpacity 
                                          activeOpacity={1}
                                          onLongPress={() => !isMe && openActionSheet(item)}
                                          style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '75%' }}
                                       >
                                          <View style={[styles.messageBubble, isMe ? styles.messageBubbleMe : styles.messageBubbleOther]}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 6 }}>
                                               <Text style={{ fontSize: 12, fontWeight: '600', color: isMe ? '#fff' : '#000' }}>{senderName}</Text>
                                               {!isMe && <RoleBadge role={senderRole} />}
                                            </View>
                                            <ThemedText style={isMe ? styles.messageTextMe : styles.messageTextOther}>{item.content}</ThemedText>
                                         {item.attachments && item.attachments.map((att: any, idx: number) => (
                                           att.type === 'image' ? (
                                             <TouchableOpacity key={idx} onPress={() => setPreviewImage(att.url)}>
                                                <Image source={{ uri: att.url }} style={{ width: 200, height: 200, borderRadius: 8, marginTop: 8 }} resizeMode="cover" />
                                             </TouchableOpacity>
                                           ) : (
                                             <TouchableOpacity key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, backgroundColor: 'rgba(0,0,0,0.05)', padding: 8, borderRadius: 4 }} onPress={() => handleOpenFile(att.url)}>
                                                <Ionicons name="document-text" size={20} color={isMe ? "#fff" : "#000"} style={{ marginRight: 8 }} />
                                                <ThemedText style={{ fontSize: 12, color: isMe ? "#fff" : "#000", textDecorationLine: 'underline' }}>{att.name}</ThemedText>
                                             </TouchableOpacity>
                                           )
                                         ))}
                                         {item.poll && (
                                             <View style={styles.pollContainer}>
                                                {item.content ? null : <ThemedText style={[styles.pollQuestion, { color: isMe ? '#fff' : '#000' }]}>{item.poll.question}</ThemedText>}
                                                {item.content ? <ThemedText style={[styles.pollQuestion, { color: isMe ? '#fff' : '#000', marginTop: 8 }]}>{item.poll.question}</ThemedText> : null}
                                                {item.poll.options.map((opt: any) => {
                                                   const totalVotes = item.poll!.options.reduce((sum: number, o: any) => sum + o.votes, 0);
                                                   const percentage = totalVotes > 0 ? (opt.votes / totalVotes) * 100 : 0;
                                                   return (
                                                      <TouchableOpacity 
                                                         key={opt.id} 
                                                         style={[styles.pollOption, { borderColor: isMe ? 'rgba(255,255,255,0.3)' : '#E5E5EA' }]}
                                                         onPress={() => handleVote(item.poll!.id, opt.id, opt.selected, item.poll!.multiple_choice)}
                                                      >
                                                         <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, zIndex: 1 }}>
                                                            <Text style={{ fontSize: 14, fontWeight: opt.selected ? '700' : '400', color: isMe ? '#fff' : '#000' }}>{opt.label} {opt.selected && '✓'}</Text>
                                                            <Text style={{ fontSize: 12, color: isMe ? 'rgba(255,255,255,0.8)' : '#666' }}>{opt.votes}</Text>
                                                         </View>
                                                         <View style={[styles.progressBarBG, { backgroundColor: isMe ? 'rgba(255,255,255,0.2)' : '#F2F2F7' }]}>
                                                            <View style={[styles.progressBarFill, { width: `${percentage}%`, backgroundColor: isMe ? 'rgba(255,255,255,0.5)' : '#007AFF' }]} />
                                                         </View>
                                                      </TouchableOpacity>
                                                   );
                                                })}
                                             </View>
                                          )}
                                         <View style={styles.messageFooter}>
                                             <Text style={[styles.messageTime, isMe ? { color: 'rgba(255,255,255,0.7)' } : {}]}>
                                                {format(parseISO(item.created_at), 'dd.MM.yyyy HH:mm')}
                                             </Text>
                                            {isMe && (
                                               <View style={{ flexDirection: 'row', marginLeft: 4 }}>
                                                  <Ionicons name="checkmark" size={16} color={item.readBy && item.readBy.length > 0 ? '#5AC8FA' : '#C7C7CC'} />
                                                  {(item.readBy && item.readBy.length > 0) && (
                                                     <Ionicons name="checkmark" size={16} color="#5AC8FA" style={{ marginLeft: -10 }} />
                                                  )}
                                               </View>
                                            )}
                                          </View>
                                       </View>
                                       </TouchableOpacity>
                                    );
                                 }}
                              />
                           )}
                        </View>
                    </View>
   
                    {/* Poll Composer */}
                    {showPollComposer && (
                       <View style={styles.pollComposer}>
                          <View style={styles.pollComposerHeader}>
                             <Text style={styles.pollComposerTitle}>Create poll</Text>
                             <TouchableOpacity onPress={() => setShowPollComposer(false)}>
                                <Ionicons name="close" size={20} color="#666" />
                             </TouchableOpacity>
                          </View>
                          <TextInput
                             style={styles.pollQuestionInput}
                             placeholder="Question..."
                             value={pollQuestion}
                             onChangeText={setPollQuestion}
                          />
                          {pollOptions.map((opt, idx) => (
                             <View key={idx} style={styles.pollOptionInputRow}>
                                <TextInput
                                   style={styles.pollOptionInput}
                                   placeholder={`Option ${idx + 1}`}
                                   value={opt}
                                   onChangeText={(text) => {
                                      const newOpts = [...pollOptions];
                                      newOpts[idx] = text;
                                      setPollOptions(newOpts);
                                   }}
                                />
                                {pollOptions.length > 2 && (
                                   <TouchableOpacity 
                                      style={styles.deleteOptionButton} 
                                      onPress={() => {
                                         const newOpts = pollOptions.filter((_, i) => i !== idx);
                                         setPollOptions(newOpts);
                                      }}
                                   >
                                      <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                                   </TouchableOpacity>
                                )}
                             </View>
                          ))}
                          <TouchableOpacity style={styles.addOptionButton} onPress={() => setPollOptions([...pollOptions, ''])}>
                             <Text style={styles.addOptionText}>+ Add option</Text>
                          </TouchableOpacity>
                          <View style={styles.pollSettings}>
                             <Text>Multiple</Text>
                             <Switch value={pollMultiple} onValueChange={setPollMultiple} />
                          </View>
                          <TouchableOpacity style={styles.createPollButton} onPress={handleCreatePoll} disabled={uploading}>
                             <Text style={styles.createPollButtonText}>{uploading ? 'Sending...' : 'Send poll'}</Text>
                          </TouchableOpacity>
                       </View>
                    )}
   
                    <View style={[styles.inputContainer, { backgroundColor: '#fff', minHeight: 60 }]}>
                       <TouchableOpacity style={styles.inputIcon} onPress={openPollComposer}>
                          <Ionicons name="stats-chart" size={24} color="#007AFF" />
                       </TouchableOpacity>
                       <TouchableOpacity style={styles.inputIcon} onPress={handlePickImage}>
                          <Ionicons name="attach" size={24} color="#007AFF" />
                       </TouchableOpacity>
                       <TextInput style={styles.messageInput} placeholder="Nachricht schreiben..." placeholderTextColor="#999" value={newMessageText} onChangeText={setNewMessageText} onSubmitEditing={handleSendMessage} />
                       <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage}>
                          <Ionicons name="send" size={18} color="#fff" />
                       </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
             ) : (
                <KeyboardAvoidingView 
                   behavior={Platform.OS === "ios" ? "padding" : undefined} 
                   keyboardVerticalOffset={Platform.OS === "ios" ? (isMobile ? 90 : 100) : 0} 
                   style={{ flex: 1, flexDirection: 'column' }}
                >
                    <View style={{ flex: 1, padding: 20, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' }}>
                        <ThemedText style={{ color: '#666', fontSize: 16 }}>Wählen Sie eine Unterhaltung aus.</ThemedText>
                    </View>
                    
                    <View style={[styles.inputContainer, { backgroundColor: '#fff', minHeight: 60, opacity: 0.5 }]}>
                       <TouchableOpacity style={styles.inputIcon} disabled={true}>
                          <Ionicons name="stats-chart" size={24} color="#ccc" />
                       </TouchableOpacity>
                       <TouchableOpacity style={styles.inputIcon} disabled={true}>
                          <Ionicons name="image" size={24} color="#ccc" />
                       </TouchableOpacity>
                       <TextInput 
                          style={[styles.messageInput, { backgroundColor: '#f5f5f5', color: '#999' }]} 
                          placeholder="Wählen Sie eine Unterhaltung..." 
                          placeholderTextColor="#999" 
                          editable={false}
                       />
                       <TouchableOpacity style={[styles.sendButton, { backgroundColor: '#ccc' }]} disabled={true}>
                          <Ionicons name="send" size={18} color="#fff" />
                       </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
             )}

             {!isMobile && showParticipantsOverlay && (
                  <View style={styles.participantsOverlay}>
                     <View style={[styles.columnHeader, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                        <ThemedText type="subtitle" style={[styles.columnTitle, { color: '#000' }]}>Participants</ThemedText>
                        <TouchableOpacity onPress={() => setShowParticipantsOverlay(false)}>
                           <Ionicons name="close" size={24} color="#000" />
                        </TouchableOpacity>
                     </View>
                    {selectedThread ? (
                       <FlatList 
                          data={selectedThread?.participants || []}
                          keyExtractor={item => item.user_id}
                          contentContainerStyle={{ paddingBottom: 20 }}
                          renderItem={({ item }) => (
                             <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#fff', borderRadius: 8, marginHorizontal: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                   <View style={styles.avatar}>
                                      <ThemedText style={styles.avatarInitials}>{item.users?.first_name?.[0]}{item.users?.family_name?.[0]}</ThemedText>
                                   </View>
                               <View style={{ flex: 1 }}>
                                  <ThemedText style={{ fontWeight: '600', fontSize: 14, color: '#000' }}>{item.users?.first_name} {item.users?.family_name}</ThemedText>
                                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                                     <RoleBadge role={item.users?.user_type || (item.user_id === supervisorId ? 'supervisor' : 'parent')} />
                                     {item.status === 'accepted' && (
                                            <View style={{ backgroundColor: '#F4F4F5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12 }}>
                                               <Text style={{ color: '#52525B', fontSize: 10, fontWeight: '500' }}>ACCEPTED</Text>
                                            </View>
                                         )}
                                      </View>
                                   </View>
                                </View>
                             </View>
                          )}
                          ListEmptyComponent={<Text style={{ textAlign: 'center', color: '#999', padding: 20 }}>Keine Teilnehmer</Text>}
                       />
                    ) : (
                       <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                          <Text style={{ color: '#999' }}>Keine Teilnehmer</Text>
                       </View>
                    )}
                 </View>
             )}
           </View>
         )}
       </View>
       
         {/* Bottom spacer for Tab Bar - needed for mobile or iOS (absolute tabs) */}
       {(isMobile || Platform.OS === 'ios') && <View style={{ height: 95 }} />}
       
       <Modal visible={isNewConvModalVisible} animationType="fade" transparent={true} onRequestClose={() => setIsNewConvModalVisible(false)}>
          <View style={styles.modalOverlay}>
             <View style={styles.modalContainer}>
                <View style={styles.modalHeader}>
                   <ThemedText type="subtitle">Neue Unterhaltung</ThemedText>
                   <TouchableOpacity onPress={() => setIsNewConvModalVisible(false)}><Ionicons name="close" size={24} color="#000" /></TouchableOpacity>
                </View>
                <View style={styles.modalBody}>
                   <View style={styles.modalLeft}>
                      <Text style={styles.modalLabel}>Kind oder Erziehungsberechtigte suchen</Text>
                      <View style={styles.modalSearchBox}>
                         <Ionicons name="search" size={16} color="#999" />
                         <TextInput 
                            style={styles.modalSearchInput} 
                            placeholder="Tippen, um zu suchen..." 
                            value={parentSearch} 
                            onChangeText={setParentSearch}
                            autoFocus
                         />
                      </View>
                      <View style={styles.resultsHeader}>
                         <Text style={styles.resultsHeaderText}>Ergebnisse</Text>
                         <View style={styles.resultsActions}>
                            <Text style={styles.resultsActionText}>↕ Navigieren</Text>
                            <Text style={styles.resultsActionText}>↩ Auswählen</Text>
                            <Text style={styles.resultsActionText}>Esc Schließen</Text>
                         </View>
                      </View>
                      {loadingParents ? (
                         <ActivityIndicator style={{ marginTop: 20 }} />
                      ) : (
                        <FlatList 
                           data={filteredParents} 
                           keyExtractor={(item, index) => item.id + index} 
                           style={styles.resultsList}
                           ListEmptyComponent={<Text style={{ padding: 20, textAlign: 'center', color: '#999' }}>Keine Ergebnisse</Text>}
                           renderItem={({ item }) => (
                           <TouchableOpacity style={[styles.parentItem, selectedRecipient?.id === item.id && styles.parentItemSelected]} onPress={() => setSelectedRecipient(item)}>
                              <View style={{ flex: 1 }}><ThemedText style={{ fontSize: 13, fontWeight: '600' }}>{item.name}</ThemedText><ThemedText style={{ fontSize: 11, color: '#666' }}>{item.email}</ThemedText></View>
                           </TouchableOpacity>
                        )} />
                      )}
                   </View>
                   <View style={styles.modalRight}>
                      <Text style={styles.modalLabel}>Empfänger</Text>
                      <View style={styles.recipientBox}>
                         {selectedRecipient ? (
                            <View style={styles.recipientChip}><Text style={styles.recipientName}>{selectedRecipient.name}</Text></View> 
                         ) : (
                            <Text style={styles.recipientPlaceholder}>Wählen Sie einen Empfänger aus der Liste links.</Text>
                         )}
                      </View>
                      
                      <Text style={[styles.modalLabel, { marginTop: 16 }]}>Erste Nachricht</Text>
                      <TextInput 
                         style={styles.modalMessageInput} 
                         placeholder="Schreiben Sie die erste Nachricht..." 
                         multiline 
                         value={initialMessage} 
                         onChangeText={setInitialMessage} 
                         textAlignVertical="top"
                      />
                      
                      <View style={styles.modalActions}>
                         <TouchableOpacity style={styles.modalButtonCancel} onPress={() => setIsNewConvModalVisible(false)}>
                            <Text style={styles.modalButtonTextCancel}>Abbrechen</Text>
                         </TouchableOpacity>
                         <TouchableOpacity style={styles.modalButtonStart} onPress={handleStartConversation}>
                            <Text style={styles.modalButtonTextStart}>Start</Text>
                         </TouchableOpacity>
                      </View>
                   </View>
                </View>
             </View>
          </View>
       </Modal>

       <Modal visible={isParticipantsModalVisible} animationType="fade" transparent={true} onRequestClose={() => setIsParticipantsModalVisible(false)}>
          <View style={styles.modalOverlay}>
             <View style={[styles.modalContainer, { maxHeight: 500, maxWidth: 500 }]}>
                <View style={styles.modalHeader}>
                   <ThemedText type="subtitle" style={{ color: '#000' }}>Participants</ThemedText>
                   <TouchableOpacity onPress={() => setIsParticipantsModalVisible(false)}><Ionicons name="close" size={24} color="#000" /></TouchableOpacity>
                </View>
                <View style={{ padding: 16, flex: 1 }}>
                   <FlatList 
                      data={selectedThread?.participants || []}
                      keyExtractor={item => item.user_id}
                      renderItem={({ item }) => (
                         <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                               <View style={styles.avatar}>
                                  <ThemedText style={styles.avatarInitials}>{item.users?.first_name?.[0]}{item.users?.family_name?.[0]}</ThemedText>
                               </View>
                               <View>
                                  <ThemedText style={{ fontWeight: '600', color: '#000' }}>{item.users?.first_name} {item.users?.family_name}</ThemedText>
                                  <RoleBadge role={item.users?.user_type || (item.user_id === supervisorId ? 'supervisor' : 'parent')} />
                               </View>
                            </View>
                         </View>
                      )}
                      ListEmptyComponent={<Text style={{ textAlign: 'center', color: '#999' }}>Keine Teilnehmer</Text>}
                   />
                </View>
             </View>
          </View>
       </Modal>
       
       {/* Image Preview Modal */}
       <Modal visible={!!previewImage} transparent={true} animationType="fade" onRequestClose={() => setPreviewImage(null)}>
         <View style={styles.imagePreviewOverlay}>
           <TouchableOpacity style={styles.closePreviewButton} onPress={() => setPreviewImage(null)}>
             <Ionicons name="close" size={30} color="#fff" />
           </TouchableOpacity>
           {previewImage && (
             <Image source={{ uri: previewImage }} style={styles.fullImage} resizeMode="contain" />
           )}
         </View>
       </Modal>

       {/* Action Sheet */}
       {actionSheetVisible && actionTarget && (
         <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
           <Pressable onPress={closeActionSheet} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.2)' }} />
           <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#ffffff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: Math.max(insets.bottom, 8) + 80, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb' }}>
             <View style={{ width: 50, height: 5, backgroundColor: '#e5e7eb', borderRadius: 3, alignSelf: 'center', marginBottom: 8 }} />
             <TouchableOpacity
               style={{ paddingHorizontal: 16, paddingVertical: 14 }}
               onPress={() => {
                 if (actionTarget.sender_id) addBlockedUser(actionTarget.sender_id);
                 closeActionSheet();
               }}
             >
               <Text style={{ color: '#b91c1c', fontWeight: '600' }}>Block user</Text>
             </TouchableOpacity>
             <TouchableOpacity
               style={{ paddingHorizontal: 16, paddingVertical: 14 }}
               onPress={() => {
                 setShowReportSheet(true);
                 setActionSheetVisible(false);
               }}
             >
               <Text style={{ color: '#111827' }}>Report</Text>
             </TouchableOpacity>
             <TouchableOpacity
               style={{ paddingHorizontal: 16, paddingVertical: 14 }}
               onPress={closeActionSheet}
             >
               <Text style={{ color: '#6b7280' }}>Abbrechen</Text>
             </TouchableOpacity>
           </View>
         </View>
       )}

       {/* Report Sheet */}
       {showReportSheet && actionTarget && (
         <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
           <Pressable onPress={() => setShowReportSheet(false)} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }} />
           <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#ffffff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: Math.max(insets.bottom, 8) + 80, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb' }}>
             <View style={{ width: 50, height: 5, backgroundColor: '#e5e7eb', borderRadius: 3, alignSelf: 'center', marginBottom: 8 }} />
             <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827', paddingHorizontal: 16, paddingBottom: 8 }}>Report message</Text>
             {reportReasons.map((label) => (
               <TouchableOpacity key={label} style={{ paddingHorizontal: 16, paddingVertical: 14 }} onPress={() => submitReport(label)}>
                 <Text style={{ color: '#111827' }}>{label}</Text>
               </TouchableOpacity>
             ))}
             <TouchableOpacity style={{ paddingHorizontal: 16, paddingVertical: 14 }} onPress={() => setShowReportSheet(false)}>
               <Text style={{ color: '#6b7280' }}>Abbrechen</Text>
             </TouchableOpacity>
           </View>
         </View>
       )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  mainRow: { flex: 1, flexDirection: 'row' },
  leftColumn: { backgroundColor: '#F2F2F7', borderRightWidth: 1, borderRightColor: '#E5E5EA', display: 'flex', flexDirection: 'column' },
  middleColumn: { flex: 1, backgroundColor: '#fff', margin: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E5E5EA', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  rightColumn: { width: '25%', backgroundColor: '#fff', borderLeftWidth: 1, borderLeftColor: '#E5E5EA', display: 'flex', flexDirection: 'column' },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#F2F2F7',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
  },
  columnHeader: { padding: 16, paddingBottom: 8 },
  columnTitle: { fontSize: 18, fontWeight: '700' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 12, height: 36, borderRadius: 8, borderWidth: 1, borderColor: '#E5E5EA', marginTop: 12 },
  searchInput: { flex: 1, height: 36, fontSize: 14, color: '#000' },
  filterRow: { marginBottom: 8, height: 32 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#fff', marginRight: 8, borderWidth: 1, borderColor: '#E5E5EA', justifyContent: 'center', alignItems: 'center' },
  filterChipActive: { backgroundColor: '#000', borderColor: '#000' },
  filterChipText: { fontSize: 12, color: '#666' },
  filterChipTextActive: { color: '#fff', fontWeight: '600' },
  listContent: { padding: 0 },
  emptyState: { padding: 20, alignItems: 'center' },
  emptyStateText: { color: '#999', fontSize: 14 },
  threadItem: { flexDirection: 'row', padding: 12, backgroundColor: 'transparent', borderBottomWidth: 1, borderBottomColor: '#E5E5EA', alignItems: 'center' },
  threadItemSelected: { backgroundColor: '#000000' },
  avatarContainer: { marginRight: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E1E1E1', justifyContent: 'center', alignItems: 'center' },
  avatarSmall: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#E1E1E1', justifyContent: 'center', alignItems: 'center' },
  avatarPlaceholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#E1E1E1' },
  avatarInitials: { fontSize: 14, fontWeight: '600', color: '#666' },
  avatarInitialsSmall: { fontSize: 12, fontWeight: '600', color: '#666' },
  threadContent: { flex: 1, justifyContent: 'center', marginRight: 8 },
  threadHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  threadTitle: { fontSize: 14, fontWeight: '600', flex: 1, marginRight: 8 },
  timestamp: { fontSize: 10, color: '#8E8E93' },
  previewText: { fontSize: 12, color: '#8E8E93', lineHeight: 16 },
  newConvButtonContainer: { padding: 16, borderTopWidth: 1, borderTopColor: '#E5E5EA', paddingBottom: 32 },
  newConvButton: { backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 24, gap: 8, height: 48 },
  newConvButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  participantsContainer: { padding: 16, borderTopWidth: 1, borderTopColor: '#E5E5EA', backgroundColor: '#fff', maxHeight: 250, flexShrink: 0 },
  cardHeader: { marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardContent: { minHeight: 50 },
  chatPlaceholder: { flex: 1, backgroundColor: '#fff' },
  chatPlaceholderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  questionIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  chatHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  chatArea: { flex: 1, backgroundColor: '#fff' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, borderTopColor: '#E5E5EA', gap: 10 },
  inputIcon: { padding: 4 },
  messageInput: { flex: 1, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#E5E5EA', paddingHorizontal: 16, fontSize: 14 },
  sendButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#999', justifyContent: 'center', alignItems: 'center' },
  messageBubble: { maxWidth: '75%', padding: 12, borderRadius: 16, marginBottom: 8 },
  messageBubbleMe: { alignSelf: 'flex-end', backgroundColor: '#007AFF', borderBottomRightRadius: 4 },
  messageBubbleOther: { alignSelf: 'flex-start', backgroundColor: '#F2F2F7', borderBottomLeftRadius: 4 },
  messageTextMe: { color: '#fff', fontSize: 14 },
  messageTextOther: { color: '#000', fontSize: 14 },
  messageTime: { fontSize: 10, color: '#999', marginTop: 4, alignSelf: 'flex-end' },
  pollContainer: { marginTop: 8, width: 250 },
  pollQuestion: { fontWeight: '600', marginBottom: 8 },
  pollOption: { borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 6, backgroundColor: 'transparent', overflow: 'hidden' },
  progressBarBG: { height: 4, backgroundColor: '#F2F2F7', borderRadius: 2, marginTop: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#007AFF', borderRadius: 2 },
  participantsSection: { flex: 1, borderTopWidth: 1, borderTopColor: '#E5E5EA', backgroundColor: '#fff' },
  pollComposer: { padding: 16, backgroundColor: '#f9f9f9', borderTopWidth: 1, borderTopColor: '#e5e5e5' },
  pollComposerHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  pollComposerTitle: { fontWeight: 'bold', fontSize: 16 },
  pollQuestionInput: { backgroundColor: '#fff', padding: 10, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#ddd' },
  pollOptionInputRow: { marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pollOptionInput: { flex: 1, backgroundColor: '#fff', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  deleteOptionButton: { padding: 4 },
  addOptionButton: { padding: 8 },
  addOptionText: { color: '#007AFF' },
  pollSettings: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 10 },
  createPollButton: { backgroundColor: '#007AFF', padding: 12, borderRadius: 8, alignItems: 'center' },
  createPollButtonText: { color: '#fff', fontWeight: 'bold' },
  messageFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { width: '80%', height: '70%', backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', maxWidth: 900, maxHeight: 500 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalBody: { flex: 1, flexDirection: 'row' },
  modalLeft: { flex: 1, borderRightWidth: 1, borderRightColor: '#eee', padding: 16, display: 'flex', flexDirection: 'column' },
  modalRight: { flex: 1, padding: 16, display: 'flex', flexDirection: 'column' },
  modalLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  modalSearchBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E5EA', borderRadius: 4, paddingHorizontal: 8, height: 40, marginBottom: 8, backgroundColor: '#fff' },
  modalSearchInput: { flex: 1, marginLeft: 8, fontSize: 14, height: '100%' },
  resultsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F2F2F7', marginBottom: 4 },
  resultsHeaderText: { fontSize: 12, color: '#666' },
  resultsActions: { flexDirection: 'row', gap: 8 },
  resultsActionText: { fontSize: 10, color: '#999' },
  resultsList: { flex: 1, borderWidth: 1, borderColor: '#F2F2F7', borderRadius: 4 },
  
  recipientBox: { borderWidth: 1, borderColor: '#E5E5EA', borderRadius: 4, padding: 12, minHeight: 60, justifyContent: 'center', backgroundColor: '#fff' },
  recipientPlaceholder: { color: '#999', fontSize: 14, lineHeight: 20 },
  modalMessageInput: { flex: 1, borderWidth: 1, borderColor: '#E5E5EA', borderRadius: 4, padding: 12, fontSize: 14, minHeight: 150, backgroundColor: '#fff' },
  
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F2F2F7' },
  modalButtonCancel: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 4, borderWidth: 1, borderColor: '#E5E5EA', backgroundColor: '#fff' },
  modalButtonTextCancel: { fontSize: 14, color: '#333', fontWeight: '500' },
  modalButtonStart: { paddingVertical: 8, paddingHorizontal: 24, borderRadius: 4, backgroundColor: '#666' },
  modalButtonTextStart: { fontSize: 14, color: '#fff', fontWeight: '600' },
  parentItem: { flexDirection: 'row', padding: 10, borderBottomWidth: 1, borderBottomColor: '#F2F2F7' },
  parentItemSelected: { backgroundColor: '#E5F1FF' },
  recipientChip: { backgroundColor: '#E5E5EA', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' },
  recipientName: { fontSize: 14, fontWeight: '500' },
  participantsOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 300,
    backgroundColor: '#fff',
    borderLeftWidth: 1,
    borderLeftColor: '#E5E5EA',
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
  },
  imagePreviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  closePreviewButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 10,
    padding: 10,
  },
});



