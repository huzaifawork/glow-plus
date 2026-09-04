import React from 'react';
import Pill from '../ui/Pill';
import { statusInfo } from '../../utils/format';

/**
 * A booking's current status  (R4.2)
 *
 * *"Each booking must display its current status (for example: pending,
 * confirmed, completed, cancelled, or no-show)."*
 *
 * The wording is customer-facing and comes from `utils/format.js`, not from
 * the enum: `PENDING` reads as "Awaiting confirmation" because "pending" does
 * not tell a first-time user that somebody still has to say yes, and `NO_SHOW`
 * reads as "Missed" because the enum is written from the salon's side of the
 * counter and this screen is not.
 *
 * `short` on a card, the full label on a detail row — same source, so the two
 * can never disagree about what a status means.
 */
export default function StatusPill({ status, size = 'md', short = false }) {
  const info = statusInfo(status);
  return <Pill label={short ? info.short : info.label} tone={info.tone} dot size={size} />;
}
