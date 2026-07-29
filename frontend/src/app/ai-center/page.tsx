"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Cpu,
  Brain,
  Shield,
  AlertTriangle,
  TrendingUp,
  Users,
  DollarSign,
  LineChart,
  BarChart4,
  FileBarChart,
  Activity,
  Database,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Info,
  Lightbulb,
  Search,
  Download,
  Clock,
  Zap,
} from "lucide-react";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

const insightCategories = [
  { id: "all", label: "All Insights", icon: Brain, color: "text-violet-500", count: 24 },
  { id: "fraud", label: "Fraud Detection", icon: Shield, color: "text-red-500", count: 3 },
  { id: "financial", label: "Financial Analysis", icon: DollarSign, color: "text-emerald-500", count: 8 },
  { id: "risk", label: "Risk Analysis", icon: AlertTriangle, color: "text-amber-500", count: 5 },
  { id: "members", label: "Member Analysis", icon: Users, color: "text-blue-500", count: 4 },
  { id: "system", label: "System Analysis", icon: Activity, color: "text-cyan-500", count: 4 },
];

const insights = [
  {
    id: "1",
    title: "Unusual Transaction Pattern Detected",
    description: "Member #MEM-023 has 15 transactions exceeding KES 100,000 in the past 7 days, which is 300% above their normal activity pattern.",
    severity: "high",
    category: "fraud",
    recommendation: "Flag account for review and contact member for verification",
    time: "10m ago",
    metrics: { riskScore: 87, confidence: 94, affectedMembers: 1, amount: formatCurrency(2450000) },
  },
  {
    id: "2",
    title: "Loan Portfolio at Risk",
    description: "8.3% of the loan portfolio (KES 3.2M) is overdue by more than 30 days. Concentration risk identified in the 'normal' loan category.",
    severity: "critical",
    category: "risk",
    recommendation: "Initiate recovery process for overdue loans and review lending criteria for normal loans",
    time: "25m ago",
    metrics: { riskScore: 92, confidence: 98, affectedLoans: 45, amount: formatCurrency(3200000) },
  },
  {
    id: "3",
    title: "Revenue Growth Opportunity",
    description: "Analysis shows 35% of members with active savings accounts have not taken any loan. Cross-selling potential estimated at KES 8.5M.",
    severity: "low",
    category: "financial",
    recommendation: "Launch targeted loan marketing campaign for savings-only members",
    time: "1h ago",
    metrics: { opportunity: formatCurrency(8500000), potentialMembers: 380, conversion: "15%", amount: formatCurrency(8500000) },
  },
  {
    id: "4",
    title: "Duplicate Member Records Identified",
    description: "AI detected 12 potential duplicate member records with matching ID numbers but different registration details.",
    severity: "medium",
    category: "system",
    recommendation: "Merge duplicate records and implement ID validation on registration",
    time: "2h ago",
    metrics: { duplicatesFound: 12, affectedAccounts: 18, dataQuality: "96%", amount: "12 records" },
  },
  {
    id: "5",
    title: "Cash Flow Prediction Alert",
    description: "Projected cash position may drop below minimum reserve of KES 5M within 14 days based on current withdrawal trends and upcoming disbursements.",
    severity: "high",
    category: "financial",
    recommendation: "Consider delaying non-essential disbursements and encouraging additional deposits",
    time: "3h ago",
    metrics: { projectedBalance: formatCurrency(4200000), daysToCritical: 14, shortfall: formatCurrency(800000), amount: formatCurrency(4200000) },
  },
  {
    id: "6",
    title: "Member Churn Risk Analysis",
    description: "15 members (2.1% of active base) show signs of potential churn - no transactions in 90+ days, declining balances, and missed meetings.",
    severity: "medium",
    category: "members",
    recommendation: "Engage at-risk members with personalized outreach and retention offers",
    time: "4h ago",
    metrics: { atRiskMembers: 15, churnRate: "2.1%", potentialLoss: formatCurrency(680000), amount: formatCurrency(680000) },
  },
  {
    id: "7",
    title: "Budget Variance Alert",
    description: "Administrative expenses are 23% over budget for this quarter. Main drivers: utilities and office supplies.",
    severity: "medium",
    category: "financial",
    recommendation: "Review and adjust budget allocations for remaining quarter",
    time: "5h ago",
    metrics: { variance: "23%", overBudget: formatCurrency(345000), category: "Admin", amount: formatCurrency(345000) },
  },
  {
    id: "8",
    title: "Data Quality Improvement Opportunity",
    description: "8.5% of member records are missing KRA PIN information. 12% have incomplete employment details.",
    severity: "low",
    category: "system",
    recommendation: "Run data collection campaign to complete missing member information",
    time: "6h ago",
    metrics: { completeness: "91.5%", missingFields: 145, improvement: "8.5%", amount: "145 records" },
  },
];

const severityConfig = {
  critical: { icon: XCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/20", border: "border-red-200 dark:border-red-800", label: "Critical" },
  high: { icon: AlertCircle, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-200 dark:border-amber-800", label: "High" },
  medium: { icon: Info, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-200 dark:border-blue-800", label: "Medium" },
  low: { icon: Lightbulb, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-800", label: "Low" },
};

export default function AICenterPage() {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedInsight, setSelectedInsight] = useState<string | null>(null);

  const filteredInsights = selectedCategory === "all"
    ? insights
    : insights.filter((i) => i.category === selectedCategory);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">AI Control Center</h1>
              <p className="text-sm text-slate-500">Intelligent insights and automated analysis</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">
            <RefreshCw className="w-4 h-4" />
            Refresh Analysis
          </button>
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium">
            <Zap className="w-4 h-4" />
            Run Analysis
          </button>
        </div>
      </div>

      {/* AI Health Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Active Models", value: "8", sub: "All operational", color: "bg-emerald-500" },
          { label: "Analyses Today", value: "47", sub: "+12 from yesterday", color: "bg-blue-500" },
          { label: "Alerts Active", value: "5", sub: "3 critical", color: "bg-red-500" },
          { label: "Accuracy Rate", value: "96.8%", sub: "+0.5% this week", color: "bg-violet-500" },
        ].map((item) => (
          <div key={item.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-xs text-slate-500 mb-1">{item.label}</p>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-bold text-slate-900 dark:text-white">{item.value}</span>
              <div className={cn("w-2 h-2 rounded-full", item.color)} />
            </div>
            <p className="text-xs text-slate-400 mt-1">{item.sub}</p>
          </div>
        ))}
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2">
        {insightCategories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border",
              selectedCategory === cat.id
                ? "bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-400"
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-violet-200"
            )}
          >
            <cat.icon className={cn("w-4 h-4", cat.color)} />
            {cat.label}
            <span className="px-1.5 py-0.5 text-xs rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">{cat.count}</span>
          </button>
        ))}
      </div>

      {/* Insights Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredInsights.map((insight) => {
          const severity = severityConfig[insight.severity as keyof typeof severityConfig];
          const SeverityIcon = severity.icon;
          const isSelected = selectedInsight === insight.id;

          return (
            <motion.div
              key={insight.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "bg-white dark:bg-slate-900 rounded-xl border transition-all cursor-pointer",
                isSelected ? "border-violet-300 dark:border-violet-700 shadow-lg" : "border-slate-200 dark:border-slate-700 hover:border-violet-200",
                severity.border
              )}
              onClick={() => setSelectedInsight(isSelected ? null : insight.id)}
            >
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", severity.bg)}>
                      <SeverityIcon className={cn("w-5 h-5", severity.color)} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{insight.title}</h3>
                      <p className="text-xs text-slate-400">{insight.time}</p>
                    </div>
                  </div>
                  <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full border", severity.bg, severity.color, severity.border)}>
                    {severity.label}
                  </span>
                </div>

                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{insight.description}</p>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {Object.entries(insight.metrics).map(([key, value]) => (
                    <div key={key} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2.5">
                      <p className="text-xs text-slate-400 capitalize mb-0.5">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{value}</p>
                    </div>
                  ))}
                </div>

                {isSelected && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-700"
                  >
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-violet-50 dark:bg-violet-900/20">
                      <Lightbulb className="w-4 h-4 text-violet-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-violet-700 dark:text-violet-400">AI Recommendation</p>
                        <p className="text-sm text-violet-600 dark:text-violet-300">{insight.recommendation}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="flex-1 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors">
                        Apply Recommendation
                      </button>
                      <button className="px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                        Dismiss
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Analysis Modules */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Analysis Modules</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            { label: "Fraud Detection", icon: Shield, desc: "Real-time fraud monitoring", color: "from-red-500 to-rose-500" },
            { label: "Duplicate Detection", icon: Search, desc: "Find duplicate records", color: "from-amber-500 to-orange-500" },
            { label: "Financial Analysis", icon: DollarSign, desc: "Revenue & expense insights", color: "from-emerald-500 to-teal-500" },
            { label: "Member Analysis", icon: Users, desc: "Member behavior patterns", color: "from-blue-500 to-indigo-500" },
            { label: "Loan Risk Analysis", icon: AlertTriangle, desc: "Portfolio risk assessment", color: "from-amber-500 to-yellow-500" },
            { label: "Cash Flow Prediction", icon: LineChart, desc: "30-day cash forecast", color: "from-cyan-500 to-sky-500" },
            { label: "Budget Analysis", icon: BarChart4, desc: "Budget vs actual", color: "from-violet-500 to-purple-500" },
            { label: "Data Quality", icon: Database, desc: "Data integrity checks", color: "from-slate-500 to-gray-500" },
            { label: "Profitability", icon: TrendingUp, desc: "Product profitability", color: "from-emerald-500 to-green-500" },
            { label: "Compliance Check", icon: Shield, desc: "Regulatory compliance", color: "from-indigo-500 to-violet-500" },
            { label: "Executive Report", icon: FileBarChart, desc: "Generate AI report", color: "from-rose-500 to-pink-500" },
            { label: "System Monitor", icon: Activity, desc: "API & DB monitoring", color: "from-sky-500 to-blue-500" },
          ].map((module) => (
            <button
              key={module.label}
              className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-violet-200 hover:bg-violet-50/50 dark:hover:bg-violet-900/10 transition-all text-left"
            >
              <div className={cn("w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center", module.color)}>
                <module.icon className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white">{module.label}</p>
                <p className="text-xs text-slate-400 truncate">{module.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}