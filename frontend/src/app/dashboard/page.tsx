"use client";

import { motion } from "framer-motion";
import {
  Users,
  UserCheck,
  PiggyBank,
  CircleDollarSign,
  HandCoins,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Building2,
  Calendar,
  Bell,
  CheckSquare,
  Activity,
  FileBarChart,
  Download,
  MoreHorizontal,
  Wallet,
  BarChart3,
  Cpu,
  ArrowRight,
} from "lucide-react";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/Card";

// Animation variants
const fadeInUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
};

// Health Score Card
function HealthScoreCard({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-neutral-200/80 bg-white/90 p-4 shadow-sm transition-all duration-200 hover:border-neutral-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900/90"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">{label}</p>
        <Activity className="h-4 w-4 text-neutral-300 dark:text-neutral-600" />
      </div>
      <div className="flex items-end justify-between">
        <span className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-0">{score}%</span>
        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
            transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
            className={cn("h-full rounded-full", color)} 
          />
        </div>
      </div>
    </motion.div>
  );
}

// Chart Placeholder
function ChartCard({ title }: { title: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border border-neutral-200/80 bg-white/90 p-5 shadow-sm transition-all duration-200 hover:border-neutral-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900/90"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-0">{title}</h3>
        <Button variant="ghost" size="sm">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-gradient-to-br from-neutral-50 to-neutral-100 dark:border-neutral-700/60 dark:from-neutral-800/50 dark:to-neutral-800/30">
        <div className="text-center">
          <BarChart3 className="mx-auto mb-2 h-8 w-8 text-neutral-300 dark:text-neutral-600" />
          <p className="text-xs text-neutral-400 dark:text-neutral-500">Chart Preview</p>
        </div>
      </div>
    </motion.div>
  );
}

// Activity Item
function ActivityItem({ icon: Icon, title, description, time, color }: any) {
  return (
    <motion.div 
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-4 py-4 first:pt-0 last:pb-0"
    >
      <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg shadow-sm", color)}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-0">{title}</p>
        <p className="mt-0.5 line-clamp-1 text-xs text-neutral-500 dark:text-neutral-400">{description}</p>
      </div>
      <span className="flex-shrink-0 text-[11px] font-medium text-neutral-400 dark:text-neutral-500">{time}</span>
    </motion.div>
  );
}

// KPI Card
function KPICard({ label, value, icon: Icon, iconColor, iconBg }: any) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-neutral-200/80 bg-white/90 p-4 shadow-sm transition-all duration-200 hover:border-neutral-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900/90">
      <div className={cn("flex h-11 w-11 items-center justify-center rounded-lg shadow-sm", iconBg)}>
        <Icon className={cn("h-5 w-5", iconColor)} />
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-500 dark:text-neutral-400">{label}</p>
        <p className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-0">{value}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const healthScores = [
    { label: "System Health", score: 98, color: "bg-primary-500" },
    { label: "Portfolio Quality", score: 92, color: "bg-primary-500" },
    { label: "Member Engagement", score: 87, color: "bg-amber-500" },
    { label: "Compliance Score", score: 95, color: "bg-primary-500" },
  ];

  const stats = [
    { title: "Total Members", value: formatNumber(1250), change: { value: "+12%", positive: true }, icon: Users, subtitle: "vs last month" },
    { title: "Active Members", value: formatNumber(1080), change: { value: "+8%", positive: true }, icon: UserCheck, subtitle: "86% active" },
    { title: "Savings Balance", value: formatCurrency(45200000), change: { value: "+15%", positive: true }, icon: PiggyBank, subtitle: "vs last month" },
    { title: "Shares Value", value: formatCurrency(12800000), change: { value: "+5%", positive: true }, icon: CircleDollarSign, subtitle: "vs last month" },
    { title: "Loan Portfolio", value: formatCurrency(38500000), change: { value: "+18%", positive: true }, icon: HandCoins, subtitle: "vs last month" },
  ];

  const statColors = [
    "bg-blue-500",
    "bg-primary-500",
    "bg-violet-500",
    "bg-indigo-500",
    "bg-amber-500",
  ];

  const recentTransactions = [
    { ref: "TXN-001", member: "John Kamau", type: "Savings Deposit", amount: 35000, status: "completed" },
    { ref: "TXN-002", member: "Mary Wanjiku", type: "Loan Repayment", amount: 12500, status: "completed" },
    { ref: "TXN-003", member: "Peter Ochieng", type: "Shares Purchase", amount: 50000, status: "pending" },
    { ref: "TXN-004", member: "Grace Muthoni", type: "Savings Deposit", amount: 15000, status: "completed" },
    { ref: "TXN-005", member: "David Kiprop", type: "Loan Disbursement", amount: 200000, status: "failed" },
  ];

  const activities = [
    { icon: Wallet, title: "Savings Deposit", description: "KES 35,000 deposited by Grace Akinyi", time: "25m ago", color: "bg-violet-500" },
    { icon: CheckSquare, title: "Meeting Completed", description: "Board meeting #45 finalized", time: "1h ago", color: "bg-amber-500" },
    { icon: AlertTriangle, title: "Fraud Alert", description: "Suspicious transaction detected - Account #8901", time: "2h ago", color: "bg-red-500" },
    { icon: Cpu, title: "AI Analysis Complete", description: "Monthly financial analysis generated", time: "3h ago", color: "bg-cyan-500" },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <motion.div 
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center"
      >
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-0">Executive Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-500">Welcome back! Here is your organization overview</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button size="sm">
            <FileBarChart className="h-4 w-4" />
            Generate Report
          </Button>
        </div>
      </motion.div>

      {/* Health Scores - Compact */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {healthScores.map((score) => (
          <HealthScoreCard key={score.label} {...score} />
        ))}
      </div>

      {/* Stats Grid - Top 5 Most Important */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.title}
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            transition={{ duration: 0.3, delay: i * 0.03, ease: "easeOut" }}
          >
            <StatCard 
              title={stat.title}
              value={stat.value}
              change={stat.change}
              icon={<stat.icon className="h-5 w-5" />}
              iconColor={statColors[i]}
              subtitle={stat.subtitle}
            />
          </motion.div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Revenue vs Expenses" />
        <ChartCard title="Loan Portfolio Overview" />
      </div>

      {/* Bottom Row: Transactions + Activities */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Recent Transactions */}
        <motion.div 
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl border border-neutral-200/80 bg-white/90 p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/90"
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-0">Recent Transactions</h3>
            <Button variant="ghost" size="sm">
              View All <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800">
                  <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">Ref</th>
                  <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">Member</th>
                  <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">Type</th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500">Amount</th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {recentTransactions.map((tx) => (
                  <tr key={tx.ref} className="transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/30">
                    <td className="py-3 font-mono text-xs text-neutral-500">{tx.ref}</td>
                    <td className="py-3 text-sm font-medium text-neutral-900 dark:text-neutral-0">{tx.member}</td>
                    <td className="py-3 text-sm text-neutral-600 dark:text-neutral-400">{tx.type}</td>
                    <td className="py-3 text-right text-sm font-semibold text-neutral-900 dark:text-neutral-0">{formatCurrency(tx.amount)}</td>
                    <td className="py-3 text-right">
                      <span className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                        tx.status === "completed" && "bg-primary-50 text-primary-700 dark:bg-primary-900/25 dark:text-primary-400",
                        tx.status === "pending" && "bg-amber-50 text-amber-700 dark:bg-amber-900/25 dark:text-amber-400",
                        tx.status === "failed" && "bg-red-50 text-red-700 dark:bg-red-900/25 dark:text-red-400",
                      )}>
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Recent Activities */}
        <motion.div 
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-xl border border-neutral-200/80 bg-white/90 p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/90"
        >
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-0">Recent Activities</h3>
            <Button variant="ghost" size="sm">
              View All <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {activities.map((activity) => (
              <ActivityItem key={activity.title} {...activity} />
            ))}
          </div>
        </motion.div>
      </div>

      {/* KPIs Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard label="Pending Approvals" value="12" icon={CheckSquare} iconColor="text-amber-600" iconBg="bg-amber-50 dark:bg-amber-900/25" />
        <KPICard label="Active Projects" value="5" icon={Building2} iconColor="text-blue-600" iconBg="bg-blue-50 dark:bg-blue-900/25" />
        <KPICard label="Upcoming Meetings" value="3" icon={Calendar} iconColor="text-violet-600" iconBg="bg-violet-50 dark:bg-violet-900/25" />
        <KPICard label="Notifications" value="8" icon={Bell} iconColor="text-rose-600" iconBg="bg-rose-50 dark:bg-rose-900/25" />
      </div>
    </div>
  );
}