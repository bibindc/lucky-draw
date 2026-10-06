import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, KeyRound, TicketCheck } from 'lucide-react';
import { login, sessionQueryKey } from '../../api/auth';
import { authNoticeKey, authNoticeMessages, type AuthNotice } from '../../session';

export default function LoginPage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Set by sign-out or session expiry; there is nothing to fetch, so it stays null otherwise.
  const noticeQuery = useQuery<AuthNotice>({ queryKey: authNoticeKey, queryFn: () => null, staleTime: Infinity });
  const notice = noticeQuery.data ? authNoticeMessages[noticeQuery.data] : '';
  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (admin) => {
      queryClient.setQueryData(authNoticeKey, null);
      queryClient.setQueryData(sessionQueryKey, admin);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    loginMutation.mutate({ email, password });
  }

  return (
    <main className="login-page">
      <section className="login-aside">
        <a className="brand login-brand" href="#login" aria-label="Lucky Draw">
          <span className="brand-mark"><TicketCheck size={21} strokeWidth={2.2} /></span>
          <span className="brand-name">lucky<span>draw</span></span>
        </a>
        <div className="login-aside-content">
          <span className="login-aside-kicker">CAMPAIGN MANAGEMENT</span>
          <h1>Every draw,<br />in good hands.</h1>
          <p>Your campaign desk for participants, payments, prizes, and the moments that matter.</p>
          <div className="login-aside-rule"><span /><span /><span /></div>
        </div>
        <span className="login-aside-foot">ADMINISTRATOR ACCESS <i /> INDIA</span>
        <div className="login-orbit orbit-a" aria-hidden="true" />
        <div className="login-orbit orbit-b" aria-hidden="true" />
      </section>

      <section className="login-main">
        <div className="login-form-wrap">
          <div className="login-mobile-brand"><span className="brand-mark"><TicketCheck size={20} /></span><span className="brand-name">lucky<span>draw</span></span></div>
          <div className="login-symbol"><KeyRound size={20} /></div>
          <div className="login-eyebrow">ADMIN SIGN IN</div>
          <h2>Welcome back</h2>
          <p className="login-intro">Sign in to continue to your campaign workspace.</p>
          {notice && !loginMutation.isError && <p className="login-notice" role="status">{notice}</p>}

          <form className="login-form" onSubmit={submit}>
            <label htmlFor="admin-email">Email address</label>
            <input
              autoComplete="username"
              id="admin-email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@yourorganization.in"
              required
              type="email"
              value={email}
            />
            <div className="password-label-row"><label htmlFor="admin-password">Password</label></div>
            <input
              autoComplete="current-password"
              id="admin-password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              required
              type="password"
              value={password}
            />
            {loginMutation.isError && <p className="login-error" role="alert">{loginMutation.error.message}</p>}
            <button className="login-submit" disabled={loginMutation.isPending} type="submit">
              <span>{loginMutation.isPending ? 'Signing in…' : 'Sign in'}</span>
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="login-security"><span /> Secure administrator session</div>
        </div>
        <footer className="login-footer"><span>Lucky Draw Admin</span><span>Need access? Contact your administrator.</span></footer>
      </section>
    </main>
  );
}