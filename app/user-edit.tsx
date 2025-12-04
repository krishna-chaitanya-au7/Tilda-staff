import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View, ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';

export default function UserEditScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    first_name: '',
    family_name: '',
    phone: '',
    email: '',
    street: '',
    street_number: '',
    zip: '',
    city: '',
    dob: '',
  });

  useEffect(() => {
    if (id) {
      fetchUserDetails();
    }
  }, [id]);

  const fetchUserDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (data) {
        setFormData({
          first_name: data.first_name || '',
          family_name: data.family_name || '',
          phone: data.phone || '',
          email: data.email || '',
          street: data.street || '',
          street_number: data.street_number || '',
          zip: data.zip || '',
          city: data.city || '',
          dob: data.dob || '',
        });
      }
    } catch (error) {
      console.error('Error fetching user:', error);
      Alert.alert('Error', 'Failed to fetch user details');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          first_name: formData.first_name,
          family_name: formData.family_name,
          phone: formData.phone,
          email: formData.email,
          street: formData.street,
          street_number: formData.street_number,
          zip: formData.zip,
          city: formData.city,
          dob: formData.dob || null,
        })
        .eq('id', id);

      if (error) throw error;

      Alert.alert('Success', 'Updated successfully', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error: any) {
      console.error('Error updating user:', error);
      Alert.alert('Error', error.message || 'Failed to update details');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
      </ThemedView>
    );
  }

  const renderInputField = (
    label: string,
    value: string,
    field: string,
    placeholder?: string,
    keyboardType: 'default' | 'email-address' | 'phone-pad' | 'numeric' = 'default'
  ) => (
    <View style={styles.inputContainer}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={(text) => updateField(field, text)}
        placeholder={placeholder}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#666" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Profil anpassen</ThemedText>
        <View style={styles.headerSpacer} /> 
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Persönliche Informationen</Text>
            <View style={styles.sectionContent}>
              <View style={styles.row}>
                <View style={styles.halfWidth}>
                  {renderInputField("Vorname", formData.first_name, "first_name", "Vorname")}
                </View>
                <View style={styles.halfWidth}>
                  {renderInputField("Familienname", formData.family_name, "family_name", "Familienname")}
                </View>
              </View>

              {renderInputField("Geburtsdatum (YYYY-MM-DD)", formData.dob, "dob", "YYYY-MM-DD")}

              {renderInputField("E-Mail", formData.email, "email", "E-Mail eingeben", "email-address")}
              {renderInputField("Telefon", formData.phone, "phone", "Telefonnummer eingeben", "phone-pad")}

              <View style={styles.row}>
                <View style={styles.threeQuarterWidth}>
                  {renderInputField("Straße", formData.street, "street", "Straße")}
                </View>
                <View style={styles.quarterWidth}>
                  {renderInputField("Hausnr.", formData.street_number, "street_number", "Nr.", "numeric")}
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.quarterWidth}>
                  {renderInputField("PLZ", formData.zip, "zip", "PLZ", "numeric")}
                </View>
                <View style={styles.threeQuarterWidth}>
                  {renderInputField("Ort", formData.city, "city", "Ort")}
                </View>
              </View>
            </View>
          </View>

          <TouchableOpacity 
            style={[styles.saveButton, saving && styles.saveButtonDisabled]} 
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Änderungen speichern</Text>
            )}
          </TouchableOpacity>
          
          <View style={{ height: 40 }} />

        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingTop: 60, // Safe area top
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flexGrow: 1,
  },
  section: {
    marginTop: 16,
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  sectionContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: '#000000',
    backgroundColor: '#ffffff',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  threeQuarterWidth: {
    flex: 0.7,
  },
  quarterWidth: {
    flex: 0.3,
  },
  saveButton: {
    backgroundColor: '#007AFF',
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#A0A0A0',
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
