import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

export type AttendanceEventType = 'late' | 'early_leave';

interface AttendanceEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: AttendanceEventType;
  existing?: any; // The existing note object if editing
  onSave: (events: Array<{
    type: AttendanceEventType;
    time?: string;
    comment?: string;
    id?: string;
  }>) => void;
}

export default function AttendanceEventDialog({
  open,
  onOpenChange,
  type,
  existing,
  onSave,
}: AttendanceEventDialogProps) {
  const [time, setTime] = useState('');
  const [comment, setComment] = useState('');
  
  // Picker state
  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (open) {
      if (existing) {
        // If editing existing event
        const mins = existing.minutes || 0;
        const hours = Math.floor(mins / 60);
        const m = mins % 60;
        const timeStr = `${hours.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        setTime(timeStr);
        setComment(existing.comment || '');
        
        // Set date object for picker
        const d = new Date();
        d.setHours(hours);
        d.setMinutes(m);
        d.setSeconds(0);
        setDate(d);
      } else {
        // Reset
        setTime('');
        setComment('');
        
        // Default date to now
        setDate(new Date());
      }
      setShowPicker(false);
    }
  }, [open, existing, type]);

  const handleSave = () => {
    // Validate time format HH:MM
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(time)) {
      alert('Please select a time');
      return;
    }

    onSave([{
      type,
      time,
      comment,
      id: existing?.id
    }]);
    onOpenChange(false);
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
    }
    
    if (selectedDate) {
      setDate(selectedDate);
      const hours = selectedDate.getHours().toString().padStart(2, '0');
      const minutes = selectedDate.getMinutes().toString().padStart(2, '0');
      setTime(`${hours}:${minutes}`);
    }
  };

  const title = type === 'late' ? 'Verspätet' : 'Früher gegangen';
  const color = type === 'late' ? '#F59E0B' : '#3B82F6'; // Amber / Blue

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={() => onOpenChange(false)}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <TouchableOpacity 
          style={styles.backdrop} 
          activeOpacity={1} 
          onPress={() => onOpenChange(false)} 
        />
        
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={() => onOpenChange(false)}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body}>
            <View style={styles.typeIndicator}>
              <View style={[styles.dot, { backgroundColor: color }]} />
              <Text style={styles.typeText}>
                {type === 'late' ? 'Came Late' : 'Left Early'}
              </Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Uhrzeit *</Text>
              
              <TouchableOpacity 
                style={styles.timeInputButton} 
                onPress={() => setShowPicker(prev => !prev)}
              >
                <Text style={[styles.timeInputText, !time && styles.placeholderText]}>
                  {time || "Zeit wählen"}
                </Text>
                <Ionicons name="time-outline" size={20} color="#666" />
              </TouchableOpacity>

              {showPicker && (
                <View style={styles.pickerContainer}>
                  <DateTimePicker
                    testID="dateTimePicker"
                    value={date}
                    mode="time"
                    is24Hour={true}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={onDateChange}
                    textColor="#000000"
                  />
                </View>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Kommentar (Optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={comment}
                onChangeText={setComment}
                placeholder="Kommentar eingeben..."
                placeholderTextColor="#999"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity 
              style={[styles.button, styles.cancelButton]} 
              onPress={() => onOpenChange(false)}
            >
              <Text style={styles.cancelButtonText}>Abbrechen</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.button, styles.saveButton, !time && styles.disabledButton]} 
              onPress={handleSave}
              disabled={!time}
            >
              <Text style={styles.saveButtonText}>Speichern</Text>
            </TouchableOpacity>
          </View>
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
    padding: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    backgroundColor: 'white',
    borderRadius: 12,
    maxHeight: '90%', // Increased slightly to fit picker on small screens
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111',
  },
  body: {
    padding: 16,
  },
  typeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: '#F9FAFB',
    padding: 8,
    borderRadius: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  typeText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    padding: 10,
    fontSize: 16,
    color: '#111',
  },
  // New styles for time picker button
  timeInputButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    padding: 10,
    backgroundColor: '#fff',
  },
  timeInputText: {
    fontSize: 16,
    color: '#111',
  },
  placeholderText: {
    color: '#999',
  },
  pickerContainer: {
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    overflow: 'hidden',
  },
  textArea: {
    minHeight: 80,
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    gap: 12,
    justifyContent: 'flex-end',
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    minWidth: 80,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  saveButton: {
    backgroundColor: '#111',
  },
  disabledButton: {
    opacity: 0.5,
  },
  cancelButtonText: {
    color: '#374151',
    fontWeight: '500',
  },
  saveButtonText: {
    color: 'white',
    fontWeight: '500',
  },
});
