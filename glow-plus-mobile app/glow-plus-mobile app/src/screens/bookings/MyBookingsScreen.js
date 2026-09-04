import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SectionList, RefreshControl, StyleSheet, View } from 'react-native';
import Screen from '../../components/ui/Screen';
import ScreenHeader from '../../components/ui/ScreenHeader';
import Text from '../../components/ui/Text';
import Button from '../../components/ui/Button';
import Banner from '../../components/ui/Banner';
import Sheet from '../../components/ui/Sheet';
import BookingCard from '../../components/bookings/BookingCard';
import BookingSummaryRow from '../../components/bookings/BookingSummaryRow';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateView';
import { BookingCardSkeleton } from '../../components/ui/Skeleton';
import { colors, spacing } from '../../theme';
import { cancelBooking, listMyBookings } from '../../api/client';
import useAsyncData from '../../hooks/useAsyncData';
import { useToast } from '../../context/ToastContext';
import { useConfig } from '../../context/ConfigContext';
import { useNetwork } from '../../context/NetworkContext';
import { messageFor } from '../../api/errors';
import { plural } from '../../utils/format';

/**
 * My Bookings  (R4.1 – R4.5)
 *
 * *"The app must show a logged-in user their upcoming and past bookings."*
 * — one request, split here into two sections rather than two requests,
 * because "upcoming" is a fact about the clock and not a filter the server
 * offers. A `SectionList` gives the two groups sticky headers and keeps a
 * single scroll.
 *
 * **The sort differs per section, deliberately.** Upcoming is soonest-first
 * (the next appointment is the one you care about); past is most-recent-first
 * (your last visit is the one you remember). A single order would bury one of
 * the two.
 *
 * **R4.4 — pull to refresh.** Same `RefreshControl` as Rewards.
 *
 * **R4.5 — push notifications** mean this list is usually already correct when
 * the user opens it. `focusedBookingId` is how a tapped notification lands ON
 * the booking it was about: the card is outlined, so the deep link ends
 * somewhere specific instead of near it.
 *
 * ── Cancelling (R4.3) ──────────────────────────────────────────────────────
 * Confirmed in a sheet that shows which appointment is about to go, then
 * applied **optimistically** — the card flips to Cancelled immediately and is
 * rolled back if the server refuses. Waiting on the round trip before changing
 * anything makes an irreversible action feel unresponsive at exactly the
 * moment the user most wants certainty.
 */
export default function MyBookingsScreen({ route }) {
  const toast = useToast();
  const { demoMode } = useConfig();
  const { offline } = useNetwork();

  const focusedBookingId = route?.params?.bookingId ?? null;

  const { data, error, loading, refreshing, refresh, retry, setData } = useAsyncData(
    () => listMyBookings({ limit: 100 }),
    [demoMode],
  );

  const [pendingCancel, setPendingCancel] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  const bookings = useMemo(() => data?.items ?? [], [data]);

  const sections = useMemo(() => {
    const now = Date.now();
    const upcoming = [];
    const past = [];

    for (const booking of bookings) {
      // A cancelled or completed appointment belongs in history even if its
      // time has not passed — "upcoming" means "still going to happen".
      const isLive = booking.status === 'PENDING' || booking.status === 'CONFIRMED';
      const inFuture = new Date(booking.startTime).getTime() > now;
      (isLive && inFuture ? upcoming : past).push(booking);
    }

    upcoming.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    past.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

    return [
      upcoming.length ? { title: 'Upcoming', data: upcoming } : null,
      past.length ? { title: 'Past', data: past } : null,
    ].filter(Boolean);
  }, [bookings]);

  const upcomingCount = sections.find((s) => s.title === 'Upcoming')?.data.length ?? 0;

  /** A notification tap should show fresh data, not whatever was last loaded. */
  useEffect(() => {
    if (focusedBookingId) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedBookingId]);

  const applyStatus = useCallback(
    (bookingId, status) => {
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((b) => (b.id === bookingId ? { ...b, status } : b)),
            }
          : prev,
      );
    },
    [setData],
  );

  async function handleCancel() {
    if (!pendingCancel) return;
    const target = pendingCancel;
    const previousStatus = target.status;

    setCancelling(true);
    setCancelError(null);
    applyStatus(target.id, 'CANCELLED');

    try {
      await cancelBooking(target.id);
      setPendingCancel(null);
      toast.success('Appointment cancelled.');
    } catch (err) {
      // Rolled back, so the list never claims something the server refused.
      applyStatus(target.id, previousStatus);
      setCancelError(err);
    } finally {
      setCancelling(false);
    }
  }

  const renderItem = useCallback(
    ({ item }) => (
      <View style={styles.cardWrap}>
        <BookingCard
          booking={item}
          highlighted={item.id === focusedBookingId}
          cancelling={cancelling && pendingCancel?.id === item.id}
          onCancel={setPendingCancel}
        />
      </View>
    ),
    [cancelling, pendingCancel, focusedBookingId],
  );

  const renderSectionHeader = useCallback(
    ({ section }) => (
      <View style={styles.sectionHeader}>
        <Text variant="h3">{section.title}</Text>
        <Text variant="small" color={colors.inkSoft}>
          {section.data.length} {plural(section.data.length, 'appointment', 'appointments')}
        </Text>
      </View>
    ),
    [],
  );

  if (loading && !data) {
    return (
      <Screen>
        <ScreenHeader title="My bookings" />
        <LoadingState label="Loading your bookings" style={styles.skeletons}>
          <BookingCardSkeleton />
          <BookingCardSkeleton />
        </LoadingState>
      </Screen>
    );
  }

  if (error && !data) {
    return (
      <Screen>
        <ScreenHeader title="My bookings" />
        <ErrorState error={error} onRetry={retry} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title="My bookings"
        subtitle={
          upcomingCount
            ? `${upcomingCount} upcoming ${plural(upcomingCount, 'appointment', 'appointments')}`
            : 'Your appointments, past and upcoming'
        }
      />

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        // Sticky headers keep "Upcoming" / "Past" visible while scrolling, so
        // it is always clear which half of the list you are in.
        stickySectionHeadersEnabled
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          offline ? (
            <View style={styles.cardWrap}>
              <Banner
                tone="warning"
                icon="⚡"
                title="You're offline"
                message="Statuses may be out of date. Pull down to refresh when you reconnect."
              />
            </View>
          ) : null
        }
        // R4.4.
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />
        }
        ListEmptyComponent={
          <EmptyState
            icon="◷"
            title="No bookings yet"
            message="When you book an appointment it will show up here, along with its status."
          />
        }
        initialNumToRender={5}
        maxToRenderPerBatch={8}
        windowSize={9}
        removeClippedSubviews
      />

      {/* R4.3 — the confirmation. It shows WHICH appointment, because a user
          with three bookings should never have to trust that they tapped the
          right one. */}
      <Sheet
        visible={Boolean(pendingCancel)}
        onClose={() => !cancelling && setPendingCancel(null)}
        title="Cancel this appointment?"
        subtitle="The salon will be notified. You can always book again."
        footer={
          <>
            <Button
              title="Yes, cancel it"
              variant="danger"
              onPress={handleCancel}
              loading={cancelling}
              fullWidth
              size="lg"
            />
            <Button
              title="Keep it"
              variant="ghost"
              onPress={() => setPendingCancel(null)}
              disabled={cancelling}
              fullWidth
            />
          </>
        }
      >
        {pendingCancel ? <BookingSummaryRow booking={pendingCancel} /> : null}

        {cancelError ? (
          <Banner
            tone="danger"
            icon="!"
            title="Couldn't cancel"
            message={messageFor(cancelError)}
          />
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xl, gap: spacing.md },
  cardWrap: { paddingHorizontal: spacing.xl },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bg,
  },
  skeletons: { padding: spacing.xl, paddingTop: 0, gap: spacing.md },
});
