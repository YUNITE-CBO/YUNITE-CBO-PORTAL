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
  TrendingDown,
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

// Animation variants
const fadeInUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

// Premium Stat Card Component
function StatCard({
  title,
  value,
  change,
  icon: Icon,
  color,
  subtitle,
  delay = 0,
}: {
  title: string;
  value: string;
  change?: { value: string; positive: boolean };
  icon: any;
  color: string;
  subtitle?: string;
  delay?: number;
}) {
  return (
    <motion.div
      variants={fadeInUp}
      initial="initial"
      animate="animate"
      transition={{ duration: 0.4, delay: delay * 0.05, ease: "easeOut" }}
      className="group relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 hover:border-slate-200 dark:hover:border-slate-700 hover:shadow-lg dark:hover:shadow-xl transition-all duration-300 overflow-hidden"
    >
      {/* Background gradient on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <div className="relative flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{value}</p>
          {change && (
            <div className="flex items-center gap-1.5">
              {change.positive ? (
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-red-500" />
              )}
              <span className={cn(
                "text-xs font-semibold",
                change.positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
              )}>
                {change.value}
              </span>
              {subtitle && (
                <span className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</span>
              )}
            </div>
          )}
        </div>
        <div className={cn(
          "w-11 h-11 rounded-xl flex items-center justify-center shadow-lg",
          color
        )}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </motion.div>
  );
}

// Premium Chart placeholder
function ChartPlaceholder({ title, height = "h-72" }: { title: string; height?: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 hover:border-slate-200 dark:hover:border-slate-700 transition-colors"
    >
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
        <button className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
      <div className={cn(
        "bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-800/50 dark:to-slate-800/30 rounded-xl flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-700/50",
        height
      )}>
        <div className="text-center">
          <BarChart3 className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-slate-400 dark:text-slate-500">Chart Preview</p>
        </div>
      </div>
    </motion.div>
  );
}

// Premium Activity Item
function ActivityItem({ icon: Icon, title, description, time, color }: any) {
  return (
    <motion.div 
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-4 py-4 first:pt-0 last:pb-0"
    >
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md", color)}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-white">{title}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">{description}</p>
      </div>
      <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium flex-shrink-0">{time}</span>
    </motion.div>
  );
}

// Premium Health Score Card
function HealthScoreCard({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 hover:border-slate-200 dark:hover:border-slate-700 transition-colors"
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <Activity className="w-4 h-4 text-slate-300 dark:text-slate-600" />
      </div>
      <div className="flex items-end justify-between">
        <span className="text-2xl font-bold text-slate-900 dark:text-white">{score}%</span>
        <div className="w-20 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            className={cn("h-full rounded-full", color)} 
          />
        </div>
      </div>
    </motion.div>
  );
}

export default function DashboardPage() {
  const stats = [
    { title: "Total Members", value: formatNumber(1250), change: { value: "+12%", positive: true }, icon: Users, color: "bg-blue-500", subtitle: "vs last month" },
    { title: "Active Members", value: formatNumber(1080), change: { value: "+8%", positive: true }, icon: UserCheck, color: "bg-emerald-500", subtitle: "86% active" },
    { title: "Savings Balance", value: formatCurrency(45200000), change: { value: "+15%", positive: true }, icon: PiggyBank, color: "bg-violet-500", subtitle: "vs last month" },
    { title: "Shares Value", value: formatCurrency(12800000), change: { value: "+5%", positive: true }, icon: CircleDollarSign, color: "bg-indigo-500", subtitle: "vs last month" },
    { title: "Loan Portfolio", value: formatCurrency(38500000), change: { value: "+18%", positive: true }, icon: HandCoins, color: "bg-amber-500", subtitle: "vs last month" },
    { title: "Outstanding Loans", value: formatCurrency(22400000), change: { value: "-3%", positive: false }, icon: Wallet, color: "bg-rose-500", subtitle: "58% disbursed" },
    { title: "Overdue Loans", value: formatCurrency(3200000), change: { value: "+2%", positive: false }, icon: AlertTriangle, color: "bg-red-500", subtitle: "8.3% rate" },
    { title: "Revenue (MTD)", value: formatCurrency(1850000), change: { value: "+22%", positive: true }, icon: DollarSign, color: "bg-emerald-600", subtitle: "vs last month" },
    { title: "Net Income", value: formatCurrency(920000), change: { value: "+18%", positive: true }, icon: TrendingUp, color: "bg-cyan-500", subtitle: "49.7% margin" },
    { title: "Cash Position", value: formatCurrency(15600000), change: { value: "+7%", positive: true }, icon: Building2, color: "bg-sky-500", subtitle: "balance" },
  ];

  const healthScores = [
    { label: "Organization", score: 87, color: "bg-emerald-500" },
    { label: "Financial", score: 74, color: "bg-amber-500" },
    { label: "Data Quality", score: 92, color: "bg-emerald-500" },
    { label: "System", score: 98, color: "bg-emerald-500" },
  ];

  const recentTransactions = [
    { ref: "TXN-001", member: "John Kamau", type: "Savings Deposit", amount: 25000, status: "completed" },
    { ref: "TXN-002", member: "Mary Wanjiku", type: "Loan Disbursement", amount: 150000, status: "completed" },
    { ref: "TXN-003", member: "Peter Ochieng", type: "Share Purchase", amount: 50000, status: "pending" },
    { ref: "TXN-004", member: "Grace Muthoni", type: "Loan Repayment", amount: 12500, status: "completed" },
    { ref: "TXN-005", member: "David Kiprop", type: "Withdrawal", amount: 10000, status: "failed" },
  ];

  const activities = [
    { icon: Users, title: "New Member Registered", description: "Sarah Chebet joined YUNITE SACCO", time: "5m ago", color: "bg-emerald-500" },
    { icon: HandCoins, title: "Loan Approved", description: "KES 200,000 loan approved for James Kariuki", time: "12m ago", color: "bg-blue-500" },
    { icon: PiggyBank, title: "Savings Deposit", description: "KES 35,000 deposited by Grace Akinyi", time: "25m ago", color: "bg-violet-500" },
    { icon: CheckSquare, title: "Meeting Completed", description: "Board meeting #45 finalized", time: "1h ago", color: "bg-amber-500" },
    { icon: AlertTriangle, title: "Fraud Alert", description: "Suspicious transaction detected - Account #8901", time: "2h ago", color: "bg-red-500" },
    { icon: Cpu, title: "AI Analysis Complete", description: "Monthly financial analysis generated", time: "3h ago", color: "bg-cyan-500" },
  ];

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <motion.div 
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Executive Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Welcome back! Here's your organization overview</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <Download className="w-4 h-4" />
            Export
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white text-sm font-semibold shadow-lg shadow-emerald-500/25 transition-all">
            <FileBarChart className="w-4 h-4" />
            Generate Report
          </button>
        </div>
      </motion.div>

      {/* Health Scores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {healthScores.map((score, i) => (
          <HealthScoreCard key={score.label} {...score} />
        ))}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {stats.map((stat, i) => (
          <StatCard key={stat.title} {...stat} delay={i} />
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
        <motion.div 
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6"
        >
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Recent Transactions</h3>
            <button className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors">
              View All <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th className="text-left">Ref</th>
                  <th className="text-left">Member</th>
                  <th className="text-left">Type</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.map((tx, i) => (
                  <tr key={tx.ref}>
                    <td className="font-mono text-xs text-slate-500">{tx.ref}</td>
                    <td className="font-medium text-slate-900 dark:text-white">{tx.member}</td>
                    <td className="text-slate-500">{tx.type}</td>
                    <td className="text-right font-semibold text-slate-900 dark:text-white">{formatCurrency(tx.amount)}</td>
                    <td className="text-right">
                      <span className={cn(
                        "inline-flex px-2.5 py-1 text-xs font-medium rounded-full",
                        tx.status === "completed" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                        tx.status === "pending" && "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                        tx.status === "failed" && "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
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
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6"
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Recent Activities</h3>
            <button className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors">
              View All <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {activities.map((activity, i) => (
              <ActivityItem key={i} {...activity} />
            ))}
          </div>
        </motion.div>
      </div>

      {/* KPIs Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Pending Approvals", value: "12", icon: CheckSquare, color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-900/30" },
          { label: "Active Projects", value: "5", icon: Building2, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/30" },
          { label: "Upcoming Meetings", value: "3", icon: Calendar, color: "text-violet-600", bg: "bg-violet-100 dark:bg-violet-900/30" },
          { label: "Notifications", value: "8", icon: Bell, color: "text-rose-600", bg: "bg-rose-100 dark:bg-rose-900/30" },
        ].map((kpi, i) => (
          <motion.div 
            key={kpi.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 + i * 0.05 }}
            className="flex items-center gap-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 hover:border-slate-200 dark:hover:border-slate-700 transition-colors"
          >
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shadow-md", kpi.bg)}>
              <kpi.icon className={cn("w-5 h-5", kpi.color)} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{kpi.label}</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{kpi.value}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}