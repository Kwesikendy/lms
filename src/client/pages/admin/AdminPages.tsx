import React, { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle2,
  Download,
  KeyRound,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Users,
  Wallet,
  ArrowUpRight,
  TrendingUp,
  FileSpreadsheet,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';
import { apiRequest, formatCurrency, formatDateTime } from '../../lib/api.js';
import {
  Badge,
  Button,
  Card,
  Chip,
  InputField,
  SelectField,
  PageSkeleton,
} from '../../components/ui/index.js';
import type { Order, User } from '../../../shared/types.js';

interface AdminOverviewResponse {
  financialSummary: {
    total_revenue_ghs: number;
    refunded_amount_ghs: number;
    paid_orders_count: number;
    pending_orders_count: number;
    failed_orders_count: number;
    refunded_orders_count: number;
  };
  counts: {
    students_count: number;
    instructors_count: number;
    published_courses_count: number;
    published_resources_count: number;
    active_enrollments_count: number;
    live_rooms_count: number;
  };
  users: User[];
  orders: Order[];
  reconciliation: Array<{
    orderId: string;
    orderNumber: string;
    orderStatus: string;
    orderTotal: number;
    provider: string;
    attemptReference: string | null;
    attemptAmount: number;
    reconciled: boolean;
  }>;
  auditLogs: Array<{
    id: string;
    actor_id: string | null;
    actor_name?: string | null;
    actor_role?: string | null;
    action: string;
    target_type: string;
    target_id?: string | null;
    metadata?: string | null;
    created_at: string;
  }>;
  entitlements: Array<{
    id: string;
    user_id: string;
    user_name: string;
    user_email: string;
    target_type: 'course' | 'resource';
    target_id: string;
    target_title: string;
    source: string;
    status: string;
    granted_at: string;
  }>;
}

export const AdminDashboardPage: React.FC = () => {
  const { settings, refreshSettings, integrations, notify } = useApp();
  const [data, setData] = useState<AdminOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    'finance' | 'users' | 'entitlements' | 'settings' | 'audit'
  >('finance');

  // Admin Entitlement Grant State
  const [grantUserId, setGrantUserId] = useState('');
  const [grantTargetType, setGrantTargetType] = useState<'course' | 'resource'>('course');
  const [grantTargetId, setGrantTargetId] = useState('crs_fintech_arch');

  // Configurable Branding State
  const [orgName, setOrgName] = useState(settings.org_name);
  const [orgTagline, setOrgTagline] = useState(settings.org_tagline);
  const [supportEmail, setSupportEmail] = useState(settings.support_email);
  const [currency, setCurrency] = useState(settings.primary_currency);

  const loadAdmin = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<AdminOverviewResponse>('/api/admin/overview');
      setData(res);
      if (!grantUserId && res.users.length > 0) {
        setGrantUserId(res.users[0].id);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [grantUserId]);

  useEffect(() => {
    loadAdmin();
  }, [loadAdmin]);

  useEffect(() => {
    setOrgName(settings.org_name);
    setOrgTagline(settings.org_tagline);
    setSupportEmail(settings.support_email);
    setCurrency(settings.primary_currency);
  }, [settings]);

  const handleUpdateUser = async (
    userId: string,
    updates: { role?: User['role']; status?: User['status'] }
  ) => {
    try {
      await apiRequest(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      notify({ type: 'success', title: 'User Record Updated' });
      await loadAdmin();
    } catch (err) {
      notify({
        type: 'error',
        title: 'Update Failed',
        message: err instanceof Error ? err.message : 'Unable to update user.',
      });
    }
  };

  const handleRefundOrder = async (orderId: string) => {
    try {
      await apiRequest(`/api/admin/orders/${orderId}/refund`, {
        method: 'POST',
        body: JSON.stringify({
          reason: 'Administrative refund and entitlement revocation',
        }),
      });
      notify({
        type: 'info',
        title: 'Order Refunded & Entitlements Revoked',
        message: 'Transaction status updated and logged in audit trail.',
      });
      await loadAdmin();
    } catch (err) {
      notify({
        type: 'error',
        title: 'Refund Error',
        message: err instanceof Error ? err.message : 'Unable to process refund.',
      });
    }
  };

  const handleGrantEntitlement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/admin/entitlements/grant', {
        method: 'POST',
        body: JSON.stringify({
          userId: grantUserId,
          targetType: grantTargetType,
          targetId: grantTargetId,
        }),
      });
      notify({
        type: 'success',
        title: 'Entitlement Granted',
        message: 'Access record created and logged.',
      });
      await loadAdmin();
    } catch (err) {
      notify({
        type: 'error',
        title: 'Grant Failed',
        message: err instanceof Error ? err.message : 'Unable to grant access.',
      });
    }
  };

  const handleRevokeEntitlement = async (entId: string) => {
    try {
      await apiRequest(`/api/admin/entitlements/${entId}/revoke`, {
        method: 'POST',
      });
      notify({ type: 'info', title: 'Entitlement Revoked' });
      await loadAdmin();
    } catch (err) {
      notify({
        type: 'error',
        title: 'Revocation Error',
        message: err instanceof Error ? err.message : 'Failed to revoke.',
      });
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          org_name: orgName,
          org_tagline: orgTagline,
          support_email: supportEmail,
          primary_currency: currency,
        }),
      });
      await refreshSettings();
      await loadAdmin();
      notify({
        type: 'success',
        title: 'Organization Settings Updated',
        message: 'Branding and platform configuration persisted.',
      });
    } catch (err) {
      notify({
        type: 'error',
        title: 'Settings Error',
        message: err instanceof Error ? err.message : 'Unable to save settings.',
      });
    }
  };

  const handleExportCsv = () => {
    if (!data) return;
    const header = 'OrderNumber,Status,Provider,TotalGHS,AttemptRef,Reconciled\n';
    const rows = data.reconciliation
      .map(
        (r) =>
          `${r.orderNumber},${r.orderStatus},${r.provider},${r.orderTotal},${
            r.attemptReference || ''
          },${r.reconciled}`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lms-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading || !data) {
    return (
      <div className="p-6 lg:p-10 max-w-7xl mx-auto">
        <PageSkeleton />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8">
      {/* Editorial Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-accent font-semibold">
            Platform Governance & Settlements
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl text-ink font-bold tracking-tight mt-1">
            Administrator Console
          </h1>
          <p className="text-sm text-ink-3 mt-1">
            Reconcile payments, manage user credentials, audit enrollments, and configure organization branding.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCsv}
            icon={<Download className="size-4" />}
          >
            Export Ledger CSV
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadAdmin}
            icon={<RefreshCw className="size-4" />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card tone="plain" padding="sm" className="space-y-1">
          <p className="text-[11px] font-mono uppercase tracking-wider text-ink-3">Verified Revenue</p>
          <p className="font-serif text-xl sm:text-2xl text-ink font-bold">
            {formatCurrency(data.financialSummary.total_revenue_ghs, 'GHS')}
          </p>
        </Card>
        <Card tone="plain" padding="sm" className="space-y-1">
          <p className="text-[11px] font-mono uppercase tracking-wider text-ink-3">Paid Orders</p>
          <p className="font-serif text-xl sm:text-2xl text-ink font-bold">
            {data.financialSummary.paid_orders_count}
          </p>
        </Card>
        <Card tone="plain" padding="sm" className="space-y-1">
          <p className="text-[11px] font-mono uppercase tracking-wider text-ink-3">Refunded Total</p>
          <p className="font-serif text-xl sm:text-2xl text-accent font-bold">
            {formatCurrency(data.financialSummary.refunded_amount_ghs, 'GHS')}
          </p>
        </Card>
        <Card tone="plain" padding="sm" className="space-y-1">
          <p className="text-[11px] font-mono uppercase tracking-wider text-ink-3">Active Learners</p>
          <p className="font-serif text-xl sm:text-2xl text-ink font-bold">
            {data.counts.active_enrollments_count}
          </p>
        </Card>
        <Card tone="plain" padding="sm" className="space-y-1">
          <p className="text-[11px] font-mono uppercase tracking-wider text-ink-3">Published Courses</p>
          <p className="font-serif text-xl sm:text-2xl text-ink font-bold">
            {data.counts.published_courses_count}
          </p>
        </Card>
        <Card tone="plain" padding="sm" className="space-y-1">
          <p className="text-[11px] font-mono uppercase tracking-wider text-ink-3">Live Classrooms</p>
          <p className="font-serif text-xl sm:text-2xl text-ink font-bold">
            {data.counts.live_rooms_count}
          </p>
        </Card>
      </div>

      {/* Integration Status Bar */}
      <Card tone="flat" padding="sm" className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className="font-mono uppercase tracking-wider text-ink-3 font-medium">
          Provider Integrations:
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={integrations.livekitConfigured ? 'success' : 'warn'} dot>
            LiveKit SFU: {integrations.livekitConfigured ? 'Connected' : 'Token Ready (.env)'}
          </Badge>
          <Badge tone={integrations.paystackConfigured ? 'success' : 'warn'} dot>
            Paystack: {integrations.paystackConfigured ? 'Live Keys' : 'Webhook Active'}
          </Badge>
          <Badge tone={integrations.hubtelConfigured ? 'success' : 'warn'} dot>
            Hubtel Mobile Money: {integrations.hubtelConfigured ? 'Live Keys' : 'Webhook Active'}
          </Badge>
        </div>
      </Card>

      {/* Navigation Chips */}
      <div className="flex flex-wrap gap-2">
        <Chip active={activeTab === 'finance'} onClick={() => setActiveTab('finance')}>
          <Wallet className="size-3.5 inline mr-1.5 opacity-70" />
          Orders & Reconciliation ({data.orders.length})
        </Chip>
        <Chip active={activeTab === 'users'} onClick={() => setActiveTab('users')}>
          <Users className="size-3.5 inline mr-1.5 opacity-70" />
          Users & Instructors ({data.users.length})
        </Chip>
        <Chip active={activeTab === 'entitlements'} onClick={() => setActiveTab('entitlements')}>
          <KeyRound className="size-3.5 inline mr-1.5 opacity-70" />
          Entitlements ({data.entitlements.length})
        </Chip>
        <Chip active={activeTab === 'settings'} onClick={() => setActiveTab('settings')}>
          <Settings className="size-3.5 inline mr-1.5 opacity-70" />
          Branding & Settings
        </Chip>
        <Chip active={activeTab === 'audit'} onClick={() => setActiveTab('audit')}>
          <ShieldCheck className="size-3.5 inline mr-1.5 opacity-70" />
          Security Audit Trail ({data.auditLogs.length})
        </Chip>
      </div>

      {/* Tab 1: Orders & Payment Reconciliation */}
      {activeTab === 'finance' && (
        <Card tone="plain" padding="md" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-serif text-lg font-bold text-ink">
                Settled Orders & Webhook Reconciliation
              </h2>
              <p className="text-xs text-ink-3 mt-0.5">
                Every transaction verified against Paystack/Hubtel cryptographic HMAC payloads.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-line text-ink-3 font-mono text-[11px] uppercase tracking-wider">
                  <th className="py-3 pr-4">Order #</th>
                  <th className="py-3 pr-4">Learner</th>
                  <th className="py-3 pr-4">Provider</th>
                  <th className="py-3 pr-4">Total</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Reconciliation</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.orders.map((o) => {
                  const rec = data.reconciliation.find((r) => r.orderId === o.id);
                  return (
                    <tr key={o.id} className="hover:bg-canvas/50 transition-colors">
                      <td className="py-3 pr-4 font-mono font-medium text-ink">{o.order_number}</td>
                      <td className="py-3 pr-4">
                        <div className="font-medium text-ink">{o.user_name}</div>
                        <div className="text-[11px] text-ink-3">{o.user_email}</div>
                      </td>
                      <td className="py-3 pr-4 uppercase font-mono text-ink-2">{o.payment_provider}</td>
                      <td className="py-3 pr-4 font-mono font-semibold text-ink">
                        {formatCurrency(o.total_amount, o.currency)}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge
                          tone={
                            o.status === 'paid'
                              ? 'success'
                              : o.status === 'pending'
                              ? 'warn'
                              : 'danger'
                          }
                          dot
                        >
                          {o.status.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4">
                        {rec?.reconciled ? (
                          <span className="text-success font-medium inline-flex items-center gap-1.5">
                            <CheckCircle2 className="size-3.5" /> Matched
                          </span>
                        ) : (
                          <span className="text-accent font-medium inline-flex items-center gap-1.5">
                            <ShieldAlert className="size-3.5" /> Pending
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {o.status === 'paid' && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleRefundOrder(o.id)}
                            icon={<RotateCcw className="size-3.5" />}
                          >
                            Refund
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 2: Users & Permissions */}
      {activeTab === 'users' && (
        <Card tone="plain" padding="md" className="space-y-4">
          <div>
            <h2 className="font-serif text-lg font-bold text-ink">
              User Roster & Access Levels
            </h2>
            <p className="text-xs text-ink-3 mt-0.5">
              Promote instructors, administer staff access, or suspend compromised learner accounts.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-line text-ink-3 font-mono text-[11px] uppercase tracking-wider">
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4">Email</th>
                  <th className="py-3 pr-4">Role</th>
                  <th className="py-3 pr-4">Account Status</th>
                  <th className="py-3 text-right">Update Permissions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.users.map((u) => (
                  <tr key={u.id} className="hover:bg-canvas/50 transition-colors">
                    <td className="py-3 pr-4 font-medium text-ink">{u.full_name}</td>
                    <td className="py-3 pr-4 font-mono text-ink-3">{u.email}</td>
                    <td className="py-3 pr-4">
                      <Badge
                        tone={
                          u.role === 'admin'
                            ? 'accent'
                            : u.role === 'instructor'
                            ? 'sage'
                            : 'neutral'
                        }
                      >
                        {u.role.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={u.status === 'active' ? 'success' : 'danger'} dot>
                        {u.status.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <select
                          aria-label={`Role for ${u.full_name}`}
                          value={u.role}
                          onChange={(e) =>
                            handleUpdateUser(u.id, {
                              role: e.target.value as User['role'],
                            })
                          }
                          className="h-8 px-2.5 rounded-xl border border-line bg-canvas text-xs text-ink focus:outline-none focus:border-ink"
                        >
                          <option value="student">Student</option>
                          <option value="instructor">Instructor</option>
                          <option value="admin">Admin</option>
                        </select>
                        <Button
                          variant={u.status === 'active' ? 'danger' : 'secondary'}
                          size="sm"
                          onClick={() =>
                            handleUpdateUser(u.id, {
                              status: u.status === 'active' ? 'suspended' : 'active',
                            })
                          }
                        >
                          {u.status === 'active' ? 'Suspend' : 'Activate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 3: Entitlements Management */}
      {activeTab === 'entitlements' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form onSubmit={handleGrantEntitlement} className="lg:col-span-4">
            <Card tone="plain" padding="md" className="space-y-4">
              <h2 className="font-serif text-lg font-bold text-ink">
                Grant Direct Access
              </h2>
              <p className="text-xs text-ink-3">
                Manually provision course or resource access without a checkout transaction.
              </p>
              <SelectField
                label="Select Learner"
                value={grantUserId}
                onChange={(e) => setGrantUserId(e.target.value)}
                options={data.users.map((u) => ({
                  value: u.id,
                  label: `${u.full_name} (${u.email})`,
                }))}
              />
              <SelectField
                label="Target Content"
                value={grantTargetType}
                onChange={(e) =>
                  setGrantTargetType(e.target.value as 'course' | 'resource')
                }
                options={[
                  { value: 'course', label: 'Course' },
                  { value: 'resource', label: 'Resource' },
                ]}
              />
              <InputField
                label="Target Identifier"
                required
                value={grantTargetId}
                onChange={(e) => setGrantTargetId(e.target.value)}
                hint="e.g. crs_fintech_arch, crs_glass_ui, res_fintech_handbook"
              />
              <Button type="submit" variant="accent" size="sm" className="w-full">
                Grant Access Entitlement
              </Button>
            </Card>
          </form>

          <div className="lg:col-span-8">
            <Card tone="plain" padding="md" className="space-y-4">
              <h2 className="font-serif text-lg font-bold text-ink">
                Granted Entitlements Ledger
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-line text-ink-3 font-mono text-[11px] uppercase tracking-wider">
                      <th className="py-2.5 pr-3">Learner</th>
                      <th className="py-2.5 pr-3">Target</th>
                      <th className="py-2.5 pr-3">Source</th>
                      <th className="py-2.5 pr-3">Status</th>
                      <th className="py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.entitlements.map((e) => (
                      <tr key={e.id} className="hover:bg-canvas/50 transition-colors">
                        <td className="py-2.5 pr-3 font-medium text-ink">{e.user_name}</td>
                        <td className="py-2.5 pr-3 text-ink-2">
                          {e.target_title || e.target_id}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-ink-3 uppercase">{e.source}</td>
                        <td className="py-2.5 pr-3">
                          <Badge tone={e.status === 'active' ? 'success' : 'danger'} dot>
                            {e.status.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="py-2.5 text-right">
                          {e.status === 'active' && (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleRevokeEntitlement(e.id)}
                            >
                              Revoke
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Tab 4: Platform Branding & Organization Settings */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="max-w-xl">
          <Card tone="plain" padding="md" className="space-y-4">
            <div>
              <h2 className="font-serif text-lg font-bold text-ink">
                Organization Branding & Settings
              </h2>
              <p className="text-xs text-ink-3 mt-0.5">
                Configure your training academy name, currency, and customer support channels.
              </p>
            </div>
            <InputField
              label="Academy Name"
              required
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />
            <InputField
              label="Tagline / Motto"
              required
              value={orgTagline}
              onChange={(e) => setOrgTagline(e.target.value)}
            />
            <InputField
              label="Support Email"
              type="email"
              required
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
            />
            <SelectField
              label="Primary Settlement Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              options={[
                { value: 'GHS', label: 'GHS — Ghanaian Cedi' },
                { value: 'USD', label: 'USD — US Dollar' },
                { value: 'EUR', label: 'EUR — Euro' },
                { value: 'GBP', label: 'GBP — British Pound' },
              ]}
            />
            <Button type="submit" variant="primary" size="md">
              Save Platform Configuration
            </Button>
          </Card>
        </form>
      )}

      {/* Tab 5: Security Audit Trail */}
      {activeTab === 'audit' && (
        <Card tone="plain" padding="md" className="space-y-4">
          <div>
            <h2 className="font-serif text-lg font-bold text-ink">
              Security & Audit Trail
            </h2>
            <p className="text-xs text-ink-3 mt-0.5">
              Immutable logging of administrative actions, role modifications, and entitlement grants.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-line text-ink-3 font-mono text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 pr-4">Timestamp</th>
                  <th className="py-2.5 pr-4">Actor</th>
                  <th className="py-2.5 pr-4">Action</th>
                  <th className="py-2.5 pr-4">Target</th>
                  <th className="py-2.5">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-canvas/50 transition-colors">
                    <td className="py-2.5 pr-4 font-mono text-ink-3">
                      {formatDateTime(log.created_at)}
                    </td>
                    <td className="py-2.5 pr-4 text-ink font-medium">
                      {log.actor_name || log.actor_id || 'system'}{' '}
                      <span className="text-[10px] font-mono text-ink-3">
                        ({log.actor_role || 'sys'})
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 font-mono font-medium text-accent">{log.action}</td>
                    <td className="py-2.5 pr-4 font-mono text-ink-2">
                      {log.target_type}:{log.target_id || '—'}
                    </td>
                    <td className="py-2.5 font-mono text-[11px] text-ink-3 truncate max-w-xs">
                      {log.metadata || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};
