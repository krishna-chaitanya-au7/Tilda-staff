import { useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

type ErrorCode =
  | 'invalid_credentials'
  | 'unauthorized_access'
  | 'user_not_found'
  | 'no_access_records'
  | null;

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorCode, setErrorCode] = useState<ErrorCode>(null);

  const handleLogin = async () => {
    if (loading) return;
    setLoading(true);
    setErrorCode(null);

    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error || !authData.user) {
        setErrorCode('invalid_credentials');
        return;
      }

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('user_type, id, auth_id')
        .eq('auth_id', authData.user.id)
        .single();

      if (userError || !userData) {
        await supabase.auth.signOut();
        setErrorCode('user_not_found');
        return;
      }

      const { data: userAccessData, error: accessError } = await supabase
        .from('user_access')
        .select('*')
        .or(`user_id.eq.${userData.id},user_id.eq.${authData.user.id}`);

      if (accessError) {
        console.log('Access error:', accessError);
      }

      const allowedUserTypes = [
        'caterer',
        'facility',
        'supervisor',
        'facility_staff',
        'caterer_staff',
        'supervisor_staff',
        'school-authority',
      ];

      if (!allowedUserTypes.includes(userData.user_type)) {
        await supabase.auth.signOut();
        setErrorCode('unauthorized_access');
        return;
      }

      if (!userAccessData || userAccessData.length === 0) {
        await supabase.auth.signOut();
        setErrorCode('no_access_records');
        return;
      }

      const userType = userData.user_type;

      const hasFacilityAccess = userAccessData.some(
        (access: any) => access.resource_type === 'facility'
      );
      const hasSupervisorAccess = userAccessData.some(
        (access: any) => access.resource_type === 'supervisor'
      );

      if (hasFacilityAccess || userType === 'facility' || userType === 'facility_staff') {
        router.replace('/facility');
      } else if (
        hasSupervisorAccess ||
        userType === 'supervisor' ||
        userType === 'supervisor_staff'
      ) {
        // Redirect explicitly to the supervisor folder, not (tabs)
        router.replace('/supervisor');
      } else {
        router.replace('/');
      }
    } catch (err) {
      console.error('Login error:', err);
      setErrorCode('invalid_credentials');
    } finally {
      setLoading(false);
    }
  };

  const renderError = () => {
    if (!errorCode) return null;

    let message = '';
    if (errorCode === 'invalid_credentials') {
      message = 'Invalid email or password';
    } else if (errorCode === 'unauthorized_access') {
      message = 'Account is not authorized for this portal';
    } else if (errorCode === 'user_not_found') {
      message = 'User profile not found - please contact support';
    } else if (errorCode === 'no_access_records') {
      message =
        'No resource access found for your account - please contact your administrator';
    }

    return (
      <ThemedView style={styles.errorBox}>
        <ThemedText style={styles.errorText}>{message}</ThemedText>
      </ThemedView>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.card}>
        <ThemedText type="title" style={styles.title}>
          Login
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          Enter your email and password to login to your account.
        </ThemedText>

        {renderError()}

        <ThemedView style={styles.field}>
          <ThemedText style={styles.label}>Email</ThemedText>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="m@example.com"
            style={styles.input}
          />
        </ThemedView>

        <ThemedView style={styles.field}>
          <ThemedText style={styles.label}>Password</ThemedText>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
          />
        </ThemedView>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          <ThemedText style={styles.buttonText}>
            {loading ? 'Logging in…' : 'Login'}
          </ThemedText>
        </TouchableOpacity>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 16,
    padding: 24,
    gap: 16,
  },
  title: {
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
  },
  field: {
    marginTop: 8,
  },
  label: {
    marginBottom: 4,
    fontSize: 14,
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  button: {
    marginTop: 16,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  errorText: {
    fontSize: 14,
  },
});



