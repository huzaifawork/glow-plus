import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { sign } from '../../middleware/jwt.util';
import { AcceptInviteDto, StaffLoginDto } from './dto';

const SALT_ROUNDS = 12;

/**
 * Staff authentication  (T24)
 *
 * Mirrors MerchantAuthService/AdminAuthService, with one extra step:
 * there is no staff signup, only invite acceptance. A staff account can
 * exist only because an owner created an invite for that address.
 *
 * Role mapping matters. `MerchantStaff.role` is OWNER | STAFF, but the
 * token's `role` claim is the wider AccountRole. A STAFF row signs
 * `merchant_staff`; an OWNER row signs `merchant_owner`, so a co-owner
 * invited this way gets the same powers as the salon's original account
 * without needing a second Merchant row. Either way `merchantId` is the
 * salon's id and `sub` is the STAFF id — which is exactly what
 * `Visit.loggedBy` ("staff user id") was always meant to record.
 */
@Injectable()
export class StaffAuthService {
  constructor(private readonly prisma: PrismaService) {}

  private hashToken(raw: string) {
    return createHash('sha256').update(raw).digest('hex');
  }

  /** Public preview so the accept-invite page can show who invited you. */
  async previewInvite(rawToken: string) {
    const invite = await this.prisma.staffInvite.findUnique({
      where: { token: this.hashToken(rawToken) },
      include: { merchant: { select: { businessName: true } } },
    });

    if (!invite || invite.acceptedAt || invite.revokedAt) {
      throw new BadRequestException('Invalid or already-used invite');
    }
    if (invite.expiresAt < new Date()) throw new BadRequestException('Invite expired');

    return {
      email: invite.email,
      name: invite.name,
      role: invite.role,
      businessName: invite.merchant.businessName,
      expiresAt: invite.expiresAt,
    };
  }

  async acceptInvite(dto: AcceptInviteDto) {
    const hashed = this.hashToken(dto.token);
    const invite = await this.prisma.staffInvite.findUnique({ where: { token: hashed } });

    if (!invite || invite.acceptedAt || invite.revokedAt) {
      throw new BadRequestException('Invalid or already-used invite');
    }
    if (invite.expiresAt < new Date()) throw new BadRequestException('Invite expired');

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    // Both writes in one transaction: without it a crash between them either
    // burns the invite with no account created, or creates the account with
    // the token still live for a second use.
    const staff = await this.prisma.$transaction(async (tx) => {
      // Re-check inside the transaction — two clicks on the emailed link a
      // moment apart would otherwise both pass the read above.
      const fresh = await tx.staffInvite.findUnique({ where: { id: invite.id } });
      if (!fresh || fresh.acceptedAt || fresh.revokedAt) {
        throw new BadRequestException('Invalid or already-used invite');
      }

      await tx.staffInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });

      return tx.merchantStaff.create({
        data: {
          merchantId: invite.merchantId,
          email: invite.email,
          name: dto.name?.trim() || invite.name,
          role: invite.role,
          passwordHash,
        },
        select: { id: true, email: true, name: true, role: true, merchantId: true },
      });
    });

    return { ok: true, staff };
  }

  async login(dto: StaffLoginDto) {
    const email = dto.email.trim().toLowerCase();
    const staff = await this.prisma.merchantStaff.findUnique({
      where: { email },
      include: { merchant: { select: { id: true, businessName: true, status: true } } },
    });

    if (!staff || !(await bcrypt.compare(dto.password, staff.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = sign({
      sub: staff.id,
      role: staff.role === 'OWNER' ? 'merchant_owner' : 'merchant_staff',
      merchantId: staff.merchantId,
    });

    await this.prisma.merchantStaff.update({
      where: { id: staff.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      token,
      staff: { id: staff.id, email: staff.email, name: staff.name, role: staff.role },
      merchant: {
        id: staff.merchant.id,
        businessName: staff.merchant.businessName,
        status: staff.merchant.status,
      },
    };
  }

  /**
   * Who am I — lets the UI decide which panels to render for this role.
   *
   * Answers for BOTH kinds of merchant token, because the frontend has one
   * "who is signed in" call and two ways to have signed in. The salon's
   * original account lives in `Merchant`, not `MerchantStaff`, so its `sub`
   * matches no staff row; without the second branch the owner would get a
   * 401 from their own team page. `isOwnerAccount` distinguishes the salon
   * account itself from a staff row that merely holds the OWNER role.
   */
  async me(accountId: string, merchantId: string) {
    const staff = await this.prisma.merchantStaff.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        lastLoginAt: true,
        merchant: { select: { id: true, businessName: true, status: true } },
      },
    });
    if (staff) return { ...staff, isOwnerAccount: false };

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: accountId },
      select: { id: true, email: true, businessName: true, status: true },
    });
    if (!merchant || merchant.id !== merchantId) {
      throw new UnauthorizedException('Account no longer exists');
    }

    return {
      id: merchant.id,
      email: merchant.email,
      name: merchant.businessName,
      role: 'OWNER' as const,
      lastLoginAt: null,
      merchant: { id: merchant.id, businessName: merchant.businessName, status: merchant.status },
      isOwnerAccount: true,
    };
  }
}
