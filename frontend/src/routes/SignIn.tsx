import { useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '../design/components/brand/Logo';
import { Button } from '../design/components/core/Button';
import { Field } from '../components/Field';
import { Stack } from '../components/layout/Stack';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import styles from './SignIn.module.css';

type Mode = 'signin' | 'signup';

export function SignIn() {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: Location } | null)?.from?.pathname ?? '/';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else {
        await signUp(name, email, password);
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <Logo size={40} />
          <h1 className={styles.title}>{mode === 'signin' ? 'Where are you headed?' : 'Start keeping ideas'}</h1>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <Stack gap={4}>
            {mode === 'signup' && (
              <Field
                label="Name"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
              />
            )}
            <Field
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <Field
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
            />
          </Stack>

          {error && (
            <p role="alert" style={{ margin: 0, fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)' }}>
              {error}
            </p>
          )}

          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'One moment' : mode === 'signin' ? 'Sign in' : 'Create your account'}
          </Button>
        </form>

        <p className={styles.switchLine}>
          {mode === 'signin' ? "New here? " : 'Already keeping a trip? '}
          <button
            type="button"
            className={styles.switchButton}
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError(null);
            }}
          >
            {mode === 'signin' ? 'Create an account' : 'Sign in instead'}
          </button>
        </p>
      </div>
    </div>
  );
}
