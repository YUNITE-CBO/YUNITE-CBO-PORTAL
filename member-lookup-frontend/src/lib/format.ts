/** Display helpers (currency, dates, status pills). No business logic. */

export function formatMoney(amount: number | null | undefined, currency = 'KES'): string {
  const n = Number(amount || 0);
  return `${currency} ${n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return value;
  }
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return value;
  }
}

export function statusClass(status?: string | null): string {
  switch ((status || '').toLowerCase()) {
    case 'active':
    case 'disbursed':
    case 'approved':
      return 'status-active';
    case 'pending':
      return 'status-pending';
    case 'suspended':
    case 'defaulted':
      return 'status-suspended';
    case 'completed':
      return 'status-completed';
    default:
      return 'status-pending';
  }
}

export function transactionLabel(type: string): string {
  return type.replace(/_/g, ' ');
}
