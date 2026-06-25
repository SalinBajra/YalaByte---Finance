import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from './lib/supabase';

const ALLOWED_ROLES = ['admin', 'finance'];
const WELCOME_SESSION_KEY = 'yalabyte-finance-welcome-shown';

function Brand({ compact = false, inverted = false }) {
  return <div className="flex items-center gap-3"><span className={`grid ${compact ? 'h-10 w-10' : 'h-12 w-12'} place-items-center rounded-xl bg-white p-2 shadow-sm`}><img src="/images/yalabyte-yb-logo.png" alt="YalaByte" className="h-full w-full object-contain" /></span><div><p className={`${compact ? 'text-lg' : 'text-xl'} font-bold tracking-tight ${inverted ? 'text-white' : 'text-ink'}`}>FinByte</p><p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${inverted ? 'text-cyanbrand-400' : 'text-cyanbrand-600'}`}>Finance OS</p></div></div>;
}

function FinanceLoader({ profile, compact = false }) {
  const label = profile?.full_name || profile?.email || 'finance team';
  const initials = label.split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'YB';
  if (compact) {
    return <main className="finance-shell flex min-h-screen items-center justify-center px-5 text-white"><div className="text-center"><div className="flex justify-center"><Brand compact inverted /></div><p className="mt-7 text-sm font-semibold text-slate-200">Balancing the books…</p><span className="mx-auto mt-4 block h-1 w-20 overflow-hidden rounded-full bg-white/10"><span className="block h-full w-1/2 animate-pulse rounded-full bg-cyanbrand-400" /></span></div></main>;
  }
  return <main className="finance-shell flex min-h-screen items-center justify-center px-5 text-white"><div className="text-center"><div className="flex justify-center"><Brand inverted /></div><span className="mx-auto mt-10 flex h-16 w-16 items-center justify-center rounded-full border border-cyanbrand-400/30 bg-white/10 text-lg font-extrabold text-cyanbrand-400 shadow-[0_0_40px_rgba(19,200,222,0.15)]">{initials}</span><p className="mt-6 text-xs font-extrabold uppercase tracking-[0.2em] text-cyanbrand-400">FinByte workspace</p><h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">Welcome, {label.split(/\s|@/)[0]}</h1><p className="mt-2 text-sm text-slate-300">FinByte is getting everything ready.</p><span className="mx-auto mt-6 block h-1 w-24 overflow-hidden rounded-full bg-white/10"><span className="block h-full w-1/2 animate-pulse rounded-full bg-cyanbrand-400" /></span></div></main>;
}

export default function AuthGate({ children }) {
  const [state, setState] = useState({ loading: true, session: null, profile: null });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [welcomeMode, setWelcomeMode] = useState(() => window.sessionStorage.getItem(WELCOME_SESSION_KEY) ? 'refresh' : 'login');

  const loadAccess = async (session) => {
    if (!session) { setWorkspaceReady(false); setState({ loading: false, session: null, profile: null }); return; }
    const { data: profile, error: profileError } = await supabase.from('profiles').select('id, full_name, email, avatar_url, role').eq('id', session.user.id).single();
    if (profileError || !ALLOWED_ROLES.includes(profile?.role)) {
      await supabase.auth.signOut();
      setError('Your YalaByte account has not been assigned Finance access. Ask an administrator to assign the Admin or Finance role in CRM.');
      setWorkspaceReady(false);
      setState({ loading: false, session: null, profile: null });
      return;
    }
    setState({ loading: false, session, profile });
    setWorkspaceReady(false);
    window.setTimeout(() => {
      window.sessionStorage.setItem(WELCOME_SESSION_KEY, 'true');
      setWorkspaceReady(true);
    }, welcomeMode === 'refresh' ? 500 : 1150);
  };

  useEffect(() => {
    if (!isSupabaseConfigured) { setState({ loading: false, session: null, profile: null }); return undefined; }
    supabase.auth.getSession().then(({ data }) => loadAccess(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => loadAccess(session));
    return () => data.subscription.unsubscribe();
  }, []);

  const signIn = async (event) => {
    event.preventDefault(); setError('');
    if (!email.trim().toLowerCase().endsWith('@yalabyte.com')) { setError('Use your @yalabyte.com work email.'); return; }
    setSubmitting(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (signInError) { setError(signInError.message); setSubmitting(false); return; }
    await loadAccess(data.session); setSubmitting(false);
  };

  const signOut = async () => {
    window.sessionStorage.removeItem(WELCOME_SESSION_KEY);
    setWelcomeMode('login');
    setWorkspaceReady(false);
    await supabase.auth.signOut();
  };

  if (state.loading) return <main className="finance-shell grid min-h-screen place-items-center text-white"><p className="text-sm font-semibold text-slate-300">Opening secure FinByte…</p></main>;
  if (state.session && state.profile && !workspaceReady) return <FinanceLoader compact={welcomeMode === 'refresh'} profile={state.profile} />;
  if (state.session && state.profile) return children({ profile: state.profile, signOut });

  return <main className="finance-shell min-h-screen px-5 py-10 text-white"><div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-5xl items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]"><section className="hidden lg:block"><Brand inverted/><h1 className="mt-10 max-w-xl text-5xl font-semibold leading-tight tracking-tight">Your numbers.<br/><span className="text-cyanbrand-400">One clear picture.</span></h1><p className="mt-5 max-w-lg text-lg leading-8 text-slate-400">Private financial operations for the YalaByte admin and finance teams.</p></section><form onSubmit={signIn} className="rounded-2xl border border-white/10 bg-white p-6 text-ink shadow-soft sm:p-8"><div className="text-ink lg:hidden"><Brand/></div><p className="text-sm font-bold text-cyanbrand-600 lg:mt-0 mt-8">Restricted workspace</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Sign in to FinByte</h2><p className="mt-2 text-sm leading-6 text-slate-500">Access is limited to approved YalaByte administrators and finance team members.</p>{!isSupabaseConfigured ? <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">Supabase setup is required. Add the project URL and anon key to your local <code>.env</code> file.</div> : <><label className="mt-7 block text-sm font-semibold">YalaByte email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@yalabyte.com" autoComplete="email" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-cyanbrand-500 focus:ring-4 focus:ring-cyan-50"/></label><label className="mt-5 block text-sm font-semibold">Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-cyanbrand-500 focus:ring-4 focus:ring-cyan-50"/></label>{error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}<button disabled={submitting} className="mt-6 w-full rounded-xl bg-cyanbrand-500 px-4 py-3 font-bold text-ink hover:bg-cyanbrand-400 disabled:opacity-60">{submitting ? 'Signing in…' : 'Sign in securely'}</button></>}</form></div></main>;
}
