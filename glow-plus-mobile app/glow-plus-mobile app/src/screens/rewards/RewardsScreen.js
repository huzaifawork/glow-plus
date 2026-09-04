import React, { useCallback, useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import Screen from '../../components/ui/Screen';
import ScreenHeader from '../../components/ui/ScreenHeader';
import Text from '../../components/ui/Text';
import Banner from '../../components/ui/Banner';
import PointsSummary from '../../components/rewards/PointsSummary';
import SalonRewardsCard from '../../components/rewards/SalonRewardsCard';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateView';
import { RewardCardSkeleton } from '../../components/ui/Skeleton';
import { colors, spacing } from '../../theme';
import { getRewards } from '../../api/client';
import useAsyncData from '../../hooks/useAsyncData';
import { useAuth } from '../../context/AuthContext';
import { useConfig } from '../../context/ConfigContext';
import { useNetwork } from '../../context/NetworkContext';

/**
 * Rewards  (R2.1 – R2.5)
 *
 * One screen, one request. `GET /me/rewards` answers all four display
 * requirements at once — the total (R2.1), the per-salon breakdown (R2.2), the
 * progress toward each rule (R2.3) and the recent visits with the service
 * received (R2.4) — which is why there is no waterfall of calls here and no
 * partial-loading state to design around.
 *
 * **R2.5 — "The user must be able to manually refresh this screen to pull the
 * latest data."** That is `RefreshControl`, the gesture every phone user
 * already knows. `refreshing` is kept separate from `loading` in
 * `useAsyncData` precisely so the pull does not replace the list with
 * skeletons — the content stays put and the spinner runs above it.
 *
 * A `FlatList` and not a `ScrollView`, even though the list is short: a
 * customer with a dozen salons gets windowing for free, and `RefreshControl`
 * on a `ScrollView` fights with nested scrolling on Android.
 */
export default function RewardsScreen({ navigation }) {
  const { user } = useAuth();
  const { demoMode } = useConfig();
  const { offline } = useNetwork();

  const { data, error, loading, refreshing, refresh, retry } = useAsyncData(
    () => getRewards(),
    // Re-fetches when demo mode is toggled, so the screen never shows demo
    // data labelled as real or the other way round.
    [demoMode],
  );

  const blocks = data?.merchants ?? [];

  const readyCount = useMemo(
    () =>
      blocks.reduce(
        (sum, block) => sum + (block.rewards ?? []).filter((r) => r.eligible).length,
        0,
      ),
    [blocks],
  );

  const renderItem = useCallback(({ item }) => <SalonRewardsCard block={item} />, []);
  const keyExtractor = useCallback((item) => item.merchantId, []);

  const header = (
    <View style={styles.headerBlock}>
      <PointsSummary
        totalPoints={data?.totalPoints ?? 0}
        salonCount={blocks.length}
        readyCount={readyCount}
      />

      {demoMode ? (
        <Banner
          tone="info"
          icon="◆"
          title="Demo mode"
          message="This is sample data. Turn demo mode off in Settings to connect to Glow+."
        />
      ) : null}

      {offline ? (
        <Banner
          tone="warning"
          icon="⚡"
          title="You're offline"
          message="Showing the last data this device loaded. Pull down to retry when you're back."
        />
      ) : null}

      {blocks.length ? (
        <Text variant="h2" style={styles.sectionTitle}>
          Your salons
        </Text>
      ) : null}
    </View>
  );

  if (loading && !data) {
    return (
      <Screen>
        <ScreenHeader title="Rewards" subtitle={user?.name ? `Hi, ${user.name}` : undefined} />
        <LoadingState label="Loading your rewards" style={styles.skeletons}>
          <RewardCardSkeleton />
          <RewardCardSkeleton />
        </LoadingState>
      </Screen>
    );
  }

  if (error && !data) {
    return (
      <Screen>
        <ScreenHeader title="Rewards" />
        <ErrorState error={error} onRetry={retry} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title="Rewards"
        subtitle={user?.name ? `Hi, ${user.name}` : 'Your points across every Glow+ salon'}
      />

      <FlatList
        data={blocks}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        // R2.5.
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />
        }
        ListEmptyComponent={
          <EmptyState
            icon="✦"
            title="No visits yet"
            message="Once a salon logs your first visit, your points and rewards will appear here."
            action="Find a salon"
            onAction={() => navigation.navigate('DiscoverTab')}
          />
        }
        // Windowing tuned for cards this tall: five on screen at most, so
        // rendering ten is enough to keep scrolling smooth without building
        // the whole list up front.
        initialNumToRender={4}
        maxToRenderPerBatch={6}
        windowSize={7}
        removeClippedSubviews
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, paddingTop: 0, gap: spacing.lg },
  headerBlock: { gap: spacing.lg },
  sectionTitle: { marginTop: spacing.xs },
  skeletons: { padding: spacing.xl, paddingTop: 0, gap: spacing.lg },
});
