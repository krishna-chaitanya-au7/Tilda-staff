import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

interface UserAccess {
  id: string;
  resource_type: string;
  resource_id: string;
}

export default function SelectResourceScreen() {
  const router = useRouter();
  const [resources, setResources] = useState<UserAccess[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadResources = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/login');
        return;
      }

      const { data, error } = await supabase
        .from('user_access')
        .select('id, resource_type, resource_id')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error loading user access:', error);
        setResources([]);
      } else {
        setResources(data || []);
      }

      setLoading(false);
    };

    loadResources();
  }, [router]);

  const handleSelect = (access: UserAccess) => {
    if (access.resource_type) {
      router.replace(`/${access.resource_type}` as any);
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading resources…</ThemedText>
      </ThemedView>
    );
  }

  if (!resources.length) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>No resources are assigned to this account.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        Select a resource
      </ThemedText>
      <FlatList
        data={resources}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.item} onPress={() => handleSelect(item)}>
            <ThemedText style={styles.itemTitle}>{item.resource_type}</ThemedText>
            <ThemedText style={styles.itemSubtitle}>{item.resource_id}</ThemedText>
          </TouchableOpacity>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  title: {
    marginBottom: 16,
  },
  list: {
    gap: 12,
  },
  item: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  itemSubtitle: {
    fontSize: 12,
    marginTop: 4,
  },
});
















