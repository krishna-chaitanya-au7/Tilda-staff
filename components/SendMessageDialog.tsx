import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { ThemedText } from '@/components/themed-text';

interface SendMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supervisorId: string;
  selectedChildIds: string[];
}

interface Recipient {
  id: string; // Parent ID
  name: string;
  email: string;
  childNames: string[];
}

export default function SendMessageDialog({ open, onOpenChange, supervisorId, selectedChildIds }: SendMessageDialogProps) {
  const [step, setStep] = useState<'compose' | 'sending' | 'success'>('compose');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  
  const [messageBody, setMessageBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open && selectedChildIds.length > 0) {
      fetchRecipients();
      setStep('compose');
      setMessageBody('');
    }
  }, [open, selectedChildIds]);

  const fetchRecipients = async () => {
    setLoadingRecipients(true);
    try {
      // 1. Get Children Info + User Data
      const { data: children } = await supabase
        .from('users') // Children users
        .select('id, first_name, family_name, manager_id')
        .in('id', selectedChildIds);

      if (!children) return;

      // 2. Get Parents
      const parentIds = Array.from(new Set(children.map(c => c.manager_id).filter(Boolean))) as string[];
      const { data: parents } = await supabase
        .from('users')
        .select('id, first_name, family_name, email')
        .in('id', parentIds);
      
      if (!parents) return;

      // 3. Map
      const mapped: Recipient[] = parents.map(p => {
        const myChildren = children
          .filter(c => c.manager_id === p.id)
          .map(c => `${c.first_name} ${c.family_name}`);
        
        return {
          id: p.id,
          name: `${p.first_name} ${p.family_name}`,
          email: p.email,
          childNames: myChildren
        };
      });

      setRecipients(mapped);

    } catch (err) {
      console.error("Error fetching recipients:", err);
      Alert.alert("Error", "Failed to load recipients");
    } finally {
      setLoadingRecipients(false);
    }
  };

  const handleSend = async () => {
    if (!messageBody.trim()) {
      Alert.alert("Error", "Please enter a message.");
      return;
    }

    setSending(true);
    setStep('sending');

    try {
      // We need the current user (sender)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get sender's user row id
      const { data: senderRow } = await supabase
        .from('users')
        .select('id')
        .eq('auth_id', user.id)
        .single();
        
      if (!senderRow) throw new Error("User profile not found");

      // Send to each parent individually (create or reuse thread)
      for (const recipient of recipients) {
         await sendToUser(senderRow.id, recipient.id, messageBody);
      }

      setStep('success');
      setTimeout(() => {
        onOpenChange(false);
      }, 1500);

    } catch (err: any) {
      console.error("Send error:", err);
      Alert.alert("Error", "Failed to send messages: " + err.message);
      setStep('compose');
    } finally {
      setSending(false);
    }
  };

  const sendToUser = async (senderId: string, targetUserId: string, text: string) => {
      // 1. Check for existing direct thread
      // Ideally we'd use an RPC or complex query, but for now fetch user's threads and check participants
      // Simplified: Check if thread exists with exactly these 2 participants
      
      // Note: This is heavy for a loop. In production, use a stored procedure `get_or_create_conversation(user_a, user_b)`.
      // We will implement a "create new thread if not exists" logic here.
      
      // Optimization: Just insert a new message? No, need thread_id.
      
      // Let's try to find a thread first.
      const { data: threads } = await supabase
        .from('msg_thread_participants')
        .select('thread_id')
        .eq('user_id', senderId);
      
      const myThreadIds = threads?.map(t => t.thread_id) || [];
      
      let targetThreadId = null;

      if (myThreadIds.length > 0) {
         const { data: existing } = await supabase
           .from('msg_thread_participants')
           .select('thread_id')
           .in('thread_id', myThreadIds)
           .eq('user_id', targetUserId)
           .limit(1);
           
         // We also need to ensure it's a DIRECT thread (not a group with others), 
         // but for now assuming if they share a thread it might be okay to reuse or create new logic.
         // The web app usually checks `is_group` = false.
         
         if (existing && existing.length > 0) {
            // Check if is_group is false
            const { data: threadInfo } = await supabase
              .from('msg_threads')
              .select('id, is_group')
              .eq('id', existing[0].thread_id)
              .single();
              
            if (threadInfo && !threadInfo.is_group) {
               targetThreadId = threadInfo.id;
            }
         }
      }

      if (!targetThreadId) {
         // Create new thread
         const { data: newThread, error: createError } = await supabase
           .from('msg_threads')
           .insert({
             supervisor_id: supervisorId,
             scope: 'direct',
             created_by: senderId,
             is_group: false
           })
           .select('id')
           .single();
           
         if (createError) throw createError;
         targetThreadId = newThread.id;

         // Add participants
         await supabase.from('msg_thread_participants').insert([
            { thread_id: targetThreadId, user_id: senderId },
            { thread_id: targetThreadId, user_id: targetUserId }
         ]);
      }

      // Send Message
      await supabase.from('msg_thread_messages').insert({
         thread_id: targetThreadId,
         sender_id: senderId,
         body: text
      });
  };

  if (!open) return null;

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => onOpenChange(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
        <View style={styles.container}>
          
          <View style={styles.header}>
            <Text style={styles.title}>
               {step === 'success' ? 'Gesendet' : 'Nachricht senden'}
            </Text>
            <TouchableOpacity onPress={() => onOpenChange(false)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          {step === 'success' ? (
             <View style={styles.successState}>
                <Ionicons name="checkmark-circle" size={64} color="#4CAF50" />
                <Text style={styles.successText}>Nachricht erfolgreich gesendet!</Text>
             </View>
          ) : (
            <View style={{ flex: 1 }}>
              {/* Recipients List */}
              <View style={styles.recipientsContainer}>
                <Text style={styles.label}>Empfänger ({recipients.length}):</Text>
                {loadingRecipients ? (
                   <ActivityIndicator size="small" />
                ) : (
                   <FlatList
                     data={recipients}
                     keyExtractor={item => item.id}
                     style={{ maxHeight: 100 }}
                     renderItem={({ item }) => (
                       <View style={styles.recipientChip}>
                          <Text style={styles.recipientName}>{item.name}</Text>
                          <Text style={styles.recipientChild}>
                            (Eltern von {item.childNames.join(', ')})
                          </Text>
                       </View>
                     )}
                   />
                )}
              </View>

              {/* Message Input */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Nachricht:</Text>
                <TextInput
                  style={styles.textInput}
                  multiline
                  placeholder="Ihre Nachricht..."
                  value={messageBody}
                  onChangeText={setMessageBody}
                  textAlignVertical="top"
                />
              </View>

              {/* Footer */}
              <View style={styles.footer}>
                 <TouchableOpacity 
                   style={styles.cancelButton}
                   onPress={() => onOpenChange(false)}
                 >
                    <Text style={styles.cancelText}>Abbrechen</Text>
                 </TouchableOpacity>

                 <TouchableOpacity 
                   style={[styles.sendButton, (!messageBody.trim() || sending) && styles.disabledButton]}
                   onPress={handleSend}
                   disabled={!messageBody.trim() || sending}
                 >
                    {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendText}>Senden</Text>}
                 </TouchableOpacity>
              </View>
            </View>
          )}

        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#fff',
    width: '100%',
    maxWidth: 500,
    borderRadius: 12,
    height: 500,
    overflow: 'hidden',
    display: 'flex',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  recipientsContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#FAFAFA',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  recipientChip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  recipientName: {
    fontWeight: '600',
    fontSize: 13,
    marginRight: 4,
  },
  recipientChild: {
    fontSize: 12,
    color: '#666',
  },
  inputContainer: {
    flex: 1,
    padding: 16,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  cancelText: {
    color: '#333',
    fontWeight: '500',
  },
  sendButton: {
    backgroundColor: '#000',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: {
    color: '#fff',
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  successState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  successText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  }
});

