import React from 'react';
import { StyleSheet, View } from 'react-native';
import Text from '../ui/Text';
import Pill from '../ui/Pill';
import ProgressBar from '../ui/ProgressBar';
import PunchDots, { MAX_DOTS } from './PunchDots';
import { colors, radius, spacing } from '../../theme';
import {
  describeProgress,
  describeRemaining,
  describeReward,
  progressRatio,
} from '../../utils/format';

/**
 * One reward rule, and how close this customer is to it  (R2.3)
 *
 * *"For each active reward rule at a salon the user has visited, the app must
 * show visual progress toward that reward (for example, a fill indicator
 * showing 3 of 5 required visits)."*
 *
 * **Which visual, and why it depends on the rule.** A VISIT_COUNT rule with a
 * small target is countable — "3 of 5" is literally five things, and dots show
 * that at a glance and match the website's punch card. A POINTS rule with a
 * target of 300 is not countable, and three hundred dots is not a fill
 * indicator, it is a texture. So: dots up to `MAX_DOTS`, a bar beyond it. Both
 * are backed by the same number, and both are announced identically to a
 * screen reader.
 *
 * The maths is in `utils/format.js` and matches the platform's own — `progress
 * % triggerValue`, not `progress / triggerValue`, so a repeatable reward at 7
 * of 5 visits reads as two-fifths toward the NEXT one rather than 140% of the
 * last.
 */
export default function RewardProgress({ reward }) {
  const ratio = progressRatio(reward);
  const countable = reward.triggerType === 'VISIT_COUNT' && reward.triggerValue <= MAX_DOTS;
  const filled = reward.eligible ? reward.triggerValue : reward.progress % reward.triggerValue;

  return (
    <View
      style={[styles.wrap, reward.eligible && styles.ready]}
      accessible
      accessibilityLabel={`${reward.name}. ${describeReward(reward)}. ${describeProgress(
        reward,
      )}. ${describeRemaining(reward)}.`}
    >
      <View style={styles.head}>
        <View style={styles.titles}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {reward.name}
          </Text>
          <Text variant="small" color={colors.inkSoft}>
            {describeReward(reward)}
            {reward.oneTime ? ' · one time only' : ''}
          </Text>
        </View>

        {reward.eligible ? <Pill label="Ready" tone="success" dot size="sm" /> : null}
      </View>

      {countable ? (
        <PunchDots total={reward.triggerValue} filled={filled} />
      ) : (
        <ProgressBar
          value={ratio}
          label={describeProgress(reward)}
          color={reward.eligible ? colors.success : colors.brand}
        />
      )}

      <View style={styles.footer}>
        <Text variant="small" color={colors.inkSoft}>
          {describeProgress(reward)}
        </Text>
        <Text
          variant="smallStrong"
          color={reward.eligible ? colors.success : colors.brandDeep}
        >
          {describeRemaining(reward)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  // A reward that can be claimed gets a tinted surface, not just a pill —
  // it is the one thing on this screen the user can act on today.
  ready: { backgroundColor: colors.successSoft, borderColor: 'transparent' },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  titles: { flex: 1, gap: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
