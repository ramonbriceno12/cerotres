import { type FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from '../lib/api';
import { BrandLogoOnDark } from '../components/Brand';

export function LoginPage() {
  const { admin, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [email, setEmail] = useState('owner@cerotres.com');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && admin) {
    return <Navigate to={from} replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password, totpCode || undefined);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TOTP_REQUIRED') {
        setNeedsTotp(true);
        setError('Ingresa el código de autenticación (2FA).');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('No se pudo iniciar sesión');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden p-10 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.08), transparent 45%), radial-gradient(circle at 80% 0%, rgba(255,255,255,0.06), transparent 40%)',
          }}
        />
        <div className="relative">
          <BrandLogoOnDark className="h-12 w-auto max-w-[10rem]" />
        </div>
        <div className="relative max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Operations Console
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Control total de la operación
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Pedidos, cocina, canales y finanzas en un panel diseñado para decisiones rápidas.
          </p>
        </div>
        <p className="relative text-xs text-zinc-600">Cero Tres · Admin</p>
      </div>

      <div className="flex w-full flex-col justify-center px-4 py-10 sm:px-8 lg:max-w-md lg:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandLogoOnDark className="mx-auto h-14 w-auto max-w-[11rem]" />
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold tracking-tight text-white">Iniciar sesión</h2>
            <p className="mt-1 text-sm text-zinc-400">Acceso restringido al equipo autorizado.</p>
          </div>

          <form
            onSubmit={(e) => void onSubmit(e)}
            className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-2xl backdrop-blur-sm"
          >
            <label className="block text-sm font-medium text-zinc-300">
              Email
              <input
                className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label className="block text-sm font-medium text-zinc-300">
              Contraseña
              <input
                className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </label>

            {needsTotp && (
              <label className="block text-sm font-medium text-zinc-300">
                Código 2FA
                <input
                  className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                  inputMode="numeric"
                  pattern="\d{6}"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  required
                />
              </label>
            )}

            {error && (
              <p className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="admin-raw mt-2 w-full rounded-lg bg-white px-3 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Entrando…' : 'Entrar al panel'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
