import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, typography, typeTagColors } from '../theme';
import PunchCard from '../components/PunchCard';
import { fetchMyRewards, logout } from '../api/client';

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function rewardLabel(reward) {
  if (reward.rewardType === 'PERCENT_OFF') return `${reward.rewardValue}% off`;
  if (reward.rewardType === 'FLAT_DISCOUNT') return `$${reward.rewardValue} off`;
  return 'free service';
}

function Tag({ type }) {
  const c = typeTagColors[type] || typeTagColors.OTHER;
  return (
    <View style={[styles.tag, { backgroundColor: c.bg }]}>
      <Text style={[styles.tagText, { color: c.fg }]}>{type.toLowerCase()}</Text>
    </View>
  );
}

function MerchantCard({ merchant }) {
  return (
    <View style={styles.merchantCard}>
      <View style={styles.merchantHead}>
        <Text style={styles.merchantName}>{merchant.businessName}</Text>
        <Text style={styles.merchantPoints}>{merchant.points} pts here</Text>
      </View>

      {merchant.rewards.length === 0 ? (
        <Text style={styles.mutedNote}>This salon hasn't set up reward rules yet.</Text>
      ) : (
        merchant.rewards.map((r) => (
          <View key={r.ruleId} style={styles.rewardRow}>
            <Text style={styles.rewardName}>{r.name}</Text>
            <PunchCard total={r.triggerValue} filled={r.progress} size={22} />
            <Text style={styles.rewardNote}>
              <Text style={styles.bold}>
                {r.remaining} more {r.triggerType === 'VISIT_COUNT' ? 'visit' : 'point'}
                {r.remaining === 1 ? '' : 's'}
              </Text>{' '}
              for {rewardLabel(r)}
            </Text>
          </View>
        ))
      )}

      <Text style={styles.sectionLabel}>Recent visits</Text>
      {merchant.recentVisits.map((v) => (
        <View key={v.id} style={styles.visitRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.visitStyle}>{v.styleName}</Text>
            <Tag type={v.styleType} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={styles.visitDate}>{formatDate(v.visitDate)}</Text>
            <Text style={styles.visitPoints}>+{v.pointsEarned} pts</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function DashboardScreen({ userName = 'Joseph Ilunga', onLogout }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await fetchMyRewards();
      setData(result);
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

  async function handleLogout() {
    await logout();
    onLogout();
  }

  const initials = userName
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your rewards</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        >
          <View style={styles.idCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <Text style={styles.idName}>{userName}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.idPoints}>{data?.totalPoints ?? 0}</Text>
              <Text style={styles.idPointsLabel}>Total points</Text>
            </View>
          </View>

          {!data || data.merchants.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                No visits yet. Ask your salon to log your first visit — your rewards will show up here.
              </Text>
            </View>
          ) : (
            data.merchants.map((m) => <MerchantCard key={m.merchantId} merchant={m} />)
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerTitle: { ...typography.h2, color: colors.ink },
  logoutText: { color: colors.accent, fontWeight: '600', fontSize: 14 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  idCard: {
    backgroundColor: colors.black,
    borderRadius: radius.lg,
    margin: spacing.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontWeight: '700', fontSize: 16 },
  idName: { color: colors.white, fontSize: 17, fontWeight: '700' },
  idPoints: { color: colors.white, fontSize: 26, fontWeight: '700' },
  idPointsLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },

  emptyState: {
    margin: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.inkFaint,
    borderStyle: 'dashed',
    backgroundColor: colors.surface2,
  },
  emptyText: { textAlign: 'center', color: colors.inkSoft, fontSize: 14, lineHeight: 20 },

  merchantCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
  },
  merchantHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  merchantName: { ...typography.h3, color: colors.ink },
  merchantPoints: { color: colors.accent, fontWeight: '700', fontSize: 12.5 },
  mutedNote: { color: colors.inkSoft, fontSize: 13.5, paddingVertical: spacing.sm },

  rewardRow: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line },
  rewardName: { fontWeight: '700', fontSize: 14, color: colors.ink, marginBottom: 8 },
  rewardNote: { fontSize: 13, color: colors.inkSoft, marginTop: 8 },
  bold: { fontWeight: '700', color: colors.ink },

  sectionLabel: { fontWeight: '700', fontSize: 13, color: colors.ink, marginTop: spacing.md, marginBottom: 6 },
  visitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  visitStyle: { fontWeight: '600', fontSize: 13.5, color: colors.ink },
  visitDate: { fontSize: 12, color: colors.inkSoft },
  visitPoints: { fontSize: 12.5, color: colors.accent, fontWeight: '700' },

  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  tagText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
});
