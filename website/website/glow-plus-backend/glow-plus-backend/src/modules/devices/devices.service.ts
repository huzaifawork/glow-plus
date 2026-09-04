import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { isExpoPushToken, sendPush, PushMessage } from '../notifications/push.provider';

/**
 * Push-token bookkeeping, and the one place a notification is actually sent.
 *
 * Split from the callers on purpose: `BookingsService` should say *what*
 * happened ("this booking was confirmed"), not know how many devices the
 * customer has, which of them Expo has since disowned, or that a send is
 * batched. It calls `notifyUser` and moves on.
 */
@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Register (or re-register) this installation's push token.
   *
   * **Upsert on the TOKEN, moving `userId`.** A phone that signs into a second
   * account must stop receiving the first account's notifications — otherwise
   * one customer's appointment status arrives on a device somebody else is now
   * holding. The unique index is on `token` alone for exactly this reason; see
   * the model.
   *
   * `revokedAt: null` on every registration, so a token Expo previously
   * reported as dead comes back to life when the app proves otherwise by
   * asking to be registered again. That happens for real: notifications turned
   * off and then on again produce the same token.
   */
  async register(userId: string, token: string, platform = 'unknown') {
    const trimmed = token.trim();
    if (!isExpoPushToken(trimmed)) {
      // Validated here rather than in the DTO because the SHAPE of a valid
      // token is Expo's business, and `push.provider.ts` is where that
      // knowledge lives. A regex copied into a decorator is a second place to
      // update when Expo changes the format.
      throw new BadRequestException('That is not a valid Expo push token');
    }

    await this.prisma.deviceToken.upsert({
      where: { token: trimmed },
      create: { userId, token: trimmed, platform },
      update: { userId, platform, revokedAt: null },
    });

    return { ok: true };
  }

  /**
   * Forget this installation.
   *
   * Scoped to the caller's own `userId`: without it, anyone holding a consumer
   * token could unregister any device whose token they could guess or observe,
   * which is a silent denial of notifications rather than a loud error.
   * `deleteMany` rather than `delete` so unregistering an unknown token is a
   * no-op instead of a 404 — logout must never fail because the server had
   * already forgotten the device.
   */
  async unregister(userId: string, token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { userId, token: token.trim() } });
    return { ok: true };
  }

  /**
   * Send one notification to every live device a user has.
   *
   * **Never throws.** Every caller is a request that has already succeeded —
   * a booking really was confirmed — and a push failure may not undo it. See
   * the note at the top of `push.provider.ts`.
   *
   * Tokens Expo reports as `DeviceNotRegistered` are tombstoned rather than
   * deleted: the app may re-register the same token later (see `register`),
   * and a delete would race a client that is doing exactly that.
   */
  async notifyUser(
    userId: string,
    message: Omit<PushMessage, 'to'>,
  ): Promise<{ sent: number } | null> {
    try {
      const devices = await this.prisma.deviceToken.findMany({
        where: { userId, revokedAt: null },
        select: { token: true },
      });
      if (devices.length === 0) return { sent: 0 };

      const { sent, unregistered } = await sendPush(
        devices.map((d) => ({ ...message, to: d.token })),
      );

      if (unregistered.length) {
        await this.prisma.deviceToken.updateMany({
          where: { token: { in: unregistered } },
          data: { revokedAt: new Date() },
        });
      }

      return { sent };
    } catch (err) {
      this.logger.error(
        `Failed to send a push notification to ${userId}`,
        err instanceof Error ? err.stack : String(err),
      );
      return null;
    }
  }
}
