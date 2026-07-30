"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Download,
  Upload,
  MoreHorizontal,
  UserCheck,
  Users,
  UserX,
  UserPlus,
  Filter,
  ChevronDown,
} from "lucide-react";
import { cn, formatCurrency, getInitials } from "@/lib/utils";
import { Button, IconButton } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StatusBadge } from "@/components/ui/Badge";

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

function StatusIcon({ status, className }: { status: string; className?: string }) {
  switch (status) {
    case "all":
      return <Users className={className} />;
    case "active":
      return <UserCheck className={className} />;
    case "pending":
      return <UserPlus className={className} />;
    case "inactive":
    case "suspended":
      return <UserX className={className} />;
    default:
      return <Users className={className} />;
  }
}

function getStatusColors(status: string) {
  switch (status) {
    case "active":
      return { bg: "bg-primary-100 dark:bg-primary-900/30", text: "text-primary-600" };
    case "pending":
      return { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-600" };
    case "inactive":
      return { bg: "bg-neutral-100 dark:bg-neutral-800", text: "text-neutral-600" };
    case "suspended":
      return { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-600" };
    default:
      return { bg: "bg-neutral-100 dark:bg-neutral-800", text: "text-neutral-600" };
  }
}

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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-0">Members</h1>
          <p className="text-sm text-neutral-500 mt-1">Manage all organization members</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Upload className="w-4 h-4" />
            Import
          </Button>
          <Button size="sm">
            <Plus className="w-4 h-4" />
            Add Member
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {Object.entries(statusCounts).map(([key, count]) => {
          const colors = getStatusColors(key);
          return (
            <button
              key={key}
              onClick={() => setSelectedStatus(key)}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border transition-all",
                selectedStatus === key
                  ? "bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800"
                  : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 hover:border-primary-200"
              )}
            >
              <div className={cn("w-8 h-8 rounded-md flex items-center justify-center", colors.bg)}>
                <StatusIcon status={key} className={cn("w-4 h-4", colors.text)} />
              </div>
              <div className="text-left">
                <p className="text-[11px] text-neutral-500 capitalize">{key === "all" ? "Total" : key}</p>
                <p className="text-base font-bold text-neutral-900 dark:text-neutral-0">{count}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Input
            placeholder="Search by name, ID, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Filter className="w-4 h-4" />
            Filters
            <ChevronDown className="w-3 h-3 ml-1" />
          </Button>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedMembers.length === filteredMembers.length && filteredMembers.length > 0}
                    onChange={toggleAll}
                    className="rounded border-neutral-300 dark:border-neutral-600 text-primary-600 focus:ring-primary-500"
                  />
                </th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Member</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Contact</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Type</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Savings</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Loans</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Shares</th>
                <th className="w-10 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filteredMembers.map((member) => (
                <tr
                  key={member.id}
                  className={cn(
                    "hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors",
                    selectedMembers.includes(member.id) && "bg-primary-50/50 dark:bg-primary-900/10"
                  )}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(member.id)}
                      onChange={() => toggleMember(member.id)}
                      className="rounded border-neutral-300 dark:border-neutral-600 text-primary-600 focus:ring-primary-500"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white text-xs font-bold">
                        {getInitials(`${member.firstName} ${member.lastName}`)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-0">
                          {member.firstName} {member.lastName}
                        </p>
                        <p className="text-xs text-neutral-400">{member.memberNumber}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">{member.email}</p>
                    <p className="text-xs text-neutral-400">{member.phone}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-sm capitalize text-neutral-700 dark:text-neutral-300">{member.membershipType}</span>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={member.status as any} size="sm" />
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-medium text-neutral-900 dark:text-neutral-0">
                    {formatCurrency(member.savingsBalance)}
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-medium text-neutral-900 dark:text-neutral-0">
                    {formatCurrency(member.loanBalance)}
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-medium text-neutral-900 dark:text-neutral-0">
                    {formatCurrency(member.sharesValue)}
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
        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 dark:border-neutral-800">
          <p className="text-sm text-neutral-500">{filteredMembers.length} members</p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
            <Button size="sm">
              1
            </Button>
            <Button variant="outline" size="sm">
              2
            </Button>
            <Button variant="outline" size="sm">
              3
            </Button>
            <Button variant="outline" size="sm">
              Next
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
