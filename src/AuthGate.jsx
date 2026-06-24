import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from './lib/supabase';

const ALLOWED_ROLES = ['admin', 'finance'];

function Brand() {
  return <div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-xl bg-white p-2 shadow-sm"><img src="/images/yalabyte-yb-logo.png" alt="YalaByte" className="h-full w-full object-contain" /></span><div><p className="text-lg font-bold tracking-tight">YalaByte</p><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyanbrand-500">Finance ERP</p></div></div>;
}

export default function AuthGate({ children }) {
  const [state, setState] = useState({ loading: true, session: null, profile: null });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadAccess = async (session) => {
    if (!session) { setState({ loading: false, session: null, profile: null }); return; }
    const { data: profile, error: profileError } = await supabase.from('profiles').select('id, full_name, email, role').eq('id', session.user.id).single();
    if (profileError || !ALLOWED_ROLES.includes(profile?.role)) {
      await supabase.auth.signOut();
      setError('Your YalaByte account has not been assigned Finance access. Ask an administrator to assign the Admin or Finance role in CRM.');
      setState({ loading: false, session: null, profile: null });
      return;
    }
    setState({ loading: false, session, profile });
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

  if (state.loading) return <main className="grid min-h-screen place-items-center bg-ink text-white"><p className="text-sm font-semibold text-slate-300">Opening Finance…</p></main>;
  if (state.session && state.profile) return children({ profile: state.profile, signOut: () => supabase.auth.signOut() });

  return <main className="min-h-screen bg-ink px-5 py-10 text-white"><div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-5xl items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]"><section className="hidden lg:block"><Brand/><h1 className="mt-10 max-w-xl text-5xl font-semibold leading-tight tracking-tight">Your numbers.<br/><span className="text-cyanbrand-400">One clear picture.</span></h1><p className="mt-5 max-w-lg text-lg leading-8 text-slate-400">Private financial operations for the YalaByte admin and finance teams.</p></section><form onSubmit={signIn} className="rounded-2xl border border-white/10 bg-white p-6 text-ink shadow-soft sm:p-8"><div className="text-ink lg:hidden"><Brand/></div><p className="text-sm font-bold text-cyanbrand-600 lg:mt-0 mt-8">Restricted workspace</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Sign in to Finance</h2><p className="mt-2 text-sm leading-6 text-slate-500">Access is limited to approved YalaByte administrators and finance team members.</p>{!isSupabaseConfigured ? <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">Supabase setup is required. Add the project URL and anon key to your local <code>.env</code> file.</div> : <><label className="mt-7 block text-sm font-semibold">YalaByte email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@yalabyte.com" autoComplete="email" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-cyanbrand-500 focus:ring-4 focus:ring-cyan-50"/></label><label className="mt-5 block text-sm font-semibold">Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-cyanbrand-500 focus:ring-4 focus:ring-cyan-50"/></label>{error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}<button disabled={submitting} className="mt-6 w-full rounded-xl bg-cyanbrand-500 px-4 py-3 font-bold text-ink hover:bg-cyanbrand-400 disabled:opacity-60">{submitting ? 'Signing in…' : 'Sign in securely'}</button></>}</form></div></main>;
}
