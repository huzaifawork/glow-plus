import { useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { ApiError, consumerLogin, consumerSignup, resendVerification } from '../lib/api.js';
import T from '../components/T.jsx';

/**
 * Real auth (T35) — replaces the fake name+phone form that wrote straight to
 * localStorage [F9]. The backend only knows email+password (`auth.service.ts`
 * has no phone-based login), so that is the identity here; phone stays as an
 * optional signup field, matching `SignupDto.phone?`.
 */
export default function ConsumerAuth({ active }) {
  const { showView, setCurrentConsumer, toast } = useApp();
  const { t } = useI18n();

  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [signupNotice, setSignupNotice] = useState(null); // email string once signup succeeds
  const [resendBusy, setResendBusy] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  async function submit(ev) {
    ev.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signup') {
        await consumerSignup({
          email: email.trim(),
          password,
          name: name.trim(),
          phone: phone.trim() || undefined,
        });
        setSignupNotice(email.trim());
        setResendDone(false);
        setMode('login');
        setPassword('');
      } else {
        const data = await consumerLogin(email.trim(), password);
        // `email` is carried from the form, not the response: POST /auth/login
        // returns only { id, name, emailVerified }. The dashboard's identity
        // line needs something real to show under the name (T36), and the
        // address just used to sign in is exactly that.
        setCurrentConsumer({
          id: data.user.id,
          name: data.user.name,
          email: email.trim(),
          emailVerified: data.user.emailVerified,
        });
        if (!data.user.emailVerified) toast(t('auth_verify_banner', { email: email.trim() }));
        showView('view-consumer-dashboard');
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
    <section className={'view' + (active ? ' active' : '')} id="view-consumer-auth">
      <div className="auth-shell">
        <T as="h2" k="consumer_auth_title" />
        <T as="div" className="sub" k="consumer_auth_sub" />

        {signupNotice ? (
          <div className="notice" role="status">
            <T as="span" k="auth_signup_success" />
            <button type="button" className="link-btn" onClick={resend} disabled={resendBusy}>
              {resendDone ? t('auth_resend_sent') : t('auth_resend_verification')}
            </button>
          </div>
        ) : null}

        <form id="consumerForm" onSubmit={submit}>
          {mode === 'signup' ? (
            <>
              <T as="label" htmlFor="cName" k="label_your_name" />
              <input
                type="text"
                id="cName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Joseph Ilunga"
                required
              />
              <T as="label" htmlFor="cPhone" k="label_phone" />
              <input
                type="tel"
                id="cPhone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="431 338 3939"
                autoComplete="tel"
              />
            </>
          ) : null}
          <T as="label" htmlFor="cEmail" k="label_email" />
          <input
            type="email"
            id="cEmail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="username"
            required
          />
          <T as="label" htmlFor="cPassword" k="label_password" />
          <input
            type="password"
            id="cPassword"
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
              ? t('consumer_signup_submit')
              : t('consumer_login_submit')}
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
          <span dangerouslySetInnerHTML={{ __html: t('consumer_auth_switch') }} />
          <button type="button" className="link-btn" onClick={() => showView('view-business-auth')}>
            {t('business_login_link')}
          </button>
        </div>
      </div>
    </section>
  );
}
