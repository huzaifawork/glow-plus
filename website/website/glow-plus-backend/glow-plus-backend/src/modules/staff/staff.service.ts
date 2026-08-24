import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { StaffRole } from '@prisma/client';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { sendEmail } from '../notifications/email.provider';
import { InviteStaffDto } from './dto';

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7d — an invite is not a live credential (a reset token is 1h)

/**
 * Staff management, owner side  (T24) [F6]
 *
 * Every method takes the caller's `merchantId` as its FIRST argument and
 * filters on it, rather than looking a staff row up by id alone. That is
 * deliberate: `MerchantStaff.email` is globally unique, so a bare
 * `findUnique({ where: { id } })` here would let merchant A rename or
 * delete merchant B's staff — the IDOR shape [F29] takes in a new table.
 */
@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  private hashToken(raw: string) {
    return createHash('sha256').update(raw).digest('hex');
  }

  /** Staff members who have accepted, plus invites still outstanding. */
  async list(merchantId: string) {
    const [members, invites] = await Promise.all([
      this.prisma.merchantStaff.findMany({
        where: { merchantId },
        // Never select passwordHash — the leak T17 found on GET /merchants/me [F31].
        select: { id: true, email: true, name: true, role: true, lastLoginAt: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.staffInvite.findMany({
        where: { merchantId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, email: true, name: true, role: true, expiresAt: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return { members, pendingInvites: invites };
  }

  async invite(merchantId: string, dto: InviteStaffDto) {
    const email = dto.email.trim().toLowerCase();
    const role = (dto.role ?? 'STAFF') as StaffRole;

    // The owner signs in through the Merchant table, not MerchantStaff. If
    // that same email also became a staff row, POST /staff/login and
    // POST /merchants/login would both succeed for it with different
    // identities — refuse rather than create the ambiguity.
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new NotFoundException('Merchant not found');
    if (merchant.email.toLowerCase() === email) {
      throw new BadRequestException('That is the owner account email — it already has full access');
    }

    const existing = await this.prisma.merchantStaff.findUnique({ where: { email } });
    if (existing) {
      // Deliberately does not say whether the clash is at THIS salon or
      // another one — that would leak another merchant's staff list.
      throw new ConflictException('That email already has a staff account');
    }

    // Re-inviting the same address supersedes the outstanding invite instead
    // of stacking a second live token on one mailbox.
    await this.prisma.staffInvite.updateMany({
      where: { merchantId, email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const rawToken = randomBytes(32).toString('hex');
    const invite = await this.prisma.staffInvite.create({
      data: {
        merchantId,
        email,
        name: dto.name?.trim() || null,
        role,
        token: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
      select: { id: true, email: true, name: true, role: true, expiresAt: true, createdAt: true },
    });

    const inviteUrl = `${APP_URL}/staff/accept-invite?token=${rawToken}`;
    await sendEmail({
      to: email,
      template: 'staff-invite',
      data: { inviteUrl, businessName: merchant.businessName, role },
    });

    return invite;
  }

  async revokeInvite(merchantId: string, inviteId: string) {
    const result = await this.prisma.staffInvite.updateMany({
      where: { id: inviteId, merchantId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('No pending invite with that id');
    return { ok: true };
  }

  async updateRole(merchantId: string, staffId: string, role: StaffRole) {
    const result = await this.prisma.merchantStaff.updateMany({
      where: { id: staffId, merchantId },
      data: { role },
    });
    if (result.count === 0) throw new NotFoundException('No staff member with that id');

    return this.prisma.merchantStaff.findUnique({
      where: { id: staffId },
      select: { id: true, email: true, name: true, role: true, lastLoginAt: true, createdAt: true },
    });
  }

  async remove(merchantId: string, staffId: string) {
    const result = await this.prisma.merchantStaff.deleteMany({ where: { id: staffId, merchantId } });
    if (result.count === 0) throw new NotFoundException('No staff member with that id');
    return { ok: true };
  }
}
