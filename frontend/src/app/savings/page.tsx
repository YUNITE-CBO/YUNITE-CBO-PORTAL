"use client";

import { motion } from "framer-motion";
import { Plus, Download, MoreHorizontal, PiggyBank, Search } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { Button, IconButton } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StatusBadge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/Card";

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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-0">Savings Accounts</h1>
          <p className="text-sm text-neutral-500 mt-1">Manage member savings accounts</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4" />
            Export
          </Button>
          <Button size="sm">
            <Plus className="w-4 h-4" />
            New Account
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Total Accounts" 
          value="156"
          icon={<PiggyBank className="w-5 h-5 text-white" />}
          iconColor="bg-blue-500"
        />
        <StatCard 
          title="Total Balance" 
          value={formatCurrency(45200000)}
          icon={<PiggyBank className="w-5 h-5 text-white" />}
          iconColor="bg-primary-500"
        />
        <StatCard 
          title="Active Accounts" 
          value="134"
          icon={<PiggyBank className="w-5 h-5 text-white" />}
          iconColor="bg-violet-500"
        />
        <StatCard 
          title="Avg Balance" 
          value={formatCurrency(289744)}
          icon={<PiggyBank className="w-5 h-5 text-white" />}
          iconColor="bg-amber-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Account</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Member</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Type</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Balance</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Rate</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Status</th>
                <th className="w-10 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {accounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors">
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
                      <MoreHorizontal className="w-4 h-4" />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
