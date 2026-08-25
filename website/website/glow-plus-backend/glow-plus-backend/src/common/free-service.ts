/**
 * Naming the service a FREE_SERVICE reward actually gives.  [F62]
 *
 * A reward rule carries its value in `rewardValue` — 20 for PERCENT_OFF, 1000
 * for FLAT_DISCOUNT. A **FREE_SERVICE** rule has no number: its value is a
 * *style*, held in `freeServiceStyleId`, and `rewardValue` is left at **0**.
 * Neither `/me/rewards` nor `/redemptions/available` ever sent that id, so
 * every client had `rewardType: 'FREE_SERVICE', rewardValue: 0` and nothing
 * else — and rendered the only thing it could: **"0 free"**. On an unlocked
 * card that reads `Ready — 0 free`, with a Redeem button beside it.
 *
 * The fix has to be here rather than in the client, because no amount of
 * frontend work can name a style whose id was never in the payload.
 *
 * ⚠️ **`freeServiceStyleId` is a bare `String?` with NO foreign key** — noted
 * in session 27 while backing out `DELETE /styles/:id`. So it can point at a
 * style that no longer exists, and this must resolve to `null` rather than
 * throw. Both fields are emitted on every reward, not just FREE_SERVICE ones,
 * so a client can read them without first branching on the type.
 */

/** Just enough of a RewardRule to place the reward's value. */
export type FreeServiceRule = {
  rewardType: string;
  freeServiceStyleId: string | null;
};

/** Minimal Prisma surface, so this stays unit-testable without a database. */
type StyleFinder = {
  style: { findMany(args: any): Promise<{ id: string; name: string }[]> };
};

/**
 * One query for every free-service style named by `rules`, or none at all when
 * no rule is a FREE_SERVICE — the common case, and it should not cost a round
 * trip.
 */
export async function resolveFreeServiceNames(
  prisma: StyleFinder,
  rules: FreeServiceRule[],
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      rules
        .filter((r) => r.rewardType === 'FREE_SERVICE' && r.freeServiceStyleId)
        .map((r) => r.freeServiceStyleId as string),
    ),
  ];
  if (ids.length === 0) return new Map();

  const styles = await prisma.style.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  return new Map(styles.map((s) => [s.id, s.name]));
}

/**
 * The two fields to spread onto a reward in an API response.
 *
 * `freeServiceName` is null when the rule is not a FREE_SERVICE, when it names
 * no style, or when the style it names has been deleted — a client that shows
 * "a free service" for a null name degrades honestly, where "0 free" did not.
 */
export function freeServiceFields(rule: FreeServiceRule, names: Map<string, string>) {
  const id = rule.rewardType === 'FREE_SERVICE' ? rule.freeServiceStyleId ?? null : null;
  return {
    freeServiceStyleId: id,
    freeServiceName: id ? names.get(id) ?? null : null,
  };
}
