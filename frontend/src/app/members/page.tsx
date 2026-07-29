"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Search,
  Filter,
  Download,
  Upload,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  UserCheck,
  Users,
  UserX,
  UserPlus,
  ChevronDown,
} from "lucide-react";
import { cn, formatCurrency, formatDate, getInitials, getStatusColor, formatNumber } from "@/lib/utils";

const members = [
  { id: "1", memberNumber: "MEM-001", firstName: "John", lastName: "Kamau", email: "john.kamau@email.com", phone: "+254 712 345 678", status: "active", membershipType: "regular", joinedDate: "2023-01-15", savingsBalance: 450000, loanBalance: 200000, sharesValue: 50000 },
  { id: "2", memberNumber: "MEM-002", firstName: "Mary", lastName: "Wanjiku", email: "mary.w@email.com", phone: "+254 723 456 789", status: "active", membershipType: "premium", joinedDate: "2022-06-20", savingsBalance: 780000, loanBalance: 0, sharesValue: 120000 },
  { id: "3", memberNumber: "MEM-003", firstName: "Peter", lastName: "Ochieng", email: "peter.o@email.com", phone: "+254 734 567 890", status: "suspended", membershipType: "regular", joinedDate: "2023-03-10", savingsBalance: 120000, loanBalance: 350000, sharesValue: 25000 },
  { id: "4", memberNumber: "MEM-004", firstName: "Grace", lastName: "Muthoni", email: "grace.m@email.com", phone: "+254 745 678 901", status: "active", membershipType: "regular", joinedDate: "2024-02-01", savingsBalance: 250000, loanBalance: 100000, sharesValue: 75000 },
  { id: "5", memberNumber: "MEM-005", firstName: "David", lastName: "Kiprop", email: "david.k@email.com", phone: "+254 756 789 012", status: "inactive", membershipType: "honorary", joinedDate: "2021-09-05", savingsBalance: 1500000, loanBalance: 500000, sharesValue: 200000 },
  { id: "6", memberNumber: "MEM-006", firstName: "Sarah", lastName: "Chebet", email: "sarah.c@email.com", phone: "+254 767 890 123", status: "pending", membershipType: "associate", joinedDate: "2024-06-12", savingsBalance: 50000, loanBalance: 0, sharesValue: 10000 },
  { id: "7", memberNumber: "MEM-007", firstName: "James", lastName: "Kariuki", email: "james.k@email.com", phone: "+254 778 901 234", status: "active", membershipType: "premium", joinedDate: "2022-11-20", savingsBalance: 920000, loanBalance: 650000, sharesValue: 150000 },
  { id: "8", memberNumber: "MEM-008", firstName: "Faith", lastName: "Akinyi", email: "faith.a@email.com", phone: "+254 789 012 345", status: "active", membershipType: "regular", joinedDate: "2023-08-14", savingsBalance: 180000, loanBalance: 75000, sharesValue: 30000 },
];

export default function MembersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  const filteredMembers = members.filter((m) => {
    const matchesSearch = `${m.firstName} ${m.lastName} ${m.memberNumber} ${m.email}`
      .toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = selectedStatus === "all" || m.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  const toggleMember = (id: string) => {
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedMembers.length === filteredMembers.length) {
      setSelectedMembers([]);
    } else {
      setSelectedMembers(filteredMembers.map((m) => m.id));
    }
  };

  const statusCounts = {
    all: members.length,
    active: members.filter((m) => m.status === "active").length,
    pending: members.filter((m) => m.status === "pending").length,
    inactive: members.filter((m) => m.status === "inactive").length,
    suspended: members.filter((m) => m.status === "suspended").length,
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Members</h1>
          <p className="text-sm text-slate-500 mt-1">Manage all organization members</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">
            <Upload className="w-4 h-4" />
            Import
          </button>
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium">
            <Plus className="w-4 h-4" />
            Add Member
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {Object.entries(statusCounts).map(([key, count]) => (
          <button
            key={key}
            onClick={() => setSelectedStatus(key)}
            className={cn(
              "flex items-center gap-3 p-3 rounded-xl border transition-all",
              selectedStatus === key
                ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-emerald-200"
            )}
          >
            <div className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center",
              key === "all" && "bg-slate-100 dark:bg-slate-800",
              key === "active" && "bg-emerald-100 dark:bg-emerald-900/30",
              key === "pending" && "bg-amber-100 dark:bg-amber-900/30",
              key === "inactive" && "bg-slate-100 dark:bg-slate-800",
              key === "suspended" && "bg-red-100 dark:bg-red-900/30",
            )}>
              {key === "all" && <Users className="w-4 h-4 text-slate-600" />}
              {key === "active" && <UserCheck className="w-4 h-4 text-emerald-600" />}
              {key === "pending" && <UserPlus className="w-4 h-4 text-amber-600" />}
              {key === "inactive" && <UserX className="w-4 h-4 text-slate-600" />}
              {key === "suspended" && <UserX className="w-4 h-4 text-red-600" />}
            </div>
            <div className="text-left">
              <p className="text-xs text-slate-500 capitalize">{key === "all" ? "Total" : key}</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{count}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, ID, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">
            <Filter className="w-4 h-4" />
            Filters
            <ChevronDown className="w-3 h-3" />
          </button>
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedMembers.length === filteredMembers.length && filteredMembers.length > 0}
                    onChange={toggleAll}
                    className="rounded border-slate-300 dark:border-slate-600"
                  />
                </th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Member</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Contact</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Savings</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Loans</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Shares</th>
                <th className="w-12 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredMembers.map((member) => (
                <tr
                  key={member.id}
                  className={cn(
                    "hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors",
                    selectedMembers.includes(member.id) && "bg-emerald-50/50 dark:bg-emerald-900/10"
                  )}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(member.id)}
                      onChange={() => toggleMember(member.id)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white text-xs font-bold">
                        {getInitials(`${member.firstName} ${member.lastName}`)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {member.firstName} {member.lastName}
                        </p>
                        <p className="text-xs text-slate-400">{member.memberNumber}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-sm text-slate-600 dark:text-slate-400">{member.email}</p>
                    <p className="text-xs text-slate-400">{member.phone}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-sm capitalize text-slate-700 dark:text-slate-300">{member.membershipType}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn(
                      "inline-flex px-2 py-0.5 text-xs font-medium rounded-full border",
                      getStatusColor(member.status)
                    )}>
                      {member.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-medium text-slate-900 dark:text-white">
                    {formatCurrency(member.savingsBalance)}
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-medium text-slate-900 dark:text-white">
                    {formatCurrency(member.loanBalance)}
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-medium text-slate-900 dark:text-white">
                    {formatCurrency(member.sharesValue)}
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
        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700">
          <p className="text-sm text-slate-500">{filteredMembers.length} members</p>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">Previous</button>
            <button className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white">1</button>
            <button className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">2</button>
            <button className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">3</button>
            <button className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">Next</button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}