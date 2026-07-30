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
  Zap,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

const insightCategories = [
  { id: "all", label: "All Insights", icon: Brain, color: "text-violet-500" },
  { id: "fraud", label: "Fraud Detection", icon: Shield, color: "text-red-500" },
  { id: "financial", label: "Financial Analysis", icon: DollarSign, color: "text-primary-500" },
  { id: "risk", label: "Risk Analysis", icon: AlertTriangle, color: "text-amber-500" },
  { id: "members", label: "Member Analysis", icon: Users, color: "text-blue-500" },
  { id: "system", label: "System Analysis", icon: Activity, color: "text-cyan-500" },
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
    recommendation: "Initiate recovery process for overdue loans and review lending criteria",
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
    metrics: { opportunity: formatCurrency(8500000), potentialMembers: 380, conversion: "15%" },
  },
  {
    id: "4",
    title: "Duplicate Member Records Identified",
    description: "AI detected 12 potential duplicate member records with matching ID numbers but different registration details.",
    severity: "medium",
    category: "system",
    recommendation: "Merge duplicate records and implement ID validation on registration",
    time: "2h ago",
    metrics: { duplicatesFound: 12, affectedAccounts: 18, dataQuality: "96%" },
  },
  {
    id: "5",
    title: "Cash Flow Prediction Alert",
    description: "Projected cash position may drop below minimum reserve of KES 5M within 14 days based on current withdrawal trends.",
    severity: "high",
    category: "financial",
    recommendation: "Consider delaying non-essential disbursements and encouraging additional deposits",
    time: "3h ago",
    metrics: { projectedBalance: formatCurrency(4200000), daysToCritical: 14, shortfall: formatCurrency(800000) },
  },
  {
    id: "6",
    title: "Member Churn Risk Analysis",
    description: "15 members (2.1% of active base) show signs of potential churn - no transactions in 90+ days, declining balances.",
    severity: "medium",
    category: "members",
    recommendation: "Engage at-risk members with personalized outreach and retention offers",
    time: "4h ago",
    metrics: { atRiskMembers: 15, churnRate: "2.1%", potentialLoss: formatCurrency(680000) },
  },
];

const severityConfig = {
  critical: { icon: XCircle, bg: "bg-red-50 dark:bg-red-900/20", border: "border-red-200 dark:border-red-800", label: "Critical" },
  high: { icon: AlertCircle, bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-200 dark:border-amber-800", label: "High" },
  medium: { icon: Info, bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-200 dark:border-blue-800", label: "Medium" },
  low: { icon: Lightbulb, bg: "bg-primary-50 dark:bg-primary-900/20", border: "border-primary-200 dark:border-primary-800", label: "Low" },
};

export default function AICenterPage() {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedInsight, setSelectedInsight] = useState<string | null>(null);

  const filteredInsights = selectedCategory === "all"
    ? insights
    : insights.filter((i) => i.category === selectedCategory);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-0">AI Control Center</h1>
            <p className="text-sm text-neutral-500">Intelligent insights and automated analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <RefreshCw className="w-4 h-4" />
            Refresh Analysis
          </Button>
          <Button size="sm">
            <Zap className="w-4 h-4" />
            Run Analysis
          </Button>
        </div>
      </div>

      {/* AI Health Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Active Models", value: "8", sub: "All operational", color: "bg-primary-500" },
          { label: "Analyses Today", value: "47", sub: "+12 from yesterday", color: "bg-blue-500" },
          { label: "Alerts Active", value: "5", sub: "3 critical", color: "bg-red-500" },
          { label: "Accuracy Rate", value: "96.8%", sub: "+0.5% this week", color: "bg-violet-500" },
        ].map((item) => (
          <div key={item.label} className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-neutral-500">{item.label}</p>
              <div className={cn("w-2 h-2 rounded-full", item.color)} />
            </div>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-0">{item.value}</p>
            <p className="text-xs text-neutral-400 mt-1">{item.sub}</p>
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
                : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:border-violet-200"
            )}
          >
            <cat.icon className={cn("w-4 h-4", cat.color)} />
            {cat.label}
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
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "bg-white dark:bg-neutral-900 rounded-xl border transition-all cursor-pointer",
                isSelected ? "border-violet-300 dark:border-violet-700 shadow-lg" : "border-neutral-200 dark:border-neutral-800 hover:border-violet-200",
                severity.border
              )}
              onClick={() => setSelectedInsight(isSelected ? null : insight.id)}
            >
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", severity.bg)}>
                      <SeverityIcon className={cn("w-5 h-5 text-current", 
                        insight.severity === "critical" && "text-red-600",
                        insight.severity === "high" && "text-amber-600",
                        insight.severity === "medium" && "text-blue-600",
                        insight.severity === "low" && "text-primary-600"
                      )} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-0">{insight.title}</h3>
                      <p className="text-xs text-neutral-400">{insight.time}</p>
                    </div>
                  </div>
                  <Badge variant={
                    insight.severity === "critical" ? "error" :
                    insight.severity === "high" ? "warning" :
                    insight.severity === "medium" ? "info" : "default"
                  } size="sm">
                    {severity.label}
                  </Badge>
                </div>

                <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">{insight.description}</p>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-3">
                  {Object.entries(insight.metrics).slice(0, 3).map(([key, value]) => (
                    <div key={key} className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg p-2.5">
                      <p className="text-[10px] text-neutral-400 capitalize mb-0.5">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                      <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-0 truncate">{String(value)}</p>
                    </div>
                  ))}
                </div>

                {isSelected && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    className="space-y-3 pt-4 mt-4 border-t border-neutral-200 dark:border-neutral-700"
                  >
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-violet-50 dark:bg-violet-900/20">
                      <Lightbulb className="w-4 h-4 text-violet-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-violet-700 dark:text-violet-400">AI Recommendation</p>
                        <p className="text-sm text-violet-600 dark:text-violet-300">{insight.recommendation}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" className="flex-1">
                        Apply Recommendation
                      </Button>
                      <Button variant="outline" size="sm">
                        Dismiss
                      </Button>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Analysis Modules */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-0 mb-4">Analysis Modules</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {[
            { label: "Fraud Detection", icon: Shield, desc: "Real-time fraud monitoring", color: "from-red-500 to-rose-500" },
            { label: "Financial Analysis", icon: DollarSign, desc: "Revenue & expense insights", color: "from-primary-500 to-teal-500" },
            { label: "Member Analysis", icon: Users, desc: "Member behavior patterns", color: "from-blue-500 to-indigo-500" },
            { label: "Loan Risk Analysis", icon: AlertTriangle, desc: "Portfolio risk assessment", color: "from-amber-500 to-yellow-500" },
            { label: "Cash Flow Prediction", icon: LineChart, desc: "30-day cash forecast", color: "from-cyan-500 to-sky-500" },
            { label: "Budget Analysis", icon: BarChart4, desc: "Budget vs actual", color: "from-violet-500 to-purple-500" },
            { label: "Data Quality", icon: Database, desc: "Data integrity checks", color: "from-slate-500 to-gray-500" },
            { label: "Profitability", icon: TrendingUp, desc: "Product profitability", color: "from-primary-500 to-green-500" },
            { label: "Compliance Check", icon: Shield, desc: "Regulatory compliance", color: "from-indigo-500 to-violet-500" },
            { label: "Executive Report", icon: FileBarChart, desc: "Generate AI report", color: "from-rose-500 to-pink-500" },
            { label: "System Monitor", icon: Activity, desc: "API & DB monitoring", color: "from-sky-500 to-blue-500" },
            { label: "Duplicate Detection", icon: Users, desc: "Find duplicate records", color: "from-amber-500 to-orange-500" },
          ].map((module) => (
            <button
              key={module.label}
              className="flex items-center gap-3 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 hover:border-violet-200 dark:hover:border-violet-800 hover:bg-violet-50/50 dark:hover:bg-violet-900/10 transition-all text-left"
            >
              <div className={cn("w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center", module.color)}>
                <module.icon className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-neutral-900 dark:text-neutral-0">{module.label}</p>
                <p className="text-[10px] text-neutral-400 truncate">{module.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
