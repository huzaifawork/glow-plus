/**
 * Tests for the "you have points waiting" email  (T82)
 *
 * A salon logs a visit by typing a customer's email. If no account exists,
 * `findOrCreateClient` makes one so the points have somewhere to live, with a
 * random 16-byte password nobody knows. Until T82 **nothing told the person any
 * of that had happened**, so they could collect points for months and never
 * learn they had an account to redeem from — a loyalty scheme the customer
 * cannot see.
 *
 * The two things worth pinning are the ones that are easy to get wrong later:
 * the mail goes out on the FIRST visit only (sending on every visit turns a
 * loyalty programme into spam), and a mail failure never costs the salon the
 * visit they just logged, with a customer standing at the counter.
 */
import { VisitsService } from './visits.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RewardRulesService } from '../reward-rules/reward-rules.service';
import { sendEmail } from '../notifications/email.provider';

jest.mock('../notifications/email.provider', () => ({ sendEmail: jest.fn() }));

const STYLE = { id: 's_1', merchantId: 'm_1', active: true, pointsPerVisit: 10 };

function makeService(existingUser: unknown) {
  const prisma = {
    style: { findUnique: jest.fn().mockResolvedValue(STYLE) },
    user: {
      findUnique: jest.fn().mockResolvedValue(existingUser),
      create: jest.fn().mockResolvedValue({ id: 'u_new', email: 'walkin@y.com' }),
    },
    visit: { create: jest.fn().mockResolvedValue({ id: 'v_1' }) },
    merchant: { findUnique: jest.fn().mockResolvedValue({ businessName: 'Bella Hair' }) },
    rewardRule: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new VisitsService(
    prisma as unknown as PrismaService,
    { evaluate: jest.fn() } as unknown as RewardRulesService,
  );
  return { service, prisma };
}

const dto = { clientEmail: 'walkin@y.com', clientName: 'Walk In', styleId: 's_1' };

describe('VisitsService — points-waiting email (T82)', () => {
  beforeEach(() => (sendEmail as jest.Mock).mockReset().mockResolvedValue(undefined));

  it('emails a customer whose account was just created for them', async () => {
    const { service } = makeService(null);
    await service.logVisit('m_1', 'm_1', dto);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const sent = (sendEmail as jest.Mock).mock.calls[0][0];
    expect(sent.to).toBe('walkin@y.com');
    expect(sent.template).toBe('points-waiting');
    expect(sent.data.businessName).toBe('Bella Hair');
    expect(sent.data.points).toBe(10);
  });

  it('names the salon, because "a salon added points" is not something you can act on', async () => {
    const { service } = makeService(null);
    await service.logVisit('m_1', 'm_1', dto);
    expect((sendEmail as jest.Mock).mock.calls[0][0].data.businessName).toBe('Bella Hair');
  });

  it('does NOT email on a repeat visit — an existing customer already knows', async () => {
    const { service } = makeService({ id: 'u_1', email: 'walkin@y.com' });
    await service.logVisit('m_1', 'm_1', dto);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('records the visit even when the email fails — a queue is waiting at the counter', async () => {
    (sendEmail as jest.Mock).mockRejectedValue(new Error('provider down'));
    const { service, prisma } = makeService(null);

    await expect(service.logVisit('m_1', 'm_1', dto)).resolves.toMatchObject({
      visit: { id: 'v_1' },
    });
    expect(prisma.visit.create).toHaveBeenCalled();
  });

  it('never puts a password in the email — the way in is a reset from their own inbox', async () => {
    const { service } = makeService(null);
    await service.logVisit('m_1', 'm_1', dto);
    const { data } = (sendEmail as jest.Mock).mock.calls[0][0];
    expect(JSON.stringify(data)).not.toMatch(/password["']?\s*:\s*["'][^"']+/i);
    expect(data.setPasswordUrl).toMatch(/forgot-password$/);
  });
});
