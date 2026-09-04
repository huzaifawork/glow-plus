import React, { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Card from '../ui/Card';
import Text from '../ui/Text';
import SalonLogo from '../salon/SalonLogo';
import RewardProgress from './RewardProgress';
import VisitRow from './VisitRow';
import { colors, spacing } from '../../theme';
import { formatPoints, plural } from '../../utils/format';

/**
 * One salon's block on the Rewards screen  (R2.2, R2.3, R2.4)
 *
 * *"The app must display a per-salon breakdown of points earned at each
 * specific business."* — the card itself.
 * *"...visual progress toward that reward"* — `RewardProgress`, one per rule.
 * *"...a list of the user's most recent visits at each salon, including the
 * service received"* — `VisitRow`, collapsed by default.
 *
 * **Why visits are collapsed.** A customer with four salons and five visits
 * each faces twenty rows before reaching the second salon's rewards, and the
 * reward progress is what they opened the app for. The visits are one tap
 * away and the count is on the toggle, so nothing is hidden — only deferred.
 *
 * R3.11 — the salon's logo appears here too, because "everywhere that salon
 * appears" includes this screen.
 */
function SalonRewardsCard({ block }) {
  const [showVisits, setShowVisits] = useState(false);
  const visits = block.recentVisits ?? [];
  const rewards = block.rewards ?? [];
  const readyCount = rewards.filter((r) => r.eligible).length;

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <SalonLogo name={block.businessName} logoUrl={block.logoUrl} size={44} />

        <View style={styles.headText}>
          <Text variant="h3" numberOfLines={1}>
            {block.businessName}
          </Text>
          <Text variant="small" color={colors.inkSoft}>
            {formatPoints(block.points)} {plural(block.points, 'point', 'points')}
            {readyCount ? ` · ${readyCount} ready to claim` : ''}
          </Text>
        </View>
      </View>

      {rewards.length ? (
        <View style={styles.rewards}>
          {rewards.map((reward) => (
            <RewardProgress key={reward.ruleId} reward={reward} />
          ))}
        </View>
      ) : (
        <Text variant="small" color={colors.inkFaint}>
          This salon has no active rewards right now — your points are still adding up.
        </Text>
      )}

      {visits.length ? (
        <View>
          <Pressable
            onPress={() => setShowVisits((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showVisits }}
            accessibilityLabel={`${showVisits ? 'Hide' : 'Show'} recent visits`}
            hitSlop={8}
            style={styles.toggle}
          >
            <Text variant="smallStrong" color={colors.brand}>
              {showVisits ? 'Hide' : 'Show'} recent visits ({visits.length})
            </Text>
            <Text variant="small" color={colors.brand}>
              {showVisits ? '▴' : '▾'}
            </Text>
          </Pressable>

          {showVisits ? (
            <View style={styles.visits}>
              {visits.map((visit, i) => (
                <VisitRow key={visit.id} visit={visit} last={i === visits.length - 1} />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

export default memo(SalonRewardsCard);

const styles = StyleSheet.create({
  card: { gap: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headText: { flex: 1, gap: 2 },
  rewards: { gap: spacing.md },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
  },
  visits: { marginTop: spacing.xs },
});
