"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Users,
  UserCheck,
  UserPlus,
  PiggyBank,
  CircleDollarSign,
  HandCoins,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Building2,
  Calendar,
  Bell,
  CheckSquare,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  FileBarChart,
  Download,
  MoreHorizontal,
  Wallet,
  CreditCard,
  Percent,
  BarChart3,
  Shield,
  Cpu,
} from "lucide-react";
import { cn, formatCurrency, formatNumber, formatDate } from "@/lib/utils";

// Stat Card Component
function StatCard({
  title,
  value,
  change,
  icon: Icon,
  color,
  subtitle,
}: {
  title: string;
  value: string;
  change?: { value: string; positive: boolean };
  icon: any;
  color: string;
  subtitle?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5 hover:shadow-lg transition-shadow"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
          {change && (
            <div className="flex items-center gap-1">
              {change.positive ? (
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-red-500" />
              )}
              <span className={cn("text-xs font-medium", change.positive ? "text-emerald-600" : "text-red-600")}>
                {change.value}
              </span>
              {subtitle && <span className="text-xs text-slate-400">{subtitle}</span>}
            </div>
          )}
        </div>
        <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", color)}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </motion.div>
  );
}

// Chart placeholder
function ChartPlaceholder({ title, height = "h-64" }: { title: string; height?: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
        <button className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
      <div className={cn("bg-slate-50 dark:bg-slate-800/50 rounded-lg flex items-center justify-center", height)}>
        <BarChart3 className="w-8 h-8 text-slate-300 dark:text-slate-600" />
      </div>
    </div>
  );
}

// Activity Item
function ActivityItem({ icon: Icon, title, description, time, color }: any) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", color)}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-white">{title}</p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      <span className="text-xs text-slate-400 flex-shrink-0">{time}</span>
    </div>
  );
}

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState("today");

  const stats = [
    { title: "Total Members", value: formatNumber(1250), change: { value: "+12%", positive: true }, icon: Users, color: "bg-blue-500", subtitle: "vs last month" },
    { title: "Active Members", value: formatNumber(1080), change: { value: "+8%", positive: true }, icon: UserCheck, color: "bg-emerald-500", subtitle: "86% active rate" },
    { title: "Savings Balance", value: formatCurrency(45200000), change: { value: "+15%", positive: true }, icon: PiggyBank, color: "bg-violet-500", subtitle: "vs last month" },
    { title: "Shares Value", value: formatCurrency(12800000), change: { value: "+5%", positive: true }, icon: CircleDollarSign, color: "bg-indigo-500", subtitle: "vs last month" },
    { title: "Loan Portfolio", value: formatCurrency(38500000), change: { value: "+18%", positive: true }, icon: HandCoins, color: "bg-amber-500", subtitle: "vs last month" },
    { title: "Outstanding Loans", value: formatCurrency(22400000), change: { value: "-3%", positive: false }, icon: Wallet, color: "bg-rose-500", subtitle: "58% disbursed" },
    { title: "Overdue Loans", value: formatCurrency(3200000), change: { value: "+2%", positive: false }, icon: AlertTriangle, color: "bg-red-500", subtitle: "8.3% overdue rate" },
    { title: "Revenue (MTD)", value: formatCurrency(1850000), change: { value: "+22%", positive: true }, icon: DollarSign, color: "bg-emerald-600", subtitle: "vs last month" },
    { title: "Net Income (MTD)", value: formatCurrency(920000), change: { value: "+18%", positive: true }, icon: TrendingUp, color: "bg-cyan-500", subtitle: "49.7% margin" },
    { title: "Cash Position", value: formatCurrency(15600000), change: { value: "+7%", positive: true }, icon: Building2, color: "bg-sky-500", subtitle: "current balance" },
  ];

  const healthScores = [
    { label: "Organization Health", score: 87, color: "bg-emerald-500" },
    { label: "Financial Health", score: 74, color: "bg-amber-500" },
    { label: "Data Quality", score: 92, color: "bg-emerald-500" },
    { label: "System Health", score: 98, color: "bg-emerald-500" },
  ];

  const recentTransactions = [
    { ref: "TXN-2024-001", member: "John Kamau", type: "Savings Deposit", amount: 25000, status: "completed", date: "2m ago" },
    { ref: "TXN-2024-002", member: "Mary Wanjiku", type: "Loan Disbursement", amount: 150000, status: "completed", date: "15m ago" },
    { ref: "TXN-2024-003", member: "Peter Ochieng", type: "Share Purchase", amount: 50000, status: "pending", date: "1h ago" },
    { ref: "TXN-2024-004", member: "Grace Muthoni", type: "Loan Repayment", amount: 12500, status: "completed", date: "2h ago" },
    { ref: "TXN-2024-005", member: "David Kiprop", type: "Withdrawal", amount: 10000, status: "failed", date: "3h ago" },
  ];

  const activities = [
    { icon: UserPlus, title: "New Member Registered", description: "Sarah Chebet joined YUNITE SACCO", time: "5m ago", color: "bg-emerald-500" },
    { icon: HandCoins, title: "Loan Approved", description: "KES 200,000 loan approved for James Kariuki", time: "12m ago", color: "bg-blue-500" },
    { icon: PiggyBank, title: "Savings Deposit", description: "KES 35,000 deposited by Grace Akinyi", time: "25m ago", color: "bg-violet-500" },
    { icon: CheckSquare, title: "Meeting Completed", description: "Board meeting #45 finalized", time: "1h ago", color: "bg-amber-500" },
    { icon: AlertTriangle, title: "Fraud Alert", description: "Suspicious transaction detected - Account #8901", time: "2h ago", color: "bg-red-500" },
    { icon: Cpu, title: "AI Analysis Complete", description: "Monthly financial analysis generated", time: "3h ago", color: "bg-cyan-500" },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Executive Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Welcome back! Here's your organization overview</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">
            <Download className="w-4 h-4" />
            Export
          </button>
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium">
            <FileBarChart className="w-4 h-4" />
            Generate Report
          </button>
        </div>
      </div>

      {/* Health Scores */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {healthScores.map((score) => (
          <div key={score.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500">{score.label}</p>
              <Activity className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="flex items-end justify-between">
              <span className="text-xl font-bold text-slate-900 dark:text-white">{score.score}%</span>
              <div className="w-16 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div className={cn("h-full rounded-full transition-all", score.color)} style={{ width: `${score.score}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <StatCard {...stat} />
          </motion.div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartPlaceholder title="Revenue vs Expenses" height="h-72" />
        <ChartPlaceholder title="Loan Portfolio Overview" height="h-72" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ChartPlaceholder title="Member Growth" height="h-64" />
        <ChartPlaceholder title="Savings vs Loans" height="h-64" />
        <ChartPlaceholder title="Cash Flow" height="h-64" />
      </div>

      {/* Bottom Row: Transactions + Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Transactions */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Recent Transactions</h3>
            <button className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">View All</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="text-left py-2 px-2 text-xs font-medium text-slate-400">Ref</th>
                  <th className="text-left py-2 px-2 text-xs font-medium text-slate-400">Member</th>
                  <th className="text-left py-2 px-2 text-xs font-medium text-slate-400">Type</th>
                  <th className="text-right py-2 px-2 text-xs font-medium text-slate-400">Amount</th>
                  <th className="text-right py-2 px-2 text-xs font-medium text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.map((tx) => (
                  <tr key={tx.ref} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="py-2.5 px-2 text-xs text-slate-500">{tx.ref}</td>
                    <td className="py-2.5 px-2 text-sm font-medium text-slate-700 dark:text-slate-300">{tx.member}</td>
                    <td className="py-2.5 px-2 text-xs text-slate-500">{tx.type}</td>
                    <td className="py-2.5 px-2 text-right text-sm font-medium text-slate-900 dark:text-white">{formatCurrency(tx.amount)}</td>
                    <td className="py-2.5 px-2 text-right">
                      <span className={cn(
                        "inline-flex px-2 py-0.5 text-xs font-medium rounded-full",
                        tx.status === "completed" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                        tx.status === "pending" && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                        tx.status === "failed" && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                      )}>
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Activities */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Recent Activities</h3>
            <button className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">View All</button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {activities.map((activity, i) => (
              <ActivityItem key={i} {...activity} />
            ))}
          </div>
        </div>
      </div>

      {/* KPIs Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Pending Approvals", value: "12", icon: CheckSquare, color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-900/30" },
          { label: "Active Projects", value: "5", icon: Building2, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/30" },
          { label: "Upcoming Meetings", value: "3", icon: Calendar, color: "text-violet-600", bg: "bg-violet-100 dark:bg-violet-900/30" },
          { label: "Unread Notifications", value: "8", icon: Bell, color: "text-rose-600", bg: "bg-rose-100 dark:bg-rose-900/30" },
        ].map((kpi) => (
          <div key={kpi.label} className="flex items-center gap-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", kpi.bg)}>
              <kpi.icon className={cn("w-5 h-5", kpi.color)} />
            </div>
            <div>
              <p className="text-xs text-slate-500">{kpi.label}</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}