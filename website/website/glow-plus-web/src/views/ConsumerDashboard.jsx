import { useApp } from '../context/AppContext.jsx';
import { useAsyncData } from '../lib/useAsyncData.js';
import { getMerchants, getRules, getVisits } from '../lib/data.js';
import { formatPhone, initials } from '../lib/helpers.js';
import Punch from '../components/Punch.jsx';
import T from '../components/T.jsx';

/**
 * Port of renderConsumerDashboard().
 *
 * The original built an HTML string, injected it, then walked back over the
 * merchant blocks in a second pass to animate each punch card by id. Rendering
 * <Punch> inline collapses those two passes into one while producing the same
 * markup and the same staggered fill.
 */
function buildProgress(rule, visits) {
  const scoped = rule.styleScope
    ? visits.filter((v) => v.styleType === rule.styleScope)
    : visits;
  const progressRaw =
    rule.triggerType === 'VISIT_COUNT'
      ? scoped.length
      : scoped.reduce((s, v) => s + v.pointsEarned, 0);
  return progressRaw % rule.triggerValue;
}

export default function ConsumerDashboard({ active }) {
  const { currentConsumer, signOutConsumer, dataVersion } = useApp();

  const blocks = useAsyncData(
    async () => {
      if (!currentConsumer) return null;
      const merchants = await getMerchants();
      const out = [];
      for (const m of merchants) {
        const visits = (await getVisits(m.id)).filter(
          (v) => v.consumerPhone === currentConsumer.phone
        );
        // Only show salons this consumer has actually visited.
        if (visits.length === 0) continue;
        const rules = (await getRules(m.id)).filter((r) => r.active !== false);
        const points = visits.reduce((s, v) => s + v.pointsEarned, 0);
        out.push({ merchant: m, visits, rules, points });
      }
      return out;
    },
    [dataVersion, currentConsumer],
    null
  );

  const totalPoints = blocks ? blocks.reduce((s, b) => s + b.points, 0) : 0;

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
              {currentConsumer ? currentConsumer.name : ' '}
            </div>
            <div className="id-phone" id="dashPhone">
              {currentConsumer ? formatPhone(currentConsumer.phone) : ' '}
            </div>
          </div>
        </div>
        <div className="id-right">
          <div className="num" id="dashTotalPoints">{totalPoints}</div>
          <T as="div" className="lbl" k="hero_stat_points" />
        </div>
      </div>
      <div id="dashMerchants">
        {blocks && blocks.length === 0 ? (
          <div className="empty">
            No visits yet. Ask your salon to log your first visit — your rewards
            will show up here.
          </div>
        ) : null}
        {blocks && blocks.length
          ? blocks.map(({ merchant, visits, rules, points }) => (
              <div className="merchant-card" key={merchant.id}>
                <div className="merchant-card-head">
                  <h3>{merchant.businessName}</h3>
                  <div className="merchant-points">{points} pts here</div>
                </div>

                {rules.length ? (
                  rules.map((r) => {
                    const progress = buildProgress(r, visits);
                    const remaining = r.triggerValue - progress;
                    const rewardLabel =
                      r.rewardType === 'PERCENT_OFF'
                        ? r.rewardValue + '% off'
                        : r.rewardType === 'FLAT_DISCOUNT'
                        ? '$' + r.rewardValue + ' off'
                        : r.rewardValue + ' free';
                    const unit = r.triggerType === 'VISIT_COUNT' ? 'visits' : 'points';
                    return (
                      <div className="reward-row" key={r.id}>
                        <div className="rname">{r.name}</div>
                        <Punch
                          id={'rp-' + merchant.id + '-' + r.id}
                          small
                          total={r.triggerValue}
                          filled={progress}
                        />
                        <div className="punch-note" style={{ marginTop: '8px' }}>
                          <b>
                            {remaining} more {unit}
                          </b>
                          {' for ' + rewardLabel}
                        </div>
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
                  {visits
                    .slice()
                    .sort((a, b) => b.date - a.date)
                    .slice(0, 5)
                    .map((v) => (
                      <div className="visit-item" key={v.id}>
                        <span className="vstyle">{v.styleName}</span>
                        <span className="vpts">+{v.pointsEarned} pts</span>
                      </div>
                    ))}
                </div>
              </div>
            ))
          : null}
      </div>
    </section>
  );
}
