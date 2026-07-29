"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Search, Filter, Download, MoreHorizontal, PiggyBank } from "lucide-react";
import { cn, formatCurrency, getStatusColor } from "@/lib/utils";

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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Savings Accounts</h1>
          <p className="text-sm text-slate-500 mt-1">Manage member savings accounts</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">
            <Download className="w-4 h-4" />
            Export
          </button>
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium">
            <Plus className="w-4 h-4" />
            New Account
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Accounts", value: "156", color: "bg-blue-500" },
          { label: "Total Balance", value: formatCurrency(45200000), color: "bg-emerald-500" },
          { label: "Active Accounts", value: "134", color: "bg-violet-500" },
          { label: "Avg Balance", value: formatCurrency(289744), color: "bg-amber-500" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-xs text-slate-500 mb-1">{stat.label}</p>
            <p className="text-xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Account</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Member</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Type</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Balance</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Rate</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                <th className="w-12 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {accounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">{acc.accountNumber}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{acc.member}</td>
                  <td className="px-4 py-3 text-sm capitalize text-slate-700 dark:text-slate-300">{acc.type}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-slate-900 dark:text-white">{formatCurrency(acc.balance)}</td>
                  <td className="px-4 py-3 text-right text-sm text-slate-600 dark:text-slate-400">{acc.interestRate}%</td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex px-2 py-0.5 text-xs font-medium rounded-full border", getStatusColor(acc.status))}>{acc.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
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