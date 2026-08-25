/**
 * Tests for the FREE_SERVICE reward naming helper.  [F62]
 *
 * The bug this closes was silent: a rule giving away a free Deep Tissue
 * Massage reached every client as `rewardType: 'FREE_SERVICE', rewardValue: 0`
 * and nothing else, so the consumer dashboard rendered **"0 free"** — and on
 * an unlocked card, `Ready — 0 free` beside a Redeem button. Nothing threw,
 * nothing 500'd, and the number shown was simply the wrong field.
 *
 * The properties worth pinning are the ones where the output still *looks*
 * like a valid payload if they break:
 *
 *   1. a FREE_SERVICE rule resolves to the style's real name,
 *   2. a **dangling** id resolves to null instead of throwing —
 *      `freeServiceStyleId` is a bare `String?` with NO foreign key, so the
 *      style it names really can have been deleted,
 *   3. non-FREE_SERVICE rules never carry a stray name, even when the column
 *      holds a leftover value, and
 *   4. no rule of that type means **no query at all** — the common case must
 *      not cost a round trip.
 */
import { freeServiceFields, resolveFreeServiceNames } from './free-service';

const MASSAGE = 'style-massage';
const FACIAL = 'style-facial';

function makePrisma(styles: { id: string; name: string }[]) {
  const findMany = jest.fn(async ({ where }: any) =>
    styles.filter((s) => where.id.in.includes(s.id)),
  );
  return { prisma: { style: { findMany } }, findMany };
}

const freeRule = (id: string | null) => ({ rewardType: 'FREE_SERVICE', freeServiceStyleId: id });
const percentRule = (id: string | null = null) => ({ rewardType: 'PERCENT_OFF', freeServiceStyleId: id });

describe('resolveFreeServiceNames', () => {
  it('looks up every free-service style in ONE query', async () => {
    const { prisma, findMany } = makePrisma([
      { id: MASSAGE, name: 'Deep Tissue Massage' },
      { id: FACIAL, name: 'Signature Facial' },
    ]);

    const names = await resolveFreeServiceNames(prisma, [freeRule(MASSAGE), freeRule(FACIAL)]);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(names.get(MASSAGE)).toBe('Deep Tissue Massage');
    expect(names.get(FACIAL)).toBe('Signature Facial');
  });

  it('does not query at all when no rule is a FREE_SERVICE', async () => {
    const { prisma, findMany } = makePrisma([{ id: MASSAGE, name: 'Deep Tissue Massage' }]);

    const names = await resolveFreeServiceNames(prisma, [percentRule(), percentRule()]);

    // Most salons have no free-service rule; they must not pay for one.
    expect(findMany).not.toHaveBeenCalled();
    expect(names.size).toBe(0);
  });

  it('asks for each style once even when several rules give the same one', async () => {
    const { prisma, findMany } = makePrisma([{ id: MASSAGE, name: 'Deep Tissue Massage' }]);

    await resolveFreeServiceNames(prisma, [freeRule(MASSAGE), freeRule(MASSAGE), freeRule(MASSAGE)]);

    expect(findMany.mock.calls[0][0].where.id.in).toEqual([MASSAGE]);
  });

  it('ignores a FREE_SERVICE rule that names no style', async () => {
    const { prisma, findMany } = makePrisma([{ id: MASSAGE, name: 'Deep Tissue Massage' }]);

    await resolveFreeServiceNames(prisma, [freeRule(null)]);

    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('freeServiceFields', () => {
  it('names the free service', async () => {
    const names = new Map([[MASSAGE, 'Deep Tissue Massage']]);

    expect(freeServiceFields(freeRule(MASSAGE), names)).toEqual({
      freeServiceStyleId: MASSAGE,
      freeServiceName: 'Deep Tissue Massage',
    });
  });

  it('returns a NULL name for a style that no longer exists', () => {
    // `freeServiceStyleId` has no foreign key (session 27, backing out
    // DELETE /styles/:id), so nothing in the database prevents this. A throw
    // here would take down the whole rewards screen over one stale rule.
    expect(freeServiceFields(freeRule('deleted-style'), new Map())).toEqual({
      freeServiceStyleId: 'deleted-style',
      freeServiceName: null,
    });
  });

  it('emits both fields as null for a rule that is not a FREE_SERVICE', () => {
    expect(freeServiceFields(percentRule(), new Map())).toEqual({
      freeServiceStyleId: null,
      freeServiceName: null,
    });
  });

  it('ignores a leftover id on a rule whose type was changed away from FREE_SERVICE', () => {
    // A rule edited from FREE_SERVICE to PERCENT_OFF can keep the old column
    // value. Reporting it would tell the customer they get a free massage on
    // top of a percentage discount.
    const names = new Map([[MASSAGE, 'Deep Tissue Massage']]);

    expect(freeServiceFields(percentRule(MASSAGE), names)).toEqual({
      freeServiceStyleId: null,
      freeServiceName: null,
    });
  });
});
