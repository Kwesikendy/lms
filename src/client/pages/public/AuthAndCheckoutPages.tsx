import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Check,
  CreditCard,
  Eye,
  EyeOff,
  Lock,
  RefreshCw,
  Smartphone,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';
import { apiRequest, formatCurrency, formatDateTime } from '../../lib/api.js';
import {
  Badge,
  Button,
  Card,
  Cover,
  ErrorState,
  InputField,
  LinkButton,
  Skeleton,
  Tabs,
  cn,
} from '../../components/ui/index.js';
import type { Order, Product, User } from '../../../shared/types.js';

/* ============================================================================
   AUTH
   ============================================================================ */
type AuthMode = 'signin' | 'signup' | 'forgot';

const devAccounts = [
  { label: 'Learner', email: 'student@lms.local', role: 'Student Portal' },
  { label: 'Instructor', email: 'instructor@lms.local', role: 'Curriculum & Live' },
  { label: 'Admin', email: 'admin@lms.local', role: 'Platform Oversight' },
];

export const AuthPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');
  const [mode, setMode] = useState<AuthMode>(searchParams.get('mode') === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const { loginWithToken, notify, settings, user } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate(redirect || '/student/dashboard', { replace: true });
  }, [user, redirect, navigate]);

  const goAfterLogin = (u: User) => {
    if (redirect) navigate(redirect);
    else if (u.role === 'admin') navigate('/admin/dashboard');
    else if (u.role === 'instructor') navigate('/instructor/dashboard');
    else navigate('/student/dashboard');
  };

  const quickLogin = async (demoEmail: string) => {
    setMode('signin');
    setEmail(demoEmail);
    setPassword('Password123!');
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: User }>('/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email: demoEmail, password: 'Password123!' }),
      });
      await loginWithToken(res.token, res.user);
      notify({ type: 'success', title: `Signed in as ${res.user.full_name}` });
      goAfterLogin(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo sign-in failed. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === 'signin') {
        const res = await apiRequest<{ token: string; user: User }>('/api/auth/signin', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        await loginWithToken(res.token, res.user);
        notify({ type: 'success', title: `Welcome back, ${res.user.full_name.split(' ')[0]}` });
        goAfterLogin(res.user);
      } else if (mode === 'signup') {
        const res = await apiRequest<{ token: string; user: User }>('/api/auth/signup', {
          method: 'POST',
          body: JSON.stringify({ email, password, full_name: fullName }),
        });
        await loginWithToken(res.token, res.user);
        notify({ type: 'success', title: `Welcome to ${settings.org_name}` });
        goAfterLogin(res.user);
      } else if (!resetToken) {
        const res = await apiRequest<{ message: string; resetToken?: string }>('/api/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email }),
        });
        setInfo(res.message);
        if (res.resetToken) setResetToken(res.resetToken);
      } else {
        const res = await apiRequest<{ message: string }>('/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ token: resetToken, newPassword }),
        });
        notify({ type: 'success', title: 'Password updated', message: res.message });
        setMode('signin');
        setResetToken('');
        setNewPassword('');
        setPassword('');
        setInfo(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const titles: Record<AuthMode, string> = {
    signin: 'Welcome back',
    signup: 'Create your account',
    forgot: 'Reset your password',
  };

  return (
    <div className="mx-auto grid min-h-[calc(100vh-7rem)] max-w-[1360px] items-stretch gap-6 px-4 pb-6 pt-4 sm:px-6 lg:grid-cols-2">
      <div className="relative hidden overflow-hidden rounded-[2rem] bg-night p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <Cover seed={settings.org_name} className="absolute inset-0 !rounded-none opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-t from-night via-night/70 to-transparent" />
        <p className="display relative text-2xl">{settings.org_name}</p>
        <div className="relative">
          <p className="display text-4xl leading-tight xl:text-5xl">Learn live. Learn deeply. Keep it for good.</p>
          <p className="mt-5 max-w-sm text-white/65">Your courses, books, and live classes in one calm place.</p>
        </div>
      </div>

      <div className="flex items-center justify-center py-8">
        <div className="w-full max-w-md">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
            >
              {mode !== 'forgot' ? (
                <Tabs
                  id="auth-mode"
                  label="Sign in or create an account"
                  value={mode}
                  onChange={(v) => {
                    setMode(v);
                    setError(null);
                  }}
                  items={[
                    { id: 'signin', label: 'Sign in' },
                    { id: 'signup', label: 'Create account' },
                  ]}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setError(null);
                    setInfo(null);
                  }}
                  className="inline-flex items-center gap-2 text-sm text-ink-3 hover:text-ink"
                >
                  <ArrowLeft className="size-4" /> Back to sign in
                </button>
              )}

              <h1 className="display mt-8 text-4xl">{titles[mode]}</h1>
              {mode === 'forgot' && (
                <p className="mt-3 text-sm text-ink-3">
                  Enter your email and we'll generate a reset token for your account.
                </p>
              )}

              <form onSubmit={submit} className="mt-8 space-y-5" noValidate={false}>
                {mode === 'signup' && (
                  <InputField
                    label="Full name"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoComplete="name"
                    placeholder="Ama Mensah"
                  />
                )}
                <InputField
                  label="Email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com"
                />
                {mode !== 'forgot' && (
                  <InputField
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    hint={mode === 'signup' ? 'At least 8 characters.' : undefined}
                    trailing={
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="grid size-9 place-items-center rounded-full text-ink-3 hover:bg-ink/6 hover:text-ink"
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    }
                  />
                )}
                {mode === 'forgot' && resetToken && (
                  <>
                    <InputField label="Reset token" required value={resetToken} onChange={(e) => setResetToken(e.target.value)} />
                    <InputField
                      label="New password"
                      type="password"
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </>
                )}

                {mode === 'signin' && (
                  <div className="-mt-1 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setError(null);
                      }}
                      className="text-sm text-ink-3 underline-offset-4 hover:text-ink hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                {error && (
                  <div role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
                    {error}
                  </div>
                )}
                {info && <div className="rounded-2xl bg-sky px-4 py-3 text-sm text-sky-ink">{info}</div>}

                <Button type="submit" size="lg" className="w-full" loading={loading}>
                  {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : resetToken ? 'Update password' : 'Send reset token'}
                </Button>
              </form>
            </motion.div>
          </AnimatePresence>

          <div className="mt-8 rounded-2xl glass-subtle p-4 border border-line">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono uppercase tracking-wider text-ink-3 font-semibold">
                Instant 1-Click Demo Access
              </span>
              <span className="text-[11px] text-ink-3 font-mono">Password123!</span>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {devAccounts.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  disabled={loading}
                  onClick={() => quickLogin(a.email)}
                  className="group relative flex flex-col items-center justify-center rounded-xl border border-line bg-card/60 p-2.5 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-accent hover:bg-card hover:shadow-soft active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <span className="text-xs font-semibold text-ink group-hover:text-accent transition-colors">
                    {a.label}
                  </span>
                  <span className="text-[10px] text-ink-3 truncate max-w-full mt-0.5">
                    {a.role}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   CHECKOUT
   ============================================================================ */
type PayMethod = 'mtn_momo' | 'telecel_cash' | 'airteltigo_money' | 'card';

const payMethods: Array<{ id: PayMethod; label: string; sub: string; icon: typeof Smartphone }> = [
  { id: 'mtn_momo', label: 'MTN MoMo', sub: 'Mobile Money', icon: Smartphone },
  { id: 'telecel_cash', label: 'Telecel Cash', sub: 'Mobile Money', icon: Smartphone },
  { id: 'airteltigo_money', label: 'AirtelTigo Money', sub: 'Mobile Money', icon: Smartphone },
  { id: 'card', label: 'Card', sub: 'Visa or Mastercard', icon: CreditCard },
];

export const CheckoutPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const productId = searchParams.get('productId') || '';
  const { user, loadingAuth, integrations, notify } = useApp();
  const navigate = useNavigate();

  const [product, setProduct] = useState<Product | null>(null);
  const [provider, setProvider] = useState<'paystack' | 'hubtel'>('paystack');
  const [method, setMethod] = useState<PayMethod>('mtn_momo');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loadingAuth) return;
    if (!user) {
      navigate(`/auth?redirect=${encodeURIComponent(`/checkout?productId=${productId}`)}`, { replace: true });
      return;
    }
    if (!productId) {
      setError('No product selected.');
      setLoading(false);
      return;
    }
    apiRequest<{ product: Product }>(`/api/catalog/products/${productId}`)
      .then((res) => setProduct(res.product))
      .catch((err) => setError(err instanceof Error ? err.message : 'Product not found.'))
      .finally(() => setLoading(false));
  }, [productId, user, loadingAuth, navigate]);

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    setPhoneError(undefined);
    if (method !== 'card' && !/^\+?\d{9,15}$/.test(phone.replace(/[\s-]/g, ''))) {
      setPhoneError('Enter the Mobile Money number that will approve the payment, e.g. 024 400 0000.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiRequest<{ orderId: string; reference: string; authorizationUrl: string; providerLive: boolean }>(
        '/api/payments/checkout',
        {
          method: 'POST',
          body: JSON.stringify({
            productIds: [product.id],
            provider,
            paymentMethod: method,
            customerPhone: method === 'card' ? undefined : phone.replace(/[\s-]/g, ''),
          }),
        }
      );
      if (res.providerLive && res.authorizationUrl.startsWith('http')) {
        window.location.href = res.authorizationUrl;
      } else {
        navigate(`/checkout/result?orderId=${res.orderId}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'We could not start the payment.';
      setError(msg);
      notify({ type: 'error', title: 'Payment not started', message: msg });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto grid max-w-5xl gap-8 px-4 pt-12 sm:px-6 lg:grid-cols-5">
        <Skeleton className="h-96 rounded-3xl lg:col-span-3" />
        <Skeleton className="h-72 rounded-3xl lg:col-span-2" />
      </div>
    );
  }

  if (error && !product) {
    return (
      <div className="mx-auto max-w-xl px-4 pt-16">
        <ErrorState message={error} />
      </div>
    );
  }
  if (!product) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-8 pt-10 sm:px-6">
      <h1 className="display text-4xl sm:text-5xl">Checkout</h1>

      <div className="mt-10 grid items-start gap-8 lg:grid-cols-5">
        <form onSubmit={pay} className="space-y-8 lg:col-span-3">
          <fieldset>
            <legend className="mb-4 text-lg font-semibold">How would you like to pay?</legend>
            <div role="radiogroup" aria-label="Payment method" className="grid gap-3 sm:grid-cols-2">
              {payMethods.map((m) => {
                const active = method === m.id;
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setMethod(m.id)}
                    className={cn(
                      'flex items-center gap-4 rounded-2xl border p-4 text-left transition-all duration-200',
                      active ? 'border-ink bg-card shadow-soft ring-1 ring-ink' : 'border-line-strong bg-card hover:border-ink/50'
                    )}
                  >
                    <span className={cn('grid size-11 place-items-center rounded-xl', active ? 'bg-ink text-on-ink' : 'bg-ink/6 text-ink-2')}>
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{m.label}</span>
                      <span className="block text-xs text-ink-3">{m.sub}</span>
                    </span>
                    <span className={cn('grid size-5 place-items-center rounded-full border transition-colors', active ? 'border-ink bg-ink text-on-ink' : 'border-line-strong')}>
                      {active && <Check className="size-3" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <AnimatePresence initial={false}>
            {method !== 'card' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <InputField
                  label="Mobile Money number"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="024 400 0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  error={phoneError}
                  hint="You'll get a prompt on this number to approve the payment."
                />
              </motion.div>
            )}
          </AnimatePresence>

          <fieldset>
            <legend className="mb-3 text-sm font-medium">Processed by</legend>
            <Tabs
              id="provider"
              label="Payment processor"
              value={provider}
              onChange={setProvider}
              items={[
                { id: 'paystack', label: 'Paystack' },
                { id: 'hubtel', label: 'Hubtel' },
              ]}
            />
            {!(provider === 'paystack' ? integrations.paystackConfigured : integrations.hubtelConfigured) && (
              <p className="mt-3 text-xs text-ink-3">
                This processor isn't connected on this server yet, so the order will be created and wait for payment confirmation.
              </p>
            )}
          </fieldset>

          {error && (
            <div role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}

          <Button type="submit" variant="accent" size="lg" className="w-full" loading={submitting} icon={<Lock className="size-4" />}>
            Pay {formatCurrency(product.price_ghs, product.currency)}
          </Button>
          <p className="text-center text-xs text-ink-3">
            We never see or store your card details or Mobile Money PIN. Access is granted only after the payment is confirmed by the processor.
          </p>
        </form>

        <aside className="lg:sticky lg:top-28 lg:col-span-2">
          <Card padding="none" className="overflow-hidden p-3">
            <Cover seed={product.sku || product.id} className="h-32" />
            <div className="space-y-4 p-4">
              <div>
                <Badge tone="sage" className="capitalize">
                  {product.product_type}
                </Badge>
                <p className="display mt-3 text-xl leading-snug">{product.title}</p>
              </div>
              {product.bundle_items && product.bundle_items.length > 0 && (
                <ul className="space-y-1.5 text-[13px] text-ink-2">
                  {product.bundle_items.map((i) => (
                    <li key={i.id} className="flex gap-2">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" /> {i.title}
                    </li>
                  ))}
                </ul>
              )}
              <dl className="space-y-2 border-t border-line pt-4 text-sm">
                <div className="flex justify-between text-ink-2">
                  <dt>Subtotal</dt>
                  <dd className="tabular-nums">{formatCurrency(product.price_ghs, product.currency)}</dd>
                </div>
                <div className="flex justify-between text-base font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatCurrency(product.price_ghs, product.currency)}</dd>
                </div>
              </dl>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
};

/* ============================================================================
   PAYMENT RESULT (status always comes from the server, never the URL)
   ============================================================================ */
export const CheckoutResultPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId') || '';
  const { notify, refreshAuth } = useApp();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = useCallback(
    async (silent = false) => {
      if (!orderId) return;
      if (!silent) setLoading(true);
      try {
        const res = await apiRequest<{ order: Order }>(`/api/payments/orders/${orderId}`);
        setOrder((prev) => {
          if (prev?.status !== 'paid' && res.order.status === 'paid') refreshAuth();
          return res.order;
        });
      } catch (err) {
        if (!silent) setError(err instanceof Error ? err.message : 'Could not load this order.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [orderId, refreshAuth]
  );

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  useEffect(() => {
    if (order?.status !== 'pending') return;
    let ticks = 0;
    const t = window.setInterval(() => {
      ticks += 1;
      if (ticks > 45) window.clearInterval(t);
      else fetchOrder(true);
    }, 4000);
    return () => window.clearInterval(t);
  }, [order?.status, fetchOrder]);

  const sendTestWebhook = async (outcome: 'success' | 'failed') => {
    if (!order) return;
    setDispatching(true);
    try {
      await apiRequest('/api/payments/sandbox/dispatch-signed-webhook', {
        method: 'POST',
        body: JSON.stringify({ orderId: order.id, outcome }),
      });
      await fetchOrder(true);
      notify({ type: 'info', title: 'Test webhook processed' });
    } catch (err) {
      notify({ type: 'error', title: 'Webhook rejected', message: err instanceof Error ? err.message : undefined });
    } finally {
      setDispatching(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-xl px-4 pt-16">
        <Skeleton className="h-96 rounded-3xl" />
      </div>
    );
  }
  if (error || !order) {
    return (
      <div className="mx-auto max-w-xl px-4 pt-16">
        <ErrorState message={error || 'Order not found.'} onRetry={() => fetchOrder()} />
      </div>
    );
  }

  const paid = order.status === 'paid';
  const pending = order.status === 'pending';
  const refunded = order.status === 'refunded' || order.status === 'partially_refunded';

  const headline = paid
    ? 'Payment confirmed'
    : pending
    ? 'Waiting for your payment'
    : refunded
    ? 'This order was refunded'
    : 'Payment did not go through';
  const sub = paid
    ? 'Your access is unlocked. Enjoy.'
    : pending
    ? 'Approve the prompt on your phone or complete checkout with the processor. This page updates by itself.'
    : refunded
    ? 'Access linked to this order has been removed.'
    : 'You have not been charged for this attempt. You can try again.';

  const steps = [
    { label: 'Order created', done: true },
    { label: 'Payment confirmed by processor', done: paid || refunded },
    { label: 'Access granted', done: paid },
  ];

  return (
    <div className="mx-auto max-w-xl px-4 pb-8 pt-14">
      <Card padding="lg" className="text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 20 }}
          className={cn(
            'mx-auto grid size-20 place-items-center rounded-full',
            paid ? 'bg-success-soft text-success' : pending ? 'bg-warn-soft text-warn' : 'bg-danger-soft text-danger'
          )}
        >
          {paid ? <Check className="size-9" /> : pending ? <RefreshCw className="size-8 animate-spin [animation-duration:2.4s]" /> : <X className="size-9" />}
        </motion.div>
        <h1 className="display mt-6 text-4xl">{headline}</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm text-ink-3">{sub}</p>

        <ol className="mx-auto mt-8 max-w-xs space-y-3 text-left">
          {steps.map((s) => (
            <li key={s.label} className="flex items-center gap-3 text-sm">
              <span className={cn('grid size-6 place-items-center rounded-full', s.done ? 'bg-success text-on-ink' : 'bg-ink/10 text-ink-3')}>
                {s.done ? <Check className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}
              </span>
              <span className={s.done ? 'text-ink' : 'text-ink-3'}>{s.label}</span>
            </li>
          ))}
        </ol>

        <dl className="mt-8 space-y-2.5 rounded-2xl bg-canvas p-5 text-left text-sm">
          <div className="flex justify-between"><dt className="text-ink-3">Order</dt><dd className="font-mono text-[13px]">{order.order_number}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-3">Total</dt><dd className="font-semibold tabular-nums">{formatCurrency(order.total_amount, order.currency)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-3">Processor</dt><dd className="capitalize">{order.payment_provider}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-3">Placed</dt><dd>{formatDateTime(order.created_at)}</dd></div>
        </dl>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {paid && <LinkButton to="/student/learning" size="lg">Start learning</LinkButton>}
          {paid && <LinkButton to="/student/library" size="lg" variant="secondary">Open library</LinkButton>}
          {pending && (
            <Button variant="secondary" onClick={() => fetchOrder()} icon={<RefreshCw className="size-4" />}>
              Check now
            </Button>
          )}
          {(order.status === 'failed' || order.status === 'canceled') && <LinkButton to="/courses" size="lg">Back to courses</LinkButton>}
        </div>
      </Card>

      {import.meta.env.DEV && pending && (
        <Card tone="tint" className="mt-6">
          <p className="text-sm font-medium">Developer sandbox</p>
          <p className="mt-1 text-[13px] text-ink-3">
            Sends a correctly signed test webhook to your own server so you can exercise the confirmation flow without a live processor. No money moves. Disabled in production.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" loading={dispatching} onClick={() => sendTestWebhook('success')}>
              Send success webhook
            </Button>
            <Button size="sm" variant="danger" loading={dispatching} onClick={() => sendTestWebhook('failed')}>
              Send failure webhook
            </Button>
          </div>
        </Card>
      )}
      <p className="mt-6 text-center text-xs text-ink-3">
        Need help? <Link to="/student/account" className="underline underline-offset-4">View your receipts</Link>
      </p>
    </div>
  );
};
