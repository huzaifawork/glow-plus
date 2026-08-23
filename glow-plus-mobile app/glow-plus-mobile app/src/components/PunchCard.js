import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { colors } from '../theme';

export default function PunchCard({ total, filled, size = 26 }) {
  const dots = Array.from({ length: Math.max(total, 1) }, (_, i) => i);
  const anims = useRef(dots.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const animations = dots.map((i) =>
      Animated.timing(anims[i], {
        toValue: i < filled ? 1 : 0,
        duration: 320,
        delay: i * 60,
        useNativeDriver: false,
      }),
    );
    Animated.stagger(0, animations).start();
  }, [filled, total]);

  return (
    <View style={styles.row}>
      {dots.map((i) => {
        const backgroundColor = anims[i].interpolate({
          inputRange: [0, 1],
          outputRange: ['transparent', colors.accent],
        });
        const borderColor = anims[i].interpolate({
          inputRange: [0, 1],
          outputRange: [colors.inkFaint, colors.accent],
        });
        return (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              { width: size, height: size, borderRadius: size / 2, backgroundColor, borderColor },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dot: { borderWidth: 2.5, marginRight: 2 },
});
