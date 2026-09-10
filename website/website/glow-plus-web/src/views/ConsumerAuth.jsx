import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import {
  ApiError,
  consumerLogin,
  consumerSignup,
  getConsumerProfile,
  resendVerification,
} from '../lib/api.js';
import { isGoogleCallback } from '../lib/supabase.js';
import GoogleSignInButton from '../components/auth/GoogleSignInButton.jsx';
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
  // T81 — login now REFUSES an unverified address (403). Without this the
  // message says "request a new one" while offering no way to do it: the
  // resend control was tied to `signupNotice`, which only exists in the tab
  // where the signup happened. Someone who closed that tab had no route back.
  const [unverified, setUnverified] = useState(null);
  const [resetHint, setResetHint] = useState(false);

  /**
   * Did this page load as the tail end of a "Continue with Google" round trip?
   *
   * Read HERE, in a state initializer, and not inside the effect below: the
   * button clears the pending record as soon as its own effect runs, and React
   * renders this component before its children. A `useState` initializer is
   * therefore the last moment the honest answer is still available.
   */
  const [returningFromGoogle] = useState(isGoogleCallback);

  /**
   * Google sends the browser back to `/`, which this SPA opens on the
   * marketing page. Without this the visitor would watch the hero section
   * while a sign-in finished invisibly behind it, then be thrown to the
   * dashboard — or, on a failure, see nothing at all and conclude the button
   * is broken. Switching to this view first means the outcome lands where they
   * were looking.
   */
  useEffect(() => {
    if (returningFromGoogle) showView('view-consumer-auth');
  }, [returningFromGoogle, showView]);

  /**
   * A Google sign-in has produced a real Glow+ session. Finish exactly where
   * the password path finishes.
   *
   * `GET /me` rather than the response's `user`, because `POST /auth/google`
   * answers with `{ id, name, emailVerified }` and no email — the address is
   * Google's, not something typed into the form above — and the dashboard's
   * identity line shows it. Same call the session-restore path in
   * `AppContext` already makes, so a Google session and a password session put
   * the same shape in state.
   *
   * A failure here is deliberately not fatal: the session is already valid and
   * stored, so signing the user in without their email on screen beats
   * refusing a sign-in that actually succeeded.
   */
  const finishGoogleSignIn = useCallback(
    async (data) => {
      let profile = null;
      try {
        profile = await getConsumerProfile();
      } catch {
        /* cosmetic — see above */
      }
      setCurrentConsumer({
        id: profile?.id ?? data.user.id,
        name: profile?.name ?? data.user.name,
        email: profile?.email ?? '',
        // Always true on this path, and true in the database by the time the
        // response arrives: Google has just proved the address, so
        // `signInWithGoogle` marks it verified rather than making the user
        // open an email to confirm what it already knows.
        emailVerified: true,
      });
      showView('view-consumer-dashboard');
    },
    [setCurrentConsumer, showView],
  );

  // Carries whatever they have already typed, so the reset form opens prefilled.
  const forgotHref =
    '/forgot-password' + (email.trim() ? '?email=' + encodeURIComponent(email.trim()) : '');

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
      // A 409 on signup means the address is already an account — which for a
      // walk-in is the *expected* answer, not a mistake they made. [F56]
      setResetHint(err instanceof ApiError && err.status === 409 && mode === 'signup');
      setUnverified(err instanceof ApiError && err.status === 403 ? email.trim() : null);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    const target = signupNotice || unverified;
    if (!target) return;
    setResendBusy(true);
    try {
      await resendVerification(signupNotice || unverified);
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

        {unverified && !signupNotice ? (
          <div className="notice" role="status">
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
              {/* A bare "already exists" is a dead end for the one group most
                  likely to hit it — walk-ins whose salon created the account
                  for them. Name the way out in the same breath. */}
              {resetHint ? (
                <>
                  {' '}
                  {t('signup_email_taken_hint')}{' '}
                  <a className="link-btn" href={forgotHref}>
                    {t('forgot_password_link')}
                  </a>
                </>
              ) : null}
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

        {/* Under the form, not above it. Email and password remain the primary
            way in — every account created before this existed has one, and the
            walk-in accounts `POST /visits` creates have nothing else. The
            button also sits OUTSIDE the <form>: it is `type="button"`, but a
            control inside a form that navigates the whole page away is one
            stray Enter key from looking like a lost signup. */}
        <GoogleSignInButton
          onSuccess={finishGoogleSignIn}
          disabled={busy}
        />

        <div className="switch-role">
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setMode(mode === 'signup' ? 'login' : 'signup');
              setError(null);
              setResetHint(false);
            }}
          >
            {mode === 'signup' ? t('auth_toggle_to_login') : t('auth_toggle_to_signup')}
          </button>
        </div>

        {/* [F56] — `/forgot-password` shipped in T21, is routed in both
            vite.config.js and vercel.json, and NOTHING on the site linked to
            it: the page was reachable only by typing the URL. That is not just
            a missing convenience. `POST /visits` creates a lightweight account
            for a walk-in with a 128-bit random password they never see, so
            signup answers them 409 and login is impossible — a reset was
            their ONLY way in, and it was unreachable. */}
        <div className="switch-role">
          <a className="link-btn" href={forgotHref}>
            {t('forgot_password_link')}
          </a>
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
