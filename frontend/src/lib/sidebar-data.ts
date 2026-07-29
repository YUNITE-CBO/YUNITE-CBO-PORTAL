import {
  LayoutDashboard,
  Building2,
  GitBranch,
  Building,
  Users,
  UserCog,
  Shield,
  UserCheck,
  Wallet,
  PiggyBank,
  HandCoins,
  Receipt,
  CircleDollarSign,
  Scale,
  Siren,
  HeartHandshake,
  Tent,
  Handshake,
  FolderKanban,
  Calendar,
  Vote,
  CheckSquare,
  Workflow,
  BookOpen,
  ScrollText,
  BookOpenCheck,
  BarChart3,
  LineChart,
  PieChart,
  TrendingUp,
  Landmark,
  WalletCards,
  Package,
  Warehouse,
  Briefcase,
  DollarSign,
  Users2,
  Truck,
  Store,
  FileText,
  Bell,
  MessageSquare,
  File,
  FileBarChart,
  ShieldCheck,
  AlertTriangle,
  Ban,
  ClipboardCheck,
  Cpu,
  BarChart4,
  Settings,
  Link,
  Key,
  Activity,
  FileJson,
  HardDrive,
  Code2,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";

export interface SidebarItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
  children?: SidebarItem[];
}

export interface SidebarSection {
  title: string;
  items: SidebarItem[];
}

export const sidebarSections: SidebarSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "Organization",
    items: [
      { label: "Organizations", href: "/organizations", icon: Building2 },
      { label: "Branches", href: "/branches", icon: GitBranch },
      { label: "Departments", href: "/departments", icon: Building },
    ],
  },
  {
    title: "Access Control",
    items: [
      { label: "Users", href: "/users", icon: Users },
      { label: "Roles", href: "/roles", icon: UserCog },
      { label: "Permissions", href: "/permissions", icon: Shield },
    ],
  },
  {
    title: "Members",
    items: [
      { label: "Members", href: "/members", icon: UserCheck },
      { label: "Member Accounts", href: "/member-accounts", icon: Wallet },
    ],
  },
  {
    title: "Financial Services",
    items: [
      { label: "Savings", href: "/savings", icon: PiggyBank },
      { label: "Shares", href: "/shares", icon: CircleDollarSign },
      { label: "Loans", href: "/loans", icon: HandCoins },
      { label: "Repayments", href: "/repayments", icon: Receipt },
      { label: "Contributions", href: "/contributions", icon: DollarSign },
      { label: "Fines", href: "/fines", icon: Scale },
      { label: "Penalties", href: "/penalties", icon: Siren },
    ],
  },
  {
    title: "Special Funds",
    items: [
      { label: "Unity Fund", href: "/unity-fund", icon: HeartHandshake },
      { label: "Emergency Fund", href: "/emergency-fund", icon: Tent },
      { label: "Table Banking", href: "/table-banking", icon: Handshake },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Projects", href: "/projects", icon: FolderKanban },
      { label: "Meetings", href: "/meetings", icon: Calendar },
      { label: "Voting", href: "/voting", icon: Vote },
      { label: "Approvals", href: "/approvals", icon: CheckSquare },
      { label: "Workflow", href: "/workflow", icon: Workflow },
    ],
  },
  {
    title: "Accounting",
    items: [
      { label: "Chart of Accounts", href: "/chart-of-accounts", icon: BookOpen },
      { label: "Journal Entries", href: "/journal-entries", icon: ScrollText },
      { label: "General Ledger", href: "/general-ledger", icon: BookOpenCheck },
      { label: "Trial Balance", href: "/trial-balance", icon: BarChart3 },
      { label: "Balance Sheet", href: "/balance-sheet", icon: LineChart },
      { label: "Income Statement", href: "/income-statement", icon: TrendingUp },
      { label: "Cash Flow", href: "/cash-flow", icon: PieChart },
      { label: "Budgets", href: "/budgets", icon: Landmark },
    ],
  },
  {
    title: "Procurement & Assets",
    items: [
      { label: "Procurement", href: "/procurement", icon: Package },
      { label: "Inventory", href: "/inventory", icon: Warehouse },
      { label: "Assets", href: "/assets", icon: Briefcase },
      { label: "Payroll", href: "/payroll", icon: WalletCards },
      { label: "HR", href: "/hr", icon: Users2 },
    ],
  },
  {
    title: "Business Relations",
    items: [
      { label: "Customers", href: "/customers", icon: Users2 },
      { label: "Suppliers", href: "/suppliers", icon: Truck },
      { label: "Vendors", href: "/vendors", icon: Store },
      { label: "Contracts", href: "/contracts", icon: FileText },
    ],
  },
  {
    title: "Communication",
    items: [
      { label: "Notifications", href: "/notifications", icon: Bell },
      { label: "Messages", href: "/messages", icon: MessageSquare },
      { label: "Documents", href: "/documents", icon: File },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { label: "Reports", href: "/reports", icon: FileBarChart },
      { label: "Audit", href: "/audit", icon: ShieldCheck },
      { label: "Risk", href: "/risk", icon: AlertTriangle },
      { label: "Fraud", href: "/fraud", icon: Ban },
      { label: "Compliance", href: "/compliance", icon: ClipboardCheck },
      { label: "AI Center", href: "/ai-center", icon: Cpu },
      { label: "Analytics", href: "/analytics", icon: BarChart4 },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Settings", href: "/settings", icon: Settings },
      { label: "Integrations", href: "/integrations", icon: Link },
      { label: "API Management", href: "/api-management", icon: Key },
      { label: "System Health", href: "/system-health", icon: Activity },
      { label: "Logs", href: "/logs", icon: FileJson },
      { label: "Backups", href: "/backups", icon: HardDrive },
      { label: "Developer Center", href: "/developer-center", icon: Code2 },
      { label: "Help Desk", href: "/help-desk", icon: LifeBuoy },
    ],
  },
];

export const quickActions = [
  { label: "New Member", icon: UserCheck, href: "/members/new", shortcut: "M" },
  { label: "New Loan", icon: HandCoins, href: "/loans/new", shortcut: "L" },
  { label: "New Savings", icon: PiggyBank, href: "/savings/new", shortcut: "S" },
  { label: "New Transaction", icon: Wallet, href: "/transactions/new", shortcut: "T" },
  { label: "New Meeting", icon: Calendar, href: "/meetings/new", shortcut: "E" },
  { label: "New Report", icon: FileBarChart, href: "/reports/new", shortcut: "R" },
];