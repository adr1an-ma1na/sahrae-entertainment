import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Mail, Lock, User, Eye, EyeOff, AlertCircle, CheckCircle2, Film, Trophy, Radio, Headphones, Loader2 } from 'lucide-react';
import { auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updatePassword, endRecovery } from '../firebase';
import { t, currentLang, setLang } from '../i18n';

/**
 * The front door. Sahrae needs an account to watch or listen, so this is the
 * whole screen until someone is signed in: email and password, a new account,
 * or a reset link.
 *
 * Supabase's messages are written for developers ("Invalid login
 * credentials"); `friendly` turns the ones people actually hit into plain
 * words, and the rest pass through unchanged.
 */
type Mode = 'signin' | 'signup' | 'reset';

export function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('incorrect email or password')) return t('That email and password do not match. Check them, or reset your password.');
  if (m.includes('already registered') || m.includes('already exists')) return t('There is already an account with this email. Sign in instead.');
  if (m.includes('email not confirmed')) return t('Confirm your email first: open the link we sent you, then sign in.');
  if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes')) return t('Too many tries. Wait a minute, then try again.');
  if (m.includes('password should be') || m.includes('at least 6')) return t('Use a password of at least 6 characters.');
  if (m.includes('invalid email') || m.includes('unable to validate email')) return t('That email address does not look right.');
  if (m.includes('failed to fetch') || m.includes('network')) return t('No connection. Check your internet and try again.');
  return message;
}

const FEATURES = [
  { icon: Film, text: 'Movies and series' },
  { icon: Trophy, text: 'Live sport' },
  { icon: Radio, text: 'Live TV' },
  { icon: Headphones, text: 'Music and podcasts' },
] as const;

const field = 'w-full bg-zinc-900/80 border border-white/10 text-white rounded-xl pl-11 pr-4 py-3.5 text-[15px] placeholder:text-zinc-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 transition-colors';

export default function SignInGate() {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setError(''); setNotice(''); }, [mode]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(''); setNotice(''); setBusy(true);
    try {
      if (mode === 'signin') {
        await signInWithEmailAndPassword(auth, email, password);
      } else if (mode === 'signup') {
        const res = await createUserWithEmailAndPassword(auth, email, password, name.trim() || undefined) as { user: unknown; needsConfirmation?: boolean };
        if (res.needsConfirmation) {
          setMode('signin');
          setNotice(t('Account created. Open the link we emailed you, then sign in.'));
          return;
        }
      } else {
        await sendPasswordResetEmail(auth, email);
        setNotice(t('If there is an account for that email, a reset link is on its way. Check your inbox and spam folder.'));
      }
    } catch (err) {
      setError(friendly(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'signin' ? t('Sign in') : mode === 'signup' ? t('Create your account') : t('Reset your password');
  const cta = mode === 'signin' ? t('Sign in') : mode === 'signup' ? t('Create account') : t('Send reset link');

  return (
    <div className="min-h-screen bg-zinc-950 text-white relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(70% 55% at 15% 0%, rgba(245,158,11,0.22), transparent 70%), radial-gradient(60% 50% at 90% 100%, rgba(244,63,94,0.16), transparent 70%)' }} />

      <div className="relative min-h-screen max-w-6xl mx-auto px-5 md:px-10 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)] flex flex-col">
        <header className="flex items-center justify-between">
          <span className="text-2xl md:text-3xl font-display font-black tracking-tighter text-gold">SAHRAE</span>
          <button type="button" data-tv-focusable
            onClick={() => setLang(currentLang() === 'sw' ? 'en' : 'sw')}
            className="text-xs font-bold px-3 py-1.5 rounded-full border border-white/15 text-zinc-300 hover:text-white hover:border-white/30">
            {currentLang() === 'sw' ? 'English' : 'Kiswahili'}
          </button>
        </header>

        <div className="flex-1 grid md:grid-cols-2 gap-8 md:gap-16 items-center py-8">
          <section className="hidden md:block">
            <h1 className="text-5xl lg:text-6xl font-display font-black leading-[1.05] tracking-tight">
              {t('Everything you watch.')}<br /><span className="text-gold">{t('One app.')}</span>
            </h1>
            <p className="mt-5 text-lg text-zinc-300 max-w-md">{t('Films, series, live football and every big match, news channels, music and podcasts. On your phone, laptop and TV.')}</p>
            <ul className="mt-8 grid grid-cols-2 gap-3 max-w-md">
              {FEATURES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-4 py-3">
                  <Icon className="w-5 h-5 text-amber-400 shrink-0" /><span className="text-sm font-semibold">{t(text)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="w-full max-w-md mx-auto md:mx-0 md:justify-self-end">
            <div className="md:hidden mb-6">
              <h1 className="text-3xl font-display font-black leading-tight tracking-tight">
                {t('Everything you watch.')} <span className="text-gold">{t('One app.')}</span>
              </h1>
              <div className="mt-3 flex flex-wrap gap-2">
                {FEATURES.map(({ icon: Icon, text }) => (
                  <span key={text} className="flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs font-semibold text-zinc-200">
                    <Icon className="w-3.5 h-3.5 text-amber-400" />{t(text)}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-3xl bg-zinc-900/70 border border-white/10 backdrop-blur-md p-6 md:p-8 shadow-2xl">
              <h2 className="text-2xl font-bold">{title}</h2>
              <p className="text-sm text-zinc-400 mt-1">
                {mode === 'signin' ? t('Welcome back. Sign in to keep watching.')
                  : mode === 'signup' ? t('It takes a minute. Your lists and progress follow you to every device.')
                  : t('Enter your account email and we will send you a link.')}
              </p>

              {error && (
                <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/40 text-red-300 p-3 text-sm">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" /><p>{error}</p>
                </div>
              )}
              {notice && (
                <div role="status" className="mt-5 flex items-start gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 p-3 text-sm">
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" /><p>{notice}</p>
                </div>
              )}

              <form onSubmit={submit} className="mt-6 space-y-3" noValidate={false}>
                {mode === 'signup' && (
                  <label className="relative block">
                    <span className="sr-only">{t('Your name')}</span>
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                    <input type="text" autoComplete="name" placeholder={t('Your name')} value={name} onChange={(e) => setName(e.target.value)} className={field} />
                  </label>
                )}
                <label className="relative block">
                  <span className="sr-only">{t('Email')}</span>
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <input ref={emailRef} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required
                    data-tv-autofocus placeholder={t('Email')} value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
                </label>
                {mode !== 'reset' && (
                  <label className="relative block">
                    <span className="sr-only">{t('Password')}</span>
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                    <input type={show ? 'text' : 'password'} required minLength={6}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      placeholder={mode === 'signup' ? t('Password (6 or more characters)') : t('Password')}
                      value={password} onChange={(e) => setPassword(e.target.value)} className={`${field} pr-12`} />
                    <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? t('Hide password') : t('Show password')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white">
                      {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </label>
                )}

                {mode === 'signin' && (
                  <div className="flex justify-end">
                    <button type="button" onClick={() => setMode('reset')} className="text-sm text-zinc-400 hover:text-amber-400">{t('Forgot password?')}</button>
                  </div>
                )}

                <button type="submit" disabled={busy}
                  className="w-full mt-2 bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold py-3.5 rounded-xl text-[15px] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}{busy ? t('Please wait') : cta}
                </button>
              </form>

              <div className="mt-6 pt-5 border-t border-white/10 text-sm text-zinc-400 text-center">
                {mode === 'signin' ? (
                  <>{t('New to Sahrae?')} <button type="button" onClick={() => setMode('signup')} className="text-amber-400 font-semibold hover:underline">{t('Create an account')}</button></>
                ) : (
                  <>{mode === 'signup' ? t('Already have an account?') : t('Remembered it?')} <button type="button" onClick={() => setMode('signin')} className="text-amber-400 font-semibold hover:underline">{t('Sign in')}</button></>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * Shown over the app after someone opens a password-reset link: the link has
 * signed them in, and the one thing left is a new password.
 */
export function NewPasswordSheet() {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      if (!auth.currentUser) throw new Error(t('This reset link has expired. Ask for a new one.'));
      await updatePassword(auth.currentUser, password);
      endRecovery();
    } catch (err) {
      setError(friendly(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="dialog" data-tv-layer className="fixed inset-0 z-[500] bg-black/85 backdrop-blur-sm flex items-center justify-center p-5">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-white/10 p-6 shadow-2xl">
        <h2 className="text-xl font-bold text-white">{t('Choose a new password')}</h2>
        <p className="text-sm text-zinc-400 mt-1">{t('You will use it to sign in on all your devices.')}</p>
        {error && <p role="alert" className="mt-4 text-sm text-red-300 flex gap-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}</p>}
        <label className="relative block mt-5">
          <span className="sr-only">{t('New password')}</span>
          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
          <input type={show ? 'text' : 'password'} required minLength={6} autoComplete="new-password" data-tv-autofocus
            placeholder={t('New password (6 or more characters)')} value={password} onChange={(e) => setPassword(e.target.value)} className={`${field} pr-12`} />
          <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? t('Hide password') : t('Show password')}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white">
            {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </label>
        <button type="submit" disabled={busy} className="w-full mt-4 bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold py-3.5 rounded-xl disabled:opacity-60">
          {busy ? t('Please wait') : t('Save password')}
        </button>
      </form>
    </div>
  );
}
