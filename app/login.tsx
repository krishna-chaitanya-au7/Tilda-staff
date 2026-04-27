import { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { resolveFacilityBranchPath, type UserAccessRow } from '@/lib/facilityPermissions';

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
        .select('user_type, id, auth_id, record_id')
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

      const utLower = String(userType).toLowerCase();
      const isSupervisorUserType = utLower === 'supervisor' || utLower === 'supervisor_staff';

      /** Supervisor portal has no Tickets tab — take precedence over facility when both accesses exist. */
      if (hasSupervisorAccess && isSupervisorUserType) {
        router.replace('/supervisor');
      } else if (hasFacilityAccess || utLower === 'facility' || utLower === 'facility_staff') {
        const branch = await resolveFacilityBranchPath(
          {
            id: userData.id,
            user_type: userData.user_type,
            record_id: userData.record_id,
            auth_id: userData.auth_id,
          },
          authData.user.id,
          (userAccessData || []) as UserAccessRow[]
        );
        router.replace(branch as any);
      } else if (hasSupervisorAccess || utLower === 'supervisor' || utLower === 'supervisor_staff') {
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
      <View style={styles.errorBox}>
        <Text style={styles.errorText}>{message}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Login</Text>
        <Text style={styles.subtitle}>
          Enter your email and password to login to your account.
        </Text>

        {renderError()}

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="m@example.com"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
          />
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Logging in…' : 'Login'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#FFFFFF',
  },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    gap: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  field: {
    marginTop: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
  },
  button: {
    marginTop: 8,
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  errorText: {
    fontSize: 13,
    color: '#B91C1C',
  },
});
