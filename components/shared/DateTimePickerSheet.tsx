import React from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  /** When true the sheet is visible. */
  visible: boolean;
  /** What kind of picker to render. */
  mode: 'date' | 'time';
  /** Current value the spinner is anchored on. */
  value: Date;
  /** Use 24-hour clock when picking time. Defaults to true. */
  is24Hour?: boolean;
  /**
   * Fires every time the spinner updates (live drag). Parents typically
   * mirror this into their own state so the underlying form reflects the
   * user's intent before they tap "Fertig".
   */
  onChange: (next: Date) => void;
  /** Close handler. Called from the "Fertig" button or the backdrop tap. */
  onClose: () => void;
  /** Optional minimum date for `mode="date"`. */
  minimumDate?: Date;
  /** Optional maximum date for `mode="date"`. */
  maximumDate?: Date;
}

/**
 * Reusable transparent-modal date / time picker. Visual + interaction model
 * matches the Bestellschluss picker in `components/mensa/MensaSettingsModal.tsx`
 * (~lines 658–697 + the matching styles around line 903–940). Use anywhere a
 * `<DateTimePicker>` would otherwise be mounted directly into a parent — the
 * card-with-Fertig-bar is a much cleaner UX than a bare native spinner.
 */
export function DateTimePickerSheet({
  visible,
  mode,
  value,
  is24Hour = true,
  onChange,
  onClose,
  minimumDate,
  maximumDate,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.card} onStartShouldSetResponder={() => true}>
          <View style={styles.okBar}>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.okButton}
              accessibilityRole="button"
              accessibilityLabel="Auswahl bestätigen"
            >
              <Ionicons name="checkmark" size={18} color="#ffffff" style={styles.okIcon} />
              <Text style={styles.okText}>Fertig</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.inner}>
            <DateTimePicker
              value={value}
              mode={mode}
              is24Hour={is24Hour}
              display="spinner"
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              {...(Platform.OS === 'ios'
                ? { themeVariant: 'light' as const, textColor: '#111827' }
                : {})}
              onChange={(_, d) => {
                if (d) onChange(d);
              }}
              style={styles.wheel}
            />
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    width: '90%',
    maxWidth: 400,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  okBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  okButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  okIcon: { marginRight: 6 },
  okText: { color: '#ffffff', fontWeight: '600', fontSize: 15 },
  inner: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
  },
  wheel: { backgroundColor: '#ffffff', height: 232, width: '100%' },
});
