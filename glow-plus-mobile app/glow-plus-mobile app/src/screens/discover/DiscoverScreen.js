import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import Screen from '../../components/ui/Screen';
import ScreenHeader from '../../components/ui/ScreenHeader';
import Text from '../../components/ui/Text';
import Banner from '../../components/ui/Banner';
import SalonSearchBar from '../../components/salon/SalonSearchBar';
import SalonFilterBar from '../../components/salon/SalonFilterBar';
import SalonCard from '../../components/salon/SalonCard';
import LocationPrompt from '../../components/salon/LocationPrompt';
import DateStrip from '../../components/booking/DateStrip';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateView';
import { SalonCardSkeleton } from '../../components/ui/Skeleton';
import { colors, spacing } from '../../theme';
import { listSalons } from '../../api/client';
import useAsyncData from '../../hooks/useAsyncData';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import useSalonCapacities from '../../hooks/useSalonCapacities';
import { useLocation } from '../../context/LocationContext';
import { useConfig } from '../../context/ConfigContext';
import { useNetwork } from '../../context/NetworkContext';
import { sortByDistance, withDistance } from '../../utils/distance';
import { hasAvailability, plural } from '../../utils/format';
import { describeDateKey, todayKey } from '../../utils/datetime';

/**
 * Discover — the salon directory  (R3.1, R3.5 – R3.10)
 *
 * This screen is where five requirements meet, and the order they are applied
 * in is what makes them compose:
 *
 *   R3.1  browse without being logged in  → `listSalons` sends no token
 *   R3.10 search / filter by city         → server-side `?q=` and `?city=`
 *   R3.6  use the device's location       → `LocationContext`, on request
 *   R3.7  sort by distance                → **on-device** (NF6)
 *   R3.5  show fully-booked / N spots     → **server-computed** capacity
 *   R3.8  combine distance AND availability in one flow
 *
 * ── Which work happens where, and why ──────────────────────────────────────
 * **Search and city go to the server** because they narrow a paginated list —
 * filtering 100 rows client-side after fetching them defeats the pagination.
 * **Distance is computed on the device**, because NF6 forbids sending the
 * user's coordinates anywhere. **Availability comes from the server**, because
 * R3.5 requires it to be computed centrally so the app and the website cannot
 * disagree. Each of those three is a requirement, not a performance choice.
 *
 * ── R3.8, concretely ───────────────────────────────────────────────────────
 * `sort === 'distance'` and `availableOnly` are independent toggles on one bar
 * over one list, so "nearest salon that can take me today" is two taps and no
 * navigation. The acceptance criterion asks for exactly that: *"sorted by
 * distance, and can further narrow that list to salons that currently have
 * availability, in a single flow."*
 *
 * ── R3.9 ───────────────────────────────────────────────────────────────────
 * Nothing on this screen requires location. Without it the list is
 * alphabetical, distances are absent, Nearest is disabled with a reason, and
 * every other control — search, city, availability, and booking itself —
 * works exactly as it does with it.
 */
export default function DiscoverScreen({ navigation }) {
  const location = useLocation();
  const { demoMode } = useConfig();
  const { offline } = useNetwork();

  const [query, setQuery] = useState('');
  const [city, setCity] = useState(null);
  const [sort, setSort] = useState('name');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [date, setDate] = useState(todayKey());

  // R3.10 — the request is debounced, the input is not. See the hook.
  const debouncedQuery = useDebouncedValue(query, 300);

  const {
    data,
    error,
    loading,
    refreshing,
    refresh: refreshList,
    retry,
  } = useAsyncData(
    () => listSalons({ q: debouncedQuery.trim() || undefined, city: city || undefined }),
    [debouncedQuery, city, demoMode],
  );

  const salons = data?.items ?? [];

  /** Which rows are on screen — so capacity is fetched for those, not all 100. */
  const [visibleIds, setVisibleIds] = useState([]);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 10 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    setVisibleIds(viewableItems.map((v) => v.item.id));
  }).current;

  /**
   * R3.5 — one capacity request per visible salon, for the selected date.
   *
   * When `availableOnly` is on, capacity is needed for EVERY salon, not just
   * the visible ones: a filter that only hides rows you have already scrolled
   * past is not a filter. The directory page is capped at 100 by the server,
   * and the requests are cached and deduplicated by the hook.
   */
  const capacityIds = useMemo(
    () => (availableOnly ? salons.map((s) => s.id) : visibleIds),
    [availableOnly, salons, visibleIds],
  );
  const { capacities, isLoading: capacityLoading, invalidate } = useSalonCapacities(
    capacityIds,
    date,
  );

  /** R3.7 / R3.8 — distance, then availability, then order. All on-device. */
  const visible = useMemo(() => {
    let list = withDistance(salons, location.coords);

    if (availableOnly) {
      // A salon whose capacity has not arrived yet is KEPT, not hidden.
      // Hiding it would make rows vanish one by one as answers land, which
      // reads as the list being broken; it disappears only once the server
      // has actually said it is unavailable.
      list = list.filter((s) => capacities[s.id] === undefined || hasAvailability(capacities[s.id]));
    }

    return sort === 'distance' && location.available
      ? sortByDistance(list)
      : [...list].sort((a, b) => a.businessName.localeCompare(b.businessName));
  }, [salons, location.coords, location.available, availableOnly, capacities, sort]);

  /** City chips, built from the salons the platform actually returned. */
  const cities = useMemo(() => {
    const set = new Set(salons.map((s) => s.city).filter(Boolean));
    // The active city stays in the list even when the filtered response no
    // longer contains it — otherwise selecting a city removes the chip that
    // would let you unselect it.
    if (city) set.add(city);
    return [...set].sort();
  }, [salons, city]);

  const handleRefresh = useCallback(() => {
    invalidate();
    refreshList();
  }, [invalidate, refreshList]);

  const handleSort = useCallback(
    async (next) => {
      // Turning on Nearest without permission asks for it, with the
      // explanation card already visible above (NF5). Declining leaves the
      // sort alone rather than silently doing nothing (R3.9).
      if (next === 'distance' && !location.available) {
        const granted = await location.requestPermission();
        if (!granted) return;
      }
      setSort(next);
    },
    [location],
  );

  const renderItem = useCallback(
    ({ item }) => (
      // Wrapped rather than padding the list, because the search bar and the
      // date strip in the header run edge to edge and a single
      // `contentContainerStyle` padding cannot do both.
      <View style={styles.cardWrap}>
        <SalonCard
          salon={item}
          capacity={capacities[item.id]}
          capacityLoading={capacityLoading(item.id)}
          isToday={date === todayKey()}
          onPress={() => navigation.navigate('Salon', { salon: item, date })}
        />
      </View>
    ),
    [capacities, capacityLoading, date, navigation],
  );

  const keyExtractor = useCallback((item) => item.id, []);

  const header = (
    <View style={styles.header}>
      <View style={styles.searchWrap}>
        <SalonSearchBar value={query} onChangeText={setQuery} onClear={() => setQuery('')} />
      </View>

      <SalonFilterBar
        sort={sort}
        onSortChange={handleSort}
        availableOnly={availableOnly}
        onAvailableOnlyChange={setAvailableOnly}
        cities={cities}
        city={city}
        onCityChange={setCity}
        locationAvailable={location.available}
        locationHint={
          location.denied
            ? 'Location is off, so salons are listed alphabetically. Search by city instead, or turn location on in Settings.'
            : 'Turn on location to sort by distance.'
        }
      />

      {/* R3.5 — "must update whenever the user changes the selected date". */}
      <View style={styles.dateBlock}>
        <Text variant="caption" color={colors.inkFaint} style={styles.dateLabel}>
          AVAILABILITY FOR {describeDateKey(date).toUpperCase()}
        </Text>
        <DateStrip value={date} onChange={setDate} days={14} />
      </View>

      {location.shouldPrompt ? (
        <View style={styles.promptWrap}>
          <LocationPrompt
            denied={location.denied}
            loading={location.loading}
            onEnable={location.denied ? location.openSettings : location.requestPermission}
            onDismiss={location.dismiss}
          />
        </View>
      ) : null}

      {offline ? (
        <View style={styles.promptWrap}>
          <Banner
            tone="warning"
            icon="⚡"
            title="You're offline"
            message="Salon availability may be out of date until you reconnect."
          />
        </View>
      ) : null}

      {visible.length ? (
        <Text variant="small" color={colors.inkSoft} style={styles.count}>
          {visible.length} {plural(visible.length, 'salon', 'salons')}
          {sort === 'distance' && location.available ? ' · nearest first' : ''}
          {availableOnly ? ' · with availability' : ''}
        </Text>
      ) : null}
    </View>
  );

  return (
    <Screen>
      <ScreenHeader title="Find a salon" subtitle="Book an appointment and earn points" />

      {loading && !data ? (
        <LoadingState label="Loading salons" style={styles.skeletons}>
          <SalonCardSkeleton />
          <SalonCardSkeleton />
          <SalonCardSkeleton />
        </LoadingState>
      ) : error && !data ? (
        <ErrorState error={error} onRetry={retry} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={header}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          // `keyboardDismissMode="on-drag"` — scrolling a list with the
          // keyboard up should put it away, which is what every native list does.
          keyboardDismissMode="on-drag"
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.brand}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="⌕"
              title={availableOnly ? 'Nothing free on this date' : 'No salons found'}
              message={
                availableOnly
                  ? 'No salon matching your search has an opening on the date you picked. Try another day, or turn off the availability filter.'
                  : query || city
                    ? 'Try a different name or city.'
                    : 'No salons are listed yet. Check back soon.'
              }
              action={query || city || availableOnly ? 'Clear filters' : undefined}
              onAction={() => {
                setQuery('');
                setCity(null);
                setAvailableOnly(false);
              }}
            />
          }
          initialNumToRender={6}
          maxToRenderPerBatch={8}
          windowSize={9}
          removeClippedSubviews
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The list's own padding is horizontal-only, so the search bar and the date
  // strip can run edge to edge while the cards stay inset.
  content: { paddingBottom: spacing.xl, gap: spacing.md },
  cardWrap: { paddingHorizontal: spacing.xl },
  header: { gap: spacing.lg, marginBottom: spacing.xs },
  searchWrap: { paddingHorizontal: spacing.xl },
  dateBlock: { gap: spacing.xs },
  dateLabel: { paddingHorizontal: spacing.xl, letterSpacing: 1 },
  promptWrap: { paddingHorizontal: spacing.xl },
  count: { paddingHorizontal: spacing.xl },
  skeletons: { padding: spacing.xl, gap: spacing.md },
});
