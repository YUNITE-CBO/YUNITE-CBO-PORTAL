import { BANK_ACCOUNT } from '@/lib/bank-account';

/**
 * Official YUNITE PAMOJA bank account + M-PESA deposit instructions.
 *
 * Two presentations:
 *  - default: full card (details + deposit box + thank-you footer)
 *  - compact: slim summary for crowded layouts (hero column, dashboard)
 */
export function BankAccountCard({ compact = false }: { compact?: boolean }) {
  if (compact) return <CompactBankCard />;
  return (
    <div className="card relative overflow-hidden ring-1 ring-brand-green/30 shadow-[0_0_40px_-10px_rgba(34,197,94,0.35)]">
      <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-gradient-to-br from-brand-green/20 to-transparent blur-2xl" />
      <div className="relative">
        <CardHeader />
        <dl className="mt-4 space-y-2.5 text-sm">
          <Detail label="Bank" value={BANK_ACCOUNT.bank} />
          <Detail label="Account name" value={BANK_ACCOUNT.accountName} />
          <Detail label="Account number" value={BANK_ACCOUNT.accountNumber} mono />
        </dl>
        <MpesaBox showNote />
        <p className="mt-4 text-center text-xs leading-relaxed text-white/60">
          Thank you for choosing YUNITE PAMOJA.{' '}
          <span className="text-brand-green-soft">Together, we build. Together, we grow. 💙</span>
        </p>
      </div>
    </div>
  );
}

function CompactBankCard() {
  return (
    <div className="card relative overflow-hidden ring-1 ring-brand-green/30 !p-4">
      <div className="relative">
        <CardHeader />
        <p className="mt-2 text-xs text-white/60">
          {BANK_ACCOUNT.bank} · Acc <span className="font-semibold tabular text-white/85">{BANK_ACCOUNT.accountNumber}</span>
        </p>
        <MpesaBox />
      </div>
    </div>
  );
}

function CardHeader() {
  return (
    <div className="flex items-center gap-2">
      <span className="text-lg">🏦</span>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-white/70">
        Official bank account
      </h2>
      <span className="pill bg-brand-green/15 text-[10px] text-brand-green-soft ring-1 ring-brand-green/30">
        Now open
      </span>
    </div>
  );
}

function MpesaBox({ showNote = false }: { showNote?: boolean }) {
  return (
    <div className="mt-3 rounded-xl border border-brand-green/25 bg-brand-green/[0.08] p-3.5">
      <div className="text-xs font-semibold uppercase tracking-wider text-brand-green-soft">
        💰 Deposit via M-PESA
      </div>
      <div className="mt-2 space-y-1.5 text-sm text-white/85">
        <div className="flex items-center justify-between gap-3">
          <span className="text-white/55">Paybill</span>
          <span className="font-bold tabular text-white">{BANK_ACCOUNT.paybill}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-white/55">Account / reference</span>
          <span className="text-right font-bold tabular text-white">
            {BANK_ACCOUNT.accountNumber}
            <span className="block text-[11px] font-medium text-white/50">
              or reference {BANK_ACCOUNT.reference}
            </span>
          </span>
        </div>
      </div>
      {showNote && (
        <p className="mt-3 text-xs leading-relaxed text-white/55">
          Please use the correct reference when making payments so your
          contribution can be properly identified and recorded.
        </p>
      )}
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-white/50">{label}</dt>
      <dd className={`text-right font-medium text-white ${mono ? 'tabular tracking-wide' : ''}`}>{value}</dd>
    </div>
  );
}
