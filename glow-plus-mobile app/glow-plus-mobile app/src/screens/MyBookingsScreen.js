import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { colors, spacing, radius, typography } from '../theme';
import { fetchMyBookings, cancelBooking } from '../api/client';

const STATUS_COLORS = {
  PENDING: { bg: '#f4ecdd', fg: colors.gold },
  CONFIRMED: { bg: '#e6f0fc', fg: colors.accent },
  COMPLETED: { bg: '#dcf3e9', fg: colors.sage },
  CANCELLED: { bg: colors.surface, fg: colors.inkSoft },
  NO_SHOW: { bg: '#fde6f0', fg: colors.rose },
};

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.PENDING;
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{status.replace('_', ' ').toLowerCase()}</Text>
    </View>
  );
}

export default function MyBookingsScreen() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await fetchMyBookings();
      setBookings(list);
    } catch (err) {
      Alert.alert('Could not load bookings', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function onRefresh() {
    setRefreshing(true);
    load();
  }

  async function handleCancel(id) {
    Alert.alert('Cancel this booking?', "This can't be undone.", [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel booking',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelBooking(id);
            load();
          } catch (err) {
            Alert.alert('Could not cancel', err.message);
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <FlatList
      data={bookings}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No bookings yet — head to the Book tab to schedule your first appointment.</Text>
        </View>
      }
      renderItem={({ item }) => {
        const when = new Date(item.startTime).toLocaleString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });
        const canCancel = item.status === 'PENDING' || item.status === 'CONFIRMED';
        return (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.merchantName}>{item.merchant?.businessName || 'Salon'}</Text>
              <StatusBadge status={item.status} />
            </View>
            <Text style={styles.meta}>
              {item.style?.name || 'Appointment'} · {when}
            </Text>
            {canCancel && (
              <TouchableOpacity style={styles.cancelBtn} onPress={() => handleCancel(item.id)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: {
    padding: spacing.xl,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.inkFaint,
    borderStyle: 'dashed',
    backgroundColor: colors.surface2,
  },
  emptyText: { textAlign: 'center', color: colors.inkSoft, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.sm },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  merchantName: { ...typography.h3, color: colors.ink },
  meta: { fontSize: 13, color: colors.inkSoft },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  cancelBtn: { marginTop: 10, alignSelf: 'flex-start' },
  cancelText: { color: colors.rose, fontWeight: '700', fontSize: 13 },
});
