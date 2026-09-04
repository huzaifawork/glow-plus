import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Screen from '../../components/ui/Screen';
import Text from '../../components/ui/Text';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Banner from '../../components/ui/Banner';
import SectionHeader from '../../components/ui/SectionHeader';
import SalonLogo from '../../components/salon/SalonLogo';
import AvailabilityPill from '../../components/salon/AvailabilityPill';
import DistanceBadge from '../../components/salon/DistanceBadge';
import ServiceRow from '../../components/booking/ServiceRow';
import DateStrip from '../../components/booking/DateStrip';
import TimeSlotGrid from '../../components/booking/TimeSlotGrid';
import BookingSummary from '../../components/booking/BookingSummary';
import Sheet from '../../components/ui/Sheet';
import TextField from '../../components/ui/TextField';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateView';
import { Skeleton } from '../../components/ui/Skeleton';
import { colors, radius, spacing } from '../../theme';
import { createBooking, getAvailability, getSalonCapacity, listSalonServices } from '../../api/client';
import useAsyncData from '../../hooks/useAsyncData';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatAddress } from '../../utils/format';
import { describeDateKey, formatTime, todayKey } from '../../utils/datetime';
import { messageFor } from '../../api/errors';

/**
 * One salon: its menu, its real availability, and the booking  (R3.2 – R3.4)
 *
 * The whole flow on one screen, in the order a person makes the decisions:
 * pick a service (R3.2) → pick a day → see the times that actually exist
 * (R3.3) → confirm (R3.4). Splitting those across pushed screens would mean
 * changing your mind about the service costs two back taps; here it re-fetches
 * the slots in place.
 *
 * ── R3.3, restated because it is the easiest to get wrong ──────────────────
 * *"...the actual available appointment times ... computed from that salon's
 * real business hours and existing bookings — not a fixed or assumed
 * schedule."* Every time on this screen came from
 * `GET /bookings/availability`. There is no slot generation in this app.
 *
 * ── R3.4 needs a session; R3.1/R3.2/R3.3 do not ────────────────────────────
 * A signed-out visitor can browse this salon, its menu and its real free times
 * — that is the requirement. Only the confirm step needs an account, so the
 * button says "Sign in to book" instead of the screen being behind a wall.
 * Their choices survive the sign-in because the sheet re-opens on return.
 */
export default function SalonScreen({ route, navigation }) {
  const { salon, date: initialDate } = route.params;
  const { isAuthenticated } = useAuth();
  const toast = useToast();

  const [date, setDate] = useState(initialDate ?? todayKey());
  const [service, setService] = useState(null);
  const [slot, setSlot] = useState(null);
  const [notes, setNotes] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState(null);

  /** R3.2 — the salon's public menu. */
  const services = useAsyncData(() => listSalonServices(salon.id), [salon.id]);

  /** R3.5 — the same central answer the directory card showed, for this date. */
  const capacity = useAsyncData(() => getSalonCapacity(salon.id, date), [salon.id, date]);

  /**
   * R3.3 — the real slots.
   *
   * `enabled` gates the request on a service being chosen: availability is
   * per-service (a 2-hour balayage fits in fewer places than a 30-minute
   * trim), so asking before the user has picked one would be asking a question
   * with no answer.
   */
  const availability = useAsyncData(
    () => getAvailability(salon.id, service.id, date),
    [salon.id, service?.id, date],
    { enabled: Boolean(service) },
  );

  const activeServices = useMemo(
    () => (services.data ?? []).filter((s) => s.active !== false),
    [services.data],
  );

  const handleSelectService = useCallback((next) => {
    setService(next);
    // The old time is meaningless for a different service — a 10:00 that fits
    // a trim may not fit a balayage, and leaving it selected would let the
    // user confirm a slot the server never offered for this service.
    setSlot(null);
  }, []);

  const handleSelectDate = useCallback((next) => {
    setDate(next);
    setSlot(null);
  }, []);

  async function handleConfirm() {
    if (!service || !slot) return;
    setSubmitting(true);
    setBookingError(null);

    try {
      await createBooking({
        merchantId: salon.id,
        styleId: service.id,
        startTime: slot.startTime,
        notes,
      });

      setConfirming(false);
      setSlot(null);
      setNotes('');
      toast.success('Booking requested — the salon will confirm shortly.');
      // Straight to My Bookings: the user's next question is "did that work?",
      // and the answer is a card with a status on it (R4.1/R4.2).
      //
      // Addressed as `Tabs` > `BookingsTab`, NOT as a bare `BookingsTab`: this
      // screen sits in the ROOT stack, and `navigate` bubbles up to a parent
      // navigator rather than descending into a sibling one. A bare name here
      // matches no route, and React Navigation's response to that is to do
      // nothing — the user would tap Confirm, see the toast, and stay put.
      navigation.navigate('Tabs', { screen: 'BookingsTab' });
    } catch (err) {
      // Stays on the sheet. The most likely failure is "that time was just
      // booked by someone else", and the fix is picking another slot — which
      // means the user must be able to see the grid behind this message.
      setBookingError(err);
      // The grid is now stale by definition, so re-ask.
      availability.retry();
    } finally {
      setSubmitting(false);
    }
  }

  const address = formatAddress(salon);

  return (
    <Screen edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* R3.11 — the logo appears in the booking flow too, not only the list. */}
        <Card style={styles.hero}>
          <View style={styles.heroRow}>
            <SalonLogo name={salon.businessName} logoUrl={salon.logoUrl} size={64} radius={radius.lg} />
            <View style={styles.heroText}>
              <Text variant="h1" numberOfLines={2}>
                {salon.businessName}
              </Text>
              {address ? (
                <Text variant="small" color={colors.inkSoft}>
                  {address}
                </Text>
              ) : null}
              <DistanceBadge distanceKm={salon.distanceKm} />
            </View>
          </View>

          <AvailabilityPill
            capacity={capacity.data}
            loading={capacity.loading}
            isToday={date === todayKey()}
          />
        </Card>

        <View style={styles.section}>
          <SectionHeader
            title="Choose a service"
            subtitle="Every visit earns points toward this salon's rewards"
          />

          {services.loading ? (
            <LoadingState label="Loading services" style={styles.menuSkeleton}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} width="100%" height={64} radius={radius.md} />
              ))}
            </LoadingState>
          ) : services.error ? (
            <ErrorState error={services.error} onRetry={services.retry} compact />
          ) : activeServices.length === 0 ? (
            <EmptyState
              icon="✂"
              title="No services yet"
              message="This salon hasn't published its menu. Try another salon, or check back soon."
            />
          ) : (
            <Card padding={0} style={styles.menu}>
              {activeServices.map((item, i) => (
                <ServiceRow
                  key={item.id}
                  service={item}
                  selected={service?.id === item.id}
                  onPress={() => handleSelectService(item)}
                  last={i === activeServices.length - 1}
                />
              ))}
            </Card>
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader title="Pick a day" subtitle={describeDateKey(date)} />
          <View style={styles.strip}>
            <DateStrip value={date} onChange={handleSelectDate} days={21} />
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader
            title="Available times"
            subtitle={service ? `${service.name} · ${describeDateKey(date)}` : undefined}
          />

          {availability.error && service ? (
            <ErrorState error={availability.error} onRetry={availability.retry} compact />
          ) : (
            <TimeSlotGrid
              slots={availability.data}
              loading={availability.loading && Boolean(service)}
              selected={slot}
              onSelect={setSlot}
              noService={!service}
              closed={capacity.data?.openOnDate === false}
            />
          )}
        </View>
      </ScrollView>

      {/* The action bar is pinned rather than inline: with a long menu and a
          full slot grid, an inline button is a scroll away from the slot the
          user just tapped. */}
      {service && slot ? (
        <View style={styles.actionBar}>
          <View style={styles.actionText}>
            <Text variant="smallStrong" numberOfLines={1}>
              {service.name}
            </Text>
            <Text variant="small" color={colors.inkSoft}>
              {describeDateKey(date)} · {formatTime(slot.startTime)}
            </Text>
          </View>

          <Button
            title={isAuthenticated ? 'Review & book' : 'Sign in to book'}
            onPress={() =>
              isAuthenticated ? setConfirming(true) : navigation.navigate('Auth', { screen: 'SignIn' })
            }
          />
        </View>
      ) : null}

      {/* R3.4 — the confirmation. A sheet rather than an Alert, so the user can
          see exactly what they are about to book. */}
      <Sheet
        visible={confirming}
        onClose={() => !submitting && setConfirming(false)}
        title="Confirm your booking"
        subtitle="The salon will confirm your request shortly."
        footer={
          <>
            <Button
              title="Request this appointment"
              onPress={handleConfirm}
              loading={submitting}
              fullWidth
              size="lg"
            />
            <Button
              title="Back"
              variant="ghost"
              onPress={() => setConfirming(false)}
              disabled={submitting}
              fullWidth
            />
          </>
        }
      >
        {service && slot ? <BookingSummary salon={salon} service={service} slot={slot} /> : null}

        <TextField
          label="Anything the salon should know? (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Allergies, a preferred stylist, running late…"
          multiline
          autoCapitalize="sentences"
          maxLength={2000}
        />

        {bookingError ? (
          <Banner
            tone="danger"
            icon="!"
            title="Couldn't book that time"
            message={messageFor(bookingError)}
          />
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, paddingTop: spacing.md, gap: spacing.xl, paddingBottom: 120 },
  hero: { gap: spacing.lg },
  heroRow: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  heroText: { flex: 1, gap: spacing.xs },
  section: { gap: spacing.md },
  menu: { overflow: 'hidden' },
  menuSkeleton: { gap: spacing.sm },
  // Negative margin so the date strip scrolls edge to edge inside a padded
  // ScrollView — a strip that stops short of the screen edge reads as clipped.
  strip: { marginHorizontal: -spacing.xl },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  actionText: { flex: 1, gap: 1 },
});
