import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Text from '../ui/Text';
import { colors, radius } from '../../theme';
import { initialsOf } from '../../utils/format';

/**
 * A salon's logo, everywhere a salon appears  (R3.11 – R3.13)
 *
 * R3.11 — *"Where a salon has provided a logo, the app must display it
 * alongside the salon's name everywhere that salon appears — the directory
 * list, the booking flow, and My Bookings."* Hence one component, used by all
 * three, rather than an `<Image>` written three times.
 *
 * R3.12 — *"Where a salon has not provided a logo, the app must display a
 * neutral placeholder rather than a broken image or blank space."* The
 * placeholder is a tinted monogram, derived from the salon's own name. Two
 * paths reach it and BOTH matter: `logoUrl` being null (the salon never
 * uploaded one), and the image failing to load (the URL is stale, the CDN is
 * down, the device is offline). The second is the one that produces a broken
 * image icon if it is not handled, and it is handled by `onError` below.
 *
 * R3.13 — *"The app must load salon logos in a way that does not block or
 * delay the rest of the salon information from displaying."* Three things make
 * that true:
 *
 *   1. The placeholder renders IMMEDIATELY and is replaced by the image when
 *      it arrives — the layout never waits, and never shifts, because both
 *      occupy exactly the same box.
 *   2. `expo-image` decodes off the JS thread and keeps a memory + disk cache,
 *      so a salon seen once costs nothing to draw again while scrolling.
 *   3. Nothing on the screen awaits the image. The salon's name, availability
 *      and distance come from the directory response and are already painted.
 *
 * `recyclingKey` is what stops a recycled `FlatList` row from showing the
 * PREVIOUS salon's logo for a frame while the new one decodes — the single
 * most visible artefact of a fast scroll through an image list.
 */
export default function SalonLogo({ name, logoUrl, size = 52, radius: r = radius.md, style }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(logoUrl) && !failed;

  return (
    <View
      style={[styles.box, { width: size, height: size, borderRadius: r }, style]}
      // One accessible element with the salon's name; the letters inside are
      // decoration, and reading "B H" aloud helps nobody.
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${name} logo`}
    >
      {showImage ? (
        <Image
          source={{ uri: logoUrl }}
          style={{ width: size, height: size, borderRadius: r }}
          contentFit="cover"
          // Cross-fade rather than a pop, so a logo arriving mid-scroll is not
          // a flash. Short enough not to feel like a delay.
          transition={160}
          cachePolicy="memory-disk"
          recyclingKey={logoUrl}
          onError={() => setFailed(true)}
        />
      ) : (
        <Text variant={size >= 48 ? 'h3' : 'smallStrong'} color={colors.brandDeep}>
          {initialsOf(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
});
