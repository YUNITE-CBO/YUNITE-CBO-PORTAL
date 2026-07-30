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
      className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors"
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
        <Activity className="w-4 h-4 text-neutral-300 dark:text-neutral-600" />
      </div>
      <div className="flex items-end justify-between">
        <span className="text-2xl font-bold text-neutral-900 dark:text-neutral-0">{score}%</span>
        <div className="w-20 h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
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
      className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-0">{title}</h3>
        <Button variant="ghost" size="sm">
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </div>
      <div className="h-64 bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-neutral-800/50 dark:to-neutral-800/30 rounded-lg flex items-center justify-center border border-dashed border-neutral-200 dark:border-neutral-700/50">
        <div className="text-center">
          <BarChart3 className="w-8 h-8 text-neutral-300 dark:text-neutral-600 mx-auto mb-2" />
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
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm", color)}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-0">{title}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-1">{description}</p>
      </div>
      <span className="text-[11px] text-neutral-400 dark:text-neutral-500 font-medium flex-shrink-0">{time}</span>
    </motion.div>
  );
}

// KPI Card
function KPICard({ label, value, icon: Icon, iconColor, iconBg }: any) {
  return (
    <div className="flex items-center gap-4 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors">
      <div className={cn("w-11 h-11 rounded-lg flex items-center justify-center shadow-sm", iconBg)}>
        <Icon className={cn("w-5 h-5", iconColor)} />
      </div>
      <div>
        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
        <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-0">{value}</p>
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
    { title: "Outstanding Loans", value: formatCurrency(22400000), change: { value: "-3%", positive: false }, icon: Wallet, subtitle: "58% disbursed" },
    { title: "Overdue Loans", value: formatCurrency(3200000), change: { value: "+2%", positive: false }, icon: AlertTriangle, subtitle: "8.3% rate" },
    { title: "Revenue (MTD)", value: formatCurrency(1850000), change: { value: "+22%", positive: true }, icon: DollarSign, subtitle: "vs last month" },
    { title: "Net Income", value: formatCurrency(920000), change: { value: "+18%", positive: true }, icon: TrendingUp, subtitle: "49.7% margin" },
    { title: "Cash Position", value: formatCurrency(15600000), change: { value: "+5%", positive: true }, icon: Wallet, subtitle: "vs last month" },
  ];

  const statColors = [
    "bg-blue-500",
    "bg-primary-500",
    "bg-violet-500",
    "bg-indigo-500",
    "bg-amber-500",
    "bg-rose-500",
    "bg-red-500",
    "bg-primary-600",
    "bg-cyan-500",
    "bg-teal-500",
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
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-0">Executive Dashboard</h1>
          <p className="text-sm text-neutral-500 mt-1">Welcome back! Here&apos;s your organization overview</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4" />
            Export
          </Button>
          <Button size="sm">
            <FileBarChart className="w-4 h-4" />
            Generate Report
          </Button>
        </div>
      </motion.div>

      {/* Health Scores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {healthScores.map((score) => (
          <HealthScoreCard key={score.label} {...score} />
        ))}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
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
              icon={<stat.icon className="w-5 h-5" />}
              iconColor={statColors[i]}
              subtitle={stat.subtitle}
            />
          </motion.div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Revenue vs Expenses" />
        <ChartCard title="Loan Portfolio Overview" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Member Growth" />
        <ChartCard title="Savings vs Loans" />
        <ChartCard title="Cash Flow" />
      </div>

      {/* Bottom Row: Transactions + Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Transactions */}
        <motion.div 
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-0">Recent Transactions</h3>
            <Button variant="ghost" size="sm">
              View All <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800">
                  <th className="text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide pb-3">Ref</th>
                  <th className="text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide pb-3">Member</th>
                  <th className="text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide pb-3">Type</th>
                  <th className="text-right text-xs font-semibold text-neutral-500 uppercase tracking-wide pb-3">Amount</th>
                  <th className="text-right text-xs font-semibold text-neutral-500 uppercase tracking-wide pb-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {recentTransactions.map((tx) => (
                  <tr key={tx.ref} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors">
                    <td className="py-3 font-mono text-xs text-neutral-500">{tx.ref}</td>
                    <td className="py-3 text-sm font-medium text-neutral-900 dark:text-neutral-0">{tx.member}</td>
                    <td className="py-3 text-sm text-neutral-600 dark:text-neutral-400">{tx.type}</td>
                    <td className="py-3 text-right text-sm font-semibold text-neutral-900 dark:text-neutral-0">{formatCurrency(tx.amount)}</td>
                    <td className="py-3 text-right">
                      <span className={cn(
                        "inline-flex px-2 py-0.5 text-xs font-medium rounded-full",
                        tx.status === "completed" && "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400",
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
        </motion.div>

        {/* Recent Activities */}
        <motion.div 
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5"
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-0">Recent Activities</h3>
            <Button variant="ghost" size="sm">
              View All <ArrowRight className="w-3 h-3 ml-1" />
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Pending Approvals" value="12" icon={CheckSquare} iconColor="text-amber-600" iconBg="bg-amber-100 dark:bg-amber-900/30" />
        <KPICard label="Active Projects" value="5" icon={Building2} iconColor="text-blue-600" iconBg="bg-blue-100 dark:bg-blue-900/30" />
        <KPICard label="Upcoming Meetings" value="3" icon={Calendar} iconColor="text-violet-600" iconBg="bg-violet-100 dark:bg-violet-900/30" />
        <KPICard label="Notifications" value="8" icon={Bell} iconColor="text-rose-600" iconBg="bg-rose-100 dark:bg-rose-900/30" />
      </div>
    </div>
  );
}
