"use client";

import { motion } from "framer-motion";
import { Plus, Download, MoreHorizontal, PiggyBank, ShieldCheck, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Button, IconButton } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { StatCard, Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";

const accounts = [
  { id: "1", accountNumber: "SAV-001", member: "John Kamau", type: "regular", balance: 450000, interestRate: 4.5, status: "active", openedDate: "2023-01-15" },
  { id: "2", accountNumber: "SAV-002", member: "Mary Wanjiku", type: "fixed", balance: 780000, interestRate: 6.0, status: "active", openedDate: "2022-06-20" },
  { id: "3", accountNumber: "SAV-003", member: "Peter Ochieng", type: "target", balance: 120000, interestRate: 5.0, status: "frozen", openedDate: "2023-03-10" },
  { id: "4", accountNumber: "SAV-004", member: "Grace Muthoni", type: "education", balance: 250000, interestRate: 5.5, status: "active", openedDate: "2024-02-01" },
  { id: "5", accountNumber: "SAV-005", member: "David Kiprop", type: "regular", balance: 1500000, interestRate: 4.5, status: "active", openedDate: "2021-09-05" },
  { id: "6", accountNumber: "SAV-006", member: "Sarah Chebet", type: "emergency", balance: 50000, interestRate: 3.5, status: "dormant", openedDate: "2024-06-12" },
];

export default function SavingsPage() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-0">Savings Accounts</h1>
          <p className="mt-1 text-sm text-neutral-500">Manage member savings accounts with a cleaner, more focused view</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button size="sm">
            <Plus className="h-4 w-4" />
            New Account
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-2">
          <StatCard 
            title="Total Accounts" 
            value="156"
            icon={<PiggyBank className="h-5 w-5 text-white" />}
            iconColor="bg-blue-500"
          />
          <StatCard 
            title="Total Balance" 
            value={formatCurrency(45200000)}
            icon={<PiggyBank className="h-5 w-5 text-white" />}
            iconColor="bg-primary-500"
          />
          <StatCard 
            title="Active Accounts" 
            value="134"
            icon={<ShieldCheck className="h-5 w-5 text-white" />}
            iconColor="bg-violet-500"
          />
          <StatCard 
            title="Avg Balance" 
            value={formatCurrency(289744)}
            icon={<TrendingUp className="h-5 w-5 text-white" />}
            iconColor="bg-amber-500"
          />
        </div>

        <Card padding="lg" className="bg-gradient-to-br from-primary-50 to-white dark:from-primary-950/20 dark:to-neutral-900">
          <CardHeader>
            <div>
              <CardTitle>Portfolio health</CardTitle>
              <CardDescription>Operational overview for savings performance</CardDescription>
            </div>
          </CardHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-neutral-200/80 bg-white/70 px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-900/60">
              <span className="text-sm text-neutral-600 dark:text-neutral-400">Liquidity readiness</span>
              <span className="text-sm font-semibold text-primary-700 dark:text-primary-400">98%</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-neutral-200/80 bg-white/70 px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-900/60">
              <span className="text-sm text-neutral-600 dark:text-neutral-400">Interest compliance</span>
              <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-0">On track</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-neutral-200/80 bg-white/70 px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-900/60">
              <span className="text-sm text-neutral-600 dark:text-neutral-400">Review window</span>
              <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-0">Next 24h</span>
            </div>
          </div>
        </Card>
      </div>

      <Card padding="none" className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-neutral-200/80 px-5 py-4 dark:border-neutral-800">
          <div>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-0">Account register</h2>
            <p className="text-sm text-neutral-500">All member savings accounts and current states</p>
          </div>
          <div className="rounded-full bg-primary-50 px-3 py-1 text-sm font-medium text-primary-700 dark:bg-primary-900/20 dark:text-primary-400">
            {accounts.length} records
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0">
            <thead className="bg-neutral-50/90 backdrop-blur dark:bg-neutral-900/90">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Account</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Member</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Type</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Balance</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Rate</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Status</th>
                <th className="w-10 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc.id} className="transition-colors hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40">
                  <td className="px-4 py-3 text-sm font-medium text-neutral-900 dark:text-neutral-0">{acc.accountNumber}</td>
                  <td className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400">{acc.member}</td>
                  <td className="px-4 py-3 text-sm capitalize text-neutral-700 dark:text-neutral-300">{acc.type}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-neutral-900 dark:text-neutral-0">{formatCurrency(acc.balance)}</td>
                  <td className="px-4 py-3 text-right text-sm text-neutral-600 dark:text-neutral-400">{acc.interestRate}%</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={acc.status as any} size="sm" />
                  </td>
                  <td className="px-4 py-3">
                    <IconButton variant="ghost" size="sm" aria-label="More options">
                      <MoreHorizontal className="h-4 w-4" />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </motion.div>
  );
}
