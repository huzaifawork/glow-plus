import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useAsyncData } from '../lib/useAsyncData.js';
import {
  ApiError,
  cancelBooking,
  createBooking,
  getAvailability,
  getMyRewards,
  listMyBookings,
  listMyVisits,
  listPublicMerchants,
  listPublicStyles,
  redeemReward,
} from '../lib/api.js';
import { formatDateTime, formatDay, formatSlot, initials, todayISO } from '../lib/helpers.js';
import Punch from '../components/Punch.jsx';
import T from '../components/T.jsx';

/**
 * The consumer flow, against the real API (T36).
 *
 * Until now this view was the prototype's `renderConsumerDashboard()` reading
 * `data.js` → `localStorage` [F9]: it rendered convincingly and knew nothing.
 * Everything below is now a real request. T35 made the *session* real; this
 * makes the *contents* real, and adds the three things the prototype never
 * had a screen for at all — booking, appointments and redeeming.
 *
 * Tabs rather than one long page, reusing BusinessPortal's `.portal-tabs` /
 * `.ptab-panel` markup so the two dashboards look like the same product.
 *
 * Each panel loads on its own, deliberately. The rewards call is the only one
 * needed to render something useful, and a customer who never opens
 * "Visit history" should not pay for it — which also means a failure in one
 * tab cannot blank the others.
 */

/* ============================================================
   Shared plumbing
   ============================================================ */

/**
 * One place that decides what a failed request looks like.
 *
 * A 401 here is not "you typed something wrong" — `lib/api.js` has already
 * thrown the rejected token away, so the view is holding a session that no
 * longer exists. Without dropping the local identity too, the dashboard keeps
 * rendering a signed-in shell whose every request 401s and whose only visible
 * symptom is toasts. Sending the user back to the login form is the honest
 * response, and it is the same one the standalone pages settled on.
 */
function useApiError() {
  const { toast, signOutConsumer, currentConsumer } = useApp();
  return useCallback(
    (err) => {
      toast(err instanceof ApiError ? err.message : String(err));
      // Only when there IS a session to end. signOutConsumer() navigates to
      // the login view, and this view stays mounted while the marketing page
      // is on screen (that is how `.view.active` works) — so firing it on a
      // signed-out 401 would yank a first-time visitor off the landing page.
      if (err instanceof ApiError && err.status === 401 && currentConsumer) signOutConsumer();
    },
    [toast, signOutConsumer, currentConsumer],
  );
}

/**
 * `useAsyncData` with the rejection handled.
 *
 * The hook was written for `data.js`, which swallows its own errors and can
 * never reject. A live `fetch` can, and an uncaught one there would surface as
 * an unhandled promise rejection in the console and a view stuck on its
 * initial value with nothing said. Catching inside the loader keeps the "null
 * until it arrives" contract every panel below is written against.
 */
function useApiData(loader, deps) {
  const onError = useApiError();
  return useAsyncData(
    async () => {
      try {
        return await loader();
      } catch (err) {
        onError(err);
        return null;
      }
    },
    deps,
    null,
  );
}

function rewardLabel(r) {
  return r.rewardType === 'PERCENT_OFF'
    ? r.rewardValue + '% off'
    : r.rewardType === 'FLAT_DISCOUNT'
    ? '$' + (r.rewardValue / 100).toFixed(2).replace(/\.00$/, '') + ' off'
    : r.rewardValue + ' free';
}

function unitLabel(r) {
  return r.triggerType === 'VISIT_COUNT' ? 'visits' : 'points';
}

/**
 * A punch card, or a meter — whichever the rule actually is.
 *
 * The prototype punched one dot per `triggerValue` for every rule, and against
 * its invented localStorage data that was always a small number. Real reward
 * rules are not: the seeded "200 Points = $20 Off" renders **two hundred**
 * dots that way, which is not a punch card, it is a wall. A points threshold
 * was never a punch card in the first place — you do not punch a card once per
 * point — so VISIT_COUNT keeps the dots (that is literally what they count)
 * and POINTS_THRESHOLD gets a meter reading in points.
 */
function RewardProgress({ id, rule, filled }) {
  if (rule.triggerType === 'VISIT_COUNT') {
    return <Punch id={id} small total={rule.triggerValue} filled={filled} />;
  }

  const pct = Math.min(100, Math.round((filled / rule.triggerValue) * 100));
  return (
    <div className="meter" id={id}>
      <div className="meter-fill" style={{ width: pct + '%' }} />
      <span className="meter-label">
        {filled} / {rule.triggerValue} pts
      </span>
    </div>
  );
}

/* ============================================================
   Rewards tab — GET /me/rewards
   ============================================================ */
function RewardsPanel({ active, blocks }) {
  const { bumpData, toast } = useApp();
  const onError = useApiError();
  const [redeeming, setRedeeming] = useState(null);

  async function redeem(rule) {
    setRedeeming(rule.ruleId);
    try {
      await redeemReward(rule.ruleId);
      toast(`Redeemed: ${rule.name}. Show this to the salon.`);
      // Re-reads /me/rewards, which is what re-locks the card — eligibility is
      // re-derived server-side from real Redemption rows, never assumed here.
      bumpData();
    } catch (err) {
      onError(err);
    } finally {
      setRedeeming(null);
    }
  }

  return (
    <div className={'ptab-panel' + (active ? ' active' : '')} id="ctab-rewards">
      <div id="dashMerchants">
        {blocks && blocks.length === 0 ? (
          <div className="empty">
            No visits yet. Ask your salon to log your first visit — your rewards
            will show up here.
          </div>
        ) : null}

        {(blocks || []).map((block) => (
          <div className="merchant-card" key={block.merchantId}>
            <div className="merchant-card-head">
              <h3>{block.businessName}</h3>
              <div className="merchant-points">{block.points} pts here</div>
            </div>

            {block.rewards.length ? (
              block.rewards.map((r) => {
                // An unlocked milestone shows a FULL card, not an empty one.
                // `progress % triggerValue` is 0 at exactly 5 of 5 visits, so
                // the prototype's modulo alone would have blanked the card at
                // the very moment the reward became available.
                const filled = r.eligible ? r.triggerValue : r.progress % r.triggerValue;
                return (
                  <div className="reward-row" key={r.ruleId}>
                    <div className="rname">{r.name}</div>
                    <RewardProgress
                      id={'rp-' + block.merchantId + '-' + r.ruleId}
                      rule={r}
                      filled={filled}
                    />
                    {r.eligible ? (
                      <div
                        className="punch-note"
                        style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}
                      >
                        <b>Ready — {rewardLabel(r)}</b>
                        <button
                          type="button"
                          className="toggle active"
                          onClick={() => redeem(r)}
                          disabled={redeeming === r.ruleId}
                        >
                          {redeeming === r.ruleId ? 'Redeeming…' : 'Redeem'}
                        </button>
                      </div>
                    ) : (
                      <div className="punch-note" style={{ marginTop: '8px' }}>
                        <b>
                          {r.remaining} more {unitLabel(r)}
                        </b>
                        {' for ' + rewardLabel(r)}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="reward-row">
                <div className="punch-note">
                  This salon hasn’t set up reward rules yet.
                </div>
              </div>
            )}

            <div className="visit-list">
              <div className="rname" style={{ marginBottom: '6px' }}>
                Recent visits
              </div>
              {block.recentVisits.map((v) => (
                <div className="visit-item" key={v.id}>
                  <span className="vstyle">
                    {v.styleName}
                    <span className="meta" style={{ fontWeight: 400, marginLeft: '8px' }}>
                      {formatDay(v.visitDate)}
                    </span>
                  </span>
                  {/* Expired points stay in history but no longer count (T25),
                      so saying "+50 pts" here would be a lie. */}
                  <span className={v.expired ? 'meta' : 'vpts'}>
                    {v.expired ? 'expired' : '+' + v.pointsEarned + ' pts'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   Book tab — the public directory, then availability, then POST /bookings
   ============================================================ */
function BookPanel({ active }) {
  const { bumpData, toast } = useApp();
  const onError = useApiError();

  const [merchantId, setMerchantId] = useState('');
  const [styles, setStyles] = useState([]);
  const [styleId, setStyleId] = useState('');
  const [date, setDate] = useState(todayISO);
  const [slots, setSlots] = useState(null);
  const [selected, setSelected] = useState(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(false);

  // Public — no token needed, so this loads whether or not the session is live.
  const merchants = useApiData(() => listPublicMerchants(), []);

  useEffect(() => {
    if (merchants && merchants.length && !merchantId) setMerchantId(merchants[0].id);
  }, [merchants, merchantId]);

  useEffect(() => {
    if (!merchantId) return;
    let cancelled = false;
    setStyles([]);
    setStyleId('');
    setSlots(null);
    setSelected(null);
    listPublicStyles(merchantId)
      .then((list) => {
        if (cancelled) return;
        setStyles(list);
        if (list.length) setStyleId(list[0].id);
      })
      .catch((err) => {
        if (!cancelled) onError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [merchantId, onError]);

  async function findTimes(ev) {
    ev.preventDefault();
    if (!merchantId || !styleId || !date) return;
    setLoading(true);
    setSlots(null);
    setSelected(null);
    try {
      setSlots(await getAvailability(merchantId, styleId, date));
    } catch (err) {
      onError(err);
    } finally {
      setLoading(false);
    }
  }

  async function book() {
    if (!selected) return;
    setBooking(true);
    try {
      await createBooking({ merchantId, styleId, startTime: selected.startTime, notes });
      toast('Booked. You’ll find it under Appointments.');
      setNotes('');
      setSelected(null);
      // The slot we just took is gone — re-ask rather than crossing it off
      // locally, since anyone else may have taken one in the meantime too.
      setSlots(await getAvailability(merchantId, styleId, date));
      bumpData();
    } catch (err) {
      onError(err);
    } finally {
      setBooking(false);
    }
  }

  return (
    <div className={'ptab-panel' + (active ? ' active' : '')} id="ctab-book">
      <div className="panel-grid">
        <form className="panel-form" onSubmit={findTimes}>
          <h4>Book an appointment</h4>
          <div className="hint">Pick a salon and a service to see open times.</div>

          <label htmlFor="bkSalon">Salon</label>
          <select id="bkSalon" value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>
            {(merchants || []).map((m) => (
              <option value={m.id} key={m.id}>
                {m.businessName}
              </option>
            ))}
          </select>

          <label htmlFor="bkStyle">Service</label>
          <select
            id="bkStyle"
            value={styleId}
            onChange={(e) => setStyleId(e.target.value)}
            disabled={!styles.length}
          >
            {styles.length ? (
              styles.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name} · {s.durationMinutes} min · {s.pointsPerVisit} pts
                </option>
              ))
            ) : (
              <option value="">No services listed yet</option>
            )}
          </select>

          <label htmlFor="bkDate">Date</label>
          <input
            type="date"
            id="bkDate"
            value={date}
            min={todayISO()}
            onChange={(e) => setDate(e.target.value)}
          />

          <label htmlFor="bkNotes">Notes (optional)</label>
          <input
            type="text"
            id="bkNotes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything the salon should know"
          />

          <button
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={loading || !styleId}
          >
            {loading ? 'Checking…' : 'Find times'}
          </button>
        </form>

        <div>
          {slots === null ? (
            <div className="empty">Choose a salon, a service and a date, then check for open times.</div>
          ) : slots.length === 0 ? (
            <div className="empty">
              No open times that day. <b>Try another date.</b>
            </div>
          ) : (
            <>
              <div className="rname" style={{ marginBottom: '10px' }}>
                {slots.length} open time{slots.length === 1 ? '' : 's'}
              </div>
              <div className="slot-grid">
                {slots.map((s) => (
                  <button
                    type="button"
                    key={s.startTime}
                    className={'toggle' + (selected?.startTime === s.startTime ? ' active' : '')}
                    onClick={() => setSelected(s)}
                  >
                    {formatSlot(s.startTime)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: '18px' }}
                onClick={book}
                disabled={!selected || booking}
              >
                {booking
                  ? 'Booking…'
                  : selected
                  ? 'Book ' + formatSlot(selected.startTime)
                  : 'Pick a time'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Appointments tab — GET /bookings/me
   ============================================================ */
const CANCELLABLE = new Set(['PENDING', 'CONFIRMED']);

function BookingsPanel({ active }) {
  const { dataVersion, bumpData, toast, currentConsumer } = useApp();
  const onError = useApiError();
  const [cancelling, setCancelling] = useState(null);

  // Gated on the session, like every other authenticated loader here. Every
  // view stays mounted (`.view.active` toggles visibility, not existence), so
  // an ungated loader fires `GET /bookings/me` for an anonymous visitor who
  // has only ever seen the landing page — a guaranteed 401 on first paint.
  const bookings = useApiData(
    () => (currentConsumer ? listMyBookings() : Promise.resolve(null)),
    [dataVersion, currentConsumer],
  );

  async function cancel(id) {
    setCancelling(id);
    try {
      await cancelBooking(id);
      toast('Appointment cancelled.');
      bumpData();
    } catch (err) {
      onError(err);
    } finally {
      setCancelling(null);
    }
  }

  return (
    <div className={'ptab-panel' + (active ? ' active' : '')} id="ctab-bookings">
      {bookings && bookings.length === 0 ? (
        <div className="empty">
          No appointments yet. <b>Book one from the Book tab.</b>
        </div>
      ) : null}

      {(bookings || []).map((b) => (
        <div className="list-card" key={b.id}>
          <div>
            <div className="lc-name">
              {b.style.name} · {b.merchant.businessName}
            </div>
            <div className="lc-meta">{formatDateTime(b.startTime)}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className={'toggle ' + (b.status === 'CANCELLED' ? 'inactive' : 'active')}>
              {b.status.toLowerCase()}
            </span>
            {CANCELLABLE.has(b.status) ? (
              <button
                type="button"
                className="toggle"
                onClick={() => cancel(b.id)}
                disabled={cancelling === b.id}
              >
                {cancelling === b.id ? 'Cancelling…' : 'Cancel'}
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   Visit history tab — GET /visits/me
   ============================================================ */
function VisitsPanel({ active }) {
  const { dataVersion, currentConsumer } = useApp();
  const visits = useApiData(
    () => (currentConsumer ? listMyVisits() : Promise.resolve(null)),
    [dataVersion, currentConsumer],
  );

  if (visits && visits.length === 0) {
    return (
      <div className={'ptab-panel' + (active ? ' active' : '')} id="ctab-visits">
        <div className="empty">
          No visits logged yet. <b>Your salon logs these at the counter.</b>
        </div>
      </div>
    );
  }

  return (
    <div className={'ptab-panel' + (active ? ' active' : '')} id="ctab-visits">
      {/* A four-column table cannot fit 390px, and the page must not scroll
          sideways because of it — the table scrolls inside its own box. */}
      <div className="table-scroll">
      <table className="ledger">
        <thead>
          <tr>
            <th>Date</th>
            <th>Salon</th>
            <th>Service</th>
            <th>Points</th>
          </tr>
        </thead>
        <tbody>
          {(visits || []).map((v) => (
            <tr key={v.id}>
              <td>{formatDay(v.visitDate)}</td>
              <td>{v.businessName}</td>
              <td>
                {v.styleName} <span className={'tag ' + v.styleType}>{v.styleType.toLowerCase()}</span>
              </td>
              {/* Expired visits keep their row — only their points stop
                  counting (T25) — so the number is shown struck through
                  rather than dropped, which would make history look wrong. */}
              <td className={v.expired ? '' : 'pts'}>
                {v.expired ? (
                  <span className="lc-meta" style={{ textDecoration: 'line-through' }}>
                    {v.pointsEarned} pts
                  </span>
                ) : (
                  '+' + v.pointsEarned + ' pts'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/* ============================================================
   The view
   ============================================================ */
export default function ConsumerDashboard({ active }) {
  const { currentConsumer, signOutConsumer, dataVersion } = useApp();
  const [tab, setTab] = useState('rewards');

  const rewards = useApiData(
    () => (currentConsumer ? getMyRewards() : Promise.resolve(null)),
    [dataVersion, currentConsumer],
  );

  const tabs = [
    ['rewards', 'Rewards'],
    ['book', 'Book'],
    ['bookings', 'Appointments'],
    ['visits', 'Visit history'],
  ];

  return (
    <section className={'view' + (active ? ' active' : '')} id="view-consumer-dashboard">
      <div className="dash-header">
        <T as="h2" className="block-title" style={{ margin: 0 }} k="dash_title" />
        <T as="button" className="navbtn ghost" onClick={signOutConsumer} k="switch_account" />
      </div>

      <div className="id-card">
        <div className="id-left">
          <div className="avatar" id="dashAvatar">
            {currentConsumer ? initials(currentConsumer.name) : 'JI'}
          </div>
          <div>
            <div className="id-name" id="dashName">
              {currentConsumer ? currentConsumer.name : ' '}
            </div>
            {/* The prototype showed a phone number here. The API's login
                response carries no phone — and since T31b it is encrypted at
                rest and deliberately not handed back — so the identity line
                shows the email the account actually signs in with. */}
            <div className="id-phone" id="dashEmail">
              {currentConsumer ? currentConsumer.email || '' : ' '}
            </div>
          </div>
        </div>
        <div className="id-right">
          <div className="num" id="dashTotalPoints">{rewards ? rewards.totalPoints : 0}</div>
          <T as="div" className="lbl" k="hero_stat_points" />
        </div>
      </div>

      <div className="portal-tabs">
        {tabs.map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={'ptab' + (tab === id ? ' active' : '')}
            data-tab={id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <RewardsPanel active={tab === 'rewards'} blocks={rewards ? rewards.merchants : null} />
      <BookPanel active={tab === 'book'} />
      <BookingsPanel active={tab === 'bookings'} />
      <VisitsPanel active={tab === 'visits'} />
    </section>
  );
}
