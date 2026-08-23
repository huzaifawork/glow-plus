import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { colors, spacing, radius, typography } from '../theme';
import { fetchSalons, fetchSalonStyles, fetchAvailability, createBooking } from '../api/client';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function addDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function BookScreen({ onBooked }) {
  const [salons, setSalons] = useState([]);
  const [selectedSalon, setSelectedSalon] = useState(null);
  const [styleList, setStyleList] = useState([]);
  const [selectedStyle, setSelectedStyle] = useState(null);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [slots, setSlots] = useState([]);
  const [loadingSalons, setLoadingSalons] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const list = await fetchSalons();
        setSalons(list);
      } catch (err) {
        Alert.alert('Could not load salons', err.message);
      } finally {
        setLoadingSalons(false);
      }
    })();
  }, []);

  const pickSalon = useCallback(async (salon) => {
    setSelectedSalon(salon);
    setSelectedStyle(null);
    setSlots([]);
    try {
      const list = await fetchSalonStyles(salon.id);
      setStyleList(list);
    } catch (err) {
      Alert.alert('Could not load styles', err.message);
    }
  }, []);

  const loadSlots = useCallback(async (salon, style, date) => {
    if (!salon || !style || !date) return;
    setLoadingSlots(true);
    setSlots([]);
    try {
      const result = await fetchAvailability(salon.id, style.id, date);
      setSlots(result);
    } catch (err) {
      Alert.alert('Could not load availability', err.message);
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  function pickStyle(style) {
    setSelectedStyle(style);
    loadSlots(selectedSalon, style, selectedDate);
  }
  function pickDate(date) {
    setSelectedDate(date);
    if (selectedStyle) loadSlots(selectedSalon, selectedStyle, date);
  }

  async function bookSlot(slot) {
    setBooking(true);
    try {
      await createBooking(selectedSalon.id, selectedStyle.id, slot.startTime);
      Alert.alert('Requested!', 'Your appointment request was sent — the salon will confirm shortly.');
      onBooked && onBooked();
    } catch (err) {
      Alert.alert('Could not book', err.message);
      loadSlots(selectedSalon, selectedStyle, selectedDate);
    } finally {
      setBooking(false);
    }
  }

  const dateOptions = [0, 1, 2, 3, 4, 5, 6].map((n) => addDaysISO(n));

  if (loadingSalons) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
      <Text style={s.sectionTitle}>1. Choose a salon</Text>
      <View style={s.chipRow}>
        {salons.map((sal) => (
          <TouchableOpacity
            key={sal.id}
            style={[s.chip, selectedSalon?.id === sal.id && s.chipActive]}
            onPress={() => pickSalon(sal)}
          >
            <Text style={[s.chipText, selectedSalon?.id === sal.id && s.chipTextActive]}>{sal.businessName}</Text>
          </TouchableOpacity>
        ))}
        {salons.length === 0 && <Text style={s.muted}>No salons available yet.</Text>}
      </View>

      {selectedSalon && (
        <>
          <Text style={s.sectionTitle}>2. Choose a service</Text>
          <View style={s.chipRow}>
            {styleList.map((st) => (
              <TouchableOpacity
                key={st.id}
                style={[s.chip, selectedStyle?.id === st.id && s.chipActive]}
                onPress={() => pickStyle(st)}
              >
                <Text style={[s.chipText, selectedStyle?.id === st.id && s.chipTextActive]}>
                  {st.name} · {st.durationMinutes}min
                </Text>
              </TouchableOpacity>
            ))}
            {styleList.length === 0 && <Text style={s.muted}>No bookable services yet.</Text>}
          </View>
        </>
      )}

      {selectedStyle && (
        <>
          <Text style={s.sectionTitle}>3. Choose a date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
            {dateOptions.map((d) => {
              const label = new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
              return (
                <TouchableOpacity
                  key={d}
                  style={[s.dateChip, selectedDate === d && s.chipActive]}
                  onPress={() => pickDate(d)}
                >
                  <Text style={[s.chipText, selectedDate === d && s.chipTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={s.sectionTitle}>4. Choose a time</Text>
          {loadingSlots ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.md }} />
          ) : slots.length === 0 ? (
            <Text style={s.muted}>No open times that day — try another date.</Text>
          ) : (
            <View style={s.slotGrid}>
              {slots.map((slot) => (
                <TouchableOpacity key={slot.startTime} style={s.slotBtn} disabled={booking} onPress={() => bookSlot(slot)}>
                  <Text style={s.slotText}>
                    {new Date(slot.startTime).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { ...typography.h3, color: colors.ink, marginTop: spacing.lg, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.inkFaint,
    backgroundColor: colors.surface2,
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 13.5, fontWeight: '600', color: colors.ink },
  chipTextActive: { color: colors.white },
  dateChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.inkFaint,
    backgroundColor: colors.surface2,
    marginRight: 8,
    alignItems: 'center',
  },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  slotBtn: {
    width: '31%',
    marginBottom: 10,
    paddingVertical: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.inkFaint,
    backgroundColor: colors.surface2,
    alignItems: 'center',
  },
  slotText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  muted: { color: colors.inkSoft, fontSize: 13.5 },
});
