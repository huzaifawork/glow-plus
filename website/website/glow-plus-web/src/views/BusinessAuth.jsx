import { useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { ApiError, merchantLogin, merchantSignup, resendVerification } from '../lib/api.js';
import T from '../components/T.jsx';

/** Real auth (T35) — replaces the fake business-name-only form [F9]. */
export default function BusinessAuth({ active }) {
  const { showView, setCurrentMerchant, toast } = useApp();
  const { t } = useI18n();

  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [signupNotice, setSignupNotice] = useState(null);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  async function submit(ev) {
    ev.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signup') {
        await merchantSignup({ businessName: businessName.trim(), email: email.trim(), password });
        setSignupNotice(email.trim());
        setResendDone(false);
        setMode('login');
        setPassword('');
      } else {
        const data = await merchantLogin(email.trim(), password);
        setCurrentMerchant({
          id: data.merchant.id,
          businessName: data.merchant.businessName,
          status: data.merchant.status,
          // T43 [F44] — the portal's pending banner reads this. It used to
          // look for `foundingBadge`, which nothing here ever set, so the
          // founding half of the banner was unreachable.
          foundingMember: data.merchant.foundingMember,
          createdAt: Date.now(),
        });
        if (!data.merchant.emailVerified) toast(t('auth_verify_banner', { email: email.trim() }));
        showView('view-business-portal');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!signupNotice) return;
    setResendBusy(true);
    try {
      await resendVerification(signupNotice);
      setResendDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setResendBusy(false);
    }
  }

  return (
    <section className={'view' + (active ? ' active' : '')} id="view-business-auth">
      <div className="auth-shell">
        <T as="h2" k="business_auth_title" />
        <T as="div" className="sub" k="business_auth_sub" />

        {signupNotice ? (
          <div className="notice" role="status">
            <T as="span" k="auth_signup_success" />
            <button type="button" className="link-btn" onClick={resend} disabled={resendBusy}>
              {resendDone ? t('auth_resend_sent') : t('auth_resend_verification')}
            </button>
          </div>
        ) : null}

        <form id="businessForm" onSubmit={submit}>
          {mode === 'signup' ? (
            <>
              <T as="label" htmlFor="bName" k="label_business_name" />
              <input
                type="text"
                id="bName"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Bloom Hair Studio"
                required
              />
            </>
          ) : null}
          <T as="label" htmlFor="bEmail" k="label_email" />
          <input
            type="email"
            id="bEmail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@salon.com"
            autoComplete="username"
            required
          />
          <T as="label" htmlFor="bPassword" k="label_password" />
          <input
            type="password"
            id="bPassword"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
          />

          {error ? (
            <p className="err" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
            {busy
              ? '…'
              : mode === 'signup'
              ? t('business_signup_submit')
              : t('business_login_submit')}
          </button>
        </form>

        <div className="switch-role">
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setMode(mode === 'signup' ? 'login' : 'signup');
              setError(null);
            }}
          >
            {mode === 'signup' ? t('auth_toggle_to_login') : t('auth_toggle_to_signup')}
          </button>
        </div>

        <div className="switch-role">
          <span dangerouslySetInnerHTML={{ __html: t('business_auth_switch') }} />
          <button type="button" className="link-btn" onClick={() => showView('view-consumer-auth')}>
            {t('customer_login_link')}
          </button>
        </div>
      </div>
    </section>
  );
}
