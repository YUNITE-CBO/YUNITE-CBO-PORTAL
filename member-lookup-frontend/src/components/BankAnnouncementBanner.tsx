import { BANK_ACCOUNT } from '@/lib/bank-account';

/**
 * Slim, full-width floating announcement strip for the official bank account.
 * Sits at the very top of the home page — the first thing every visitor sees —
 * without displacing any other content. Tapping it jumps to the full details
 * card further down the page.
 */
export function BankAnnouncementBanner() {
  return (
    <a
      href="#bank-details"
      className="group mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl border border-brand-green/35 bg-gradient-to-r from-brand-green/15 via-brand-green/10 to-brand-green/15 px-4 py-2.5 text-center text-xs shadow-[0_0_30px_-8px_rgba(34,197,94,0.4)] transition hover:border-brand-green/60 sm:text-sm"
    >
      <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-brand-green-soft">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-green animate-pulse-soft" />
        🏦 Official bank account now open
      </span>
      <span className="text-white/80">
        {BANK_ACCOUNT.bank} · M-PESA Paybill <span className="font-bold tabular text-white">{BANK_ACCOUNT.paybill}</span>
        {' '}· Acc <span className="font-bold tabular text-white">{BANK_ACCOUNT.accountNumber}</span>
      </span>
      <span className="font-semibold text-brand-green-soft transition group-hover:translate-x-0.5">
        Details →
      </span>
    </a>
  );
}
