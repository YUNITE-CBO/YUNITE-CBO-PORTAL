'use client';

import { useEffect, useState } from 'react';

interface Member {
  id: string;
  member_number: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string;
  status: string;
  registration_date: string;
  compliance_score?: number;
  total_requirements?: number;
  completed_requirements?: number;
  compliance?: ComplianceRecord[];
}

interface ComplianceRecord {
  id: string;
  member_id: string;
  compliance_type: string;
  category_code: string;
  category_name: string;
  description: string | null;
  status: string;
  due_date: string | null;
  completed_date: string | null;
  reviewed_by_name: string | null;
  review_notes: string | null;
}

interface ComplianceSummary {
  total_members: number;
  fully_compliant: number;
  partially_compliant: number;
  non_compliant: number;
  compliance_rate: number;
}

export default function CompliancePage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [complianceData, setComplianceData] = useState<Record<string, ComplianceRecord[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Use batch endpoint to fetch all compliance data in a single query (fixes N+1)
      const response = await fetch('/api/compliance?batch=true');
      const data = await response.json();

      if (data.success) {
        const memberData: Member[] = data.data || [];

        // Build compliance map from batch response
        const complianceMap: Record<string, ComplianceRecord[]> = {};
        memberData.forEach((member: Member) => {
          complianceMap[member.id] = member.compliance || [];
        });

        setMembers(memberData);
        setComplianceData(complianceMap);
      }
    } catch {
      setError('Failed to load compliance data');
    } finally {
      setLoading(false);
    }
  };

  const calculateComplianceScore = (records: ComplianceRecord[]) => {
    if (records.length === 0) return 0;
    const completed = records.filter(r => r.status === 'approved' || r.status === 'complete').length;
    return Math.round((completed / records.length) * 100);
  };

  const getMemberComplianceStatus = (records: ComplianceRecord[], member?: any) => {
    // Use pre-calculated status if available from batch API
    if (member?.compliance_status) {
      const statusMap: Record<string, any> = {
        'compliant': { status: 'compliant', label: 'Fully Compliant', color: 'green' },
        'partial': { status: 'partial', label: 'Partially Compliant', color: 'yellow' },
        'non_compliant': { status: 'non_compliant', label: 'Non-Compliant', color: 'red' },
        'pending': { status: 'pending', label: 'Pending', color: 'gray' },
      };
      return statusMap[member.compliance_status] || { status: 'pending', label: 'Pending', color: 'gray' };
    }

    // Fallback to calculating from records
    const score = calculateComplianceScore(records);
    if (score === 100) return { status: 'compliant', label: 'Fully Compliant', color: 'green' };
    if (score >= 50) return { status: 'partial', label: 'Partially Compliant', color: 'yellow' };
    if (records.length > 0) return { status: 'non_compliant', label: 'Non-Compliant', color: 'red' };
    return { status: 'pending', label: 'Pending', color: 'gray' };
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string }> = {
      approved: { bg: 'bg-green-100', text: 'text-green-800' },
      complete: { bg: 'bg-green-100', text: 'text-green-800' },
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
      pending_review: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
      rejected: { bg: 'bg-red-100', text: 'text-red-800' },
      missing: { bg: 'bg-red-100', text: 'text-red-800' },
      expired: { bg: 'bg-red-100', text: 'text-red-800' },
      submitted: { bg: 'bg-blue-100', text: 'text-blue-800' },
    };
    const style = styles[status] || { bg: 'bg-gray-100', text: 'text-gray-800' };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
        {status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
      </span>
    );
  };

  // Calculate summary stats
  const summary: ComplianceSummary = {
    total_members: members.length,
    fully_compliant: 0,
    partially_compliant: 0,
    non_compliant: 0,
    compliance_rate: 0,
  };

  members.forEach(member => {
    const records = complianceData[member.id] || [];
    const memberStatus = getMemberComplianceStatus(records, member);
    if (memberStatus.status === 'compliant') summary.fully_compliant++;
    else if (memberStatus.status === 'partial') summary.partially_compliant++;
    else if (memberStatus.status === 'non_compliant') summary.non_compliant++;
    else if (memberStatus.status === 'pending') summary.partially_compliant++; // Pending = not yet started
  });

  summary.compliance_rate = summary.total_members > 0
    ? Math.round((summary.fully_compliant / summary.total_members) * 100)
    : 0;

  const filteredMembers = members.filter(member => {
    const matchesSearch = !searchQuery ||
      member.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.last_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.member_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.phone.includes(searchQuery);

    const records = complianceData[member.id] || [];
    const status = getMemberComplianceStatus(records, member);
    const matchesStatus = statusFilter === 'all' || status.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Compliance Management</h1>
          <p className="text-gray-500 mt-1">Track and manage member compliance requirements</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-sm text-gray-500">Total Members</p>
          <p className="text-2xl font-bold text-gray-900">{summary.total_members}</p>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-4 text-white">
          <p className="text-green-100 text-sm">Fully Compliant</p>
          <p className="text-2xl font-bold">{summary.fully_compliant}</p>
        </div>

        <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl shadow-lg p-4 text-white">
          <p className="text-yellow-100 text-sm">Partially Compliant</p>
          <p className="text-2xl font-bold">{summary.partially_compliant}</p>
        </div>

        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg p-4 text-white">
          <p className="text-red-100 text-sm">Non-Compliant</p>
          <p className="text-2xl font-bold">{summary.non_compliant}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-4 flex flex-col justify-center">
          <p className="text-sm text-gray-500 text-center">Compliance Rate</p>
          <p className="text-3xl font-bold text-indigo-600 text-center">{summary.compliance_rate}%</p>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div 
              className="bg-indigo-600 h-2 rounded-full transition-all"
              style={{ width: `${summary.compliance_rate}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 flex items-center gap-3">
          <span className="text-xl">⚠️</span>
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by name, member number, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="flex gap-2">
            {(['all', 'compliant', 'partial', 'non_compliant'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === filter
                    ? filter === 'compliant'
                      ? 'bg-green-100 text-green-800'
                      : filter === 'partial'
                      ? 'bg-yellow-100 text-yellow-800'
                      : filter === 'non_compliant'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-indigo-100 text-indigo-800'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {filter === 'all' ? 'All' : 
                 filter === 'compliant' ? 'Compliant' :
                 filter === 'partial' ? 'Partial' : 'Non-Compliant'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Members Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Member Compliance ({filteredMembers.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Member
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Score
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Requirements
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <span className="text-4xl">📋</span>
                    <p className="mt-2">No members found</p>
                  </td>
                </tr>
              ) : (
                filteredMembers.map((member) => {
                  const records = complianceData[member.id] || [];
                  const complianceStatus = getMemberComplianceStatus(records, member);
                  const score = calculateComplianceScore(records);
                  const completedCount = records.filter(r => r.status === 'approved' || r.status === 'complete').length;
                  
                  return (
                    <tr key={member.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-medium">
                            {member.first_name[0]}{member.last_name[0]}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">{member.first_name} {member.last_name}</div>
                            <div className="text-sm text-gray-500">{member.member_number}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          complianceStatus.color === 'green' ? 'bg-green-100 text-green-800' :
                          complianceStatus.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                          complianceStatus.color === 'red' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {complianceStatus.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-gray-200 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full ${
                                score >= 80 ? 'bg-green-500' :
                                score >= 50 ? 'bg-yellow-500' :
                                'bg-red-500'
                              }`}
                              style={{ width: `${score}%` }}
                            ></div>
                          </div>
                          <span className="text-sm font-medium">{score}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-600">
                          {completedCount} / {records.length || '-'} complete
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => setSelectedMember(member)}
                          className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                        >
                          View Details →
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Member Compliance Detail Modal */}
      {selectedMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6 border-b sticky top-0 bg-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-medium text-lg">
                    {selectedMember.first_name[0]}{selectedMember.last_name[0]}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {selectedMember.first_name} {selectedMember.last_name}
                    </h3>
                    <p className="text-sm text-gray-500">{selectedMember.member_number}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedMember(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6">
              {(() => {
                const records = complianceData[selectedMember.id] || [];
                const score = calculateComplianceScore(records);
                const status = getMemberComplianceStatus(records, selectedMember);
                
                return (
                  <>
                    {/* Compliance Score */}
                    <div className="bg-gray-50 rounded-xl p-6 mb-6">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-semibold text-gray-900">Compliance Score</h4>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          status.color === 'green' ? 'bg-green-100 text-green-800' :
                          status.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="relative w-24 h-24">
                          <svg className="w-24 h-24 transform -rotate-90">
                            <circle
                              cx="48"
                              cy="48"
                              r="40"
                              stroke="currentColor"
                              strokeWidth="8"
                              fill="none"
                              className="text-gray-200"
                            />
                            <circle
                              cx="48"
                              cy="48"
                              r="40"
                              stroke="currentColor"
                              strokeWidth="8"
                              fill="none"
                              className={`transform -rotate-90 transition-all ${
                                score >= 80 ? 'text-green-500' :
                                score >= 50 ? 'text-yellow-500' :
                                'text-red-500'
                              }`}
                              strokeDasharray={`${score * 2.51} 251`}
                              strokeLinecap="round"
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-2xl font-bold text-gray-900">{score}%</span>
                          </div>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-gray-600 mb-2">
                            {records.filter(r => r.status === 'approved' || r.status === 'complete').length} of {records.length} requirements met
                          </p>
                          <div className="w-full bg-gray-200 rounded-full h-3">
                            <div 
                              className={`h-3 rounded-full transition-all ${
                                score >= 80 ? 'bg-green-500' :
                                score >= 50 ? 'bg-yellow-500' :
                                'bg-red-500'
                              }`}
                              style={{ width: `${score}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Requirements List */}
                    <h4 className="font-semibold text-gray-900 mb-4">Compliance Requirements</h4>
                    <div className="space-y-3">
                      {records.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <span className="text-4xl">📋</span>
                          <p className="mt-2">No compliance requirements found</p>
                        </div>
                      ) : (
                        records.map((record) => (
                          <div key={record.id} className="border border-gray-200 rounded-lg p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                  record.status === 'approved' || record.status === 'complete'
                                    ? 'bg-green-100 text-green-600'
                                    : record.status === 'pending' || record.status === 'pending_review'
                                    ? 'bg-yellow-100 text-yellow-600'
                                    : 'bg-gray-100 text-gray-400'
                                }`}>
                                  {record.status === 'approved' || record.status === 'complete' ? '✓' :
                                   record.status === 'pending' || record.status === 'pending_review' ? '⏳' : '○'}
                                </div>
                                <div>
                                  <p className="font-medium text-gray-900">{record.category_name}</p>
                                  {record.description && (
                                    <p className="text-sm text-gray-500 mt-1">{record.description}</p>
                                  )}
                                  {record.due_date && (
                                    <p className="text-xs text-gray-400 mt-2">
                                      Due: {formatDate(record.due_date)}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                {getStatusBadge(record.status)}
                                {record.reviewed_by_name && (
                                  <p className="text-xs text-gray-400 mt-1">
                                    Reviewed by {record.reviewed_by_name}
                                  </p>
                                )}
                                {record.review_notes && (
                                  <p className="text-xs text-gray-500 mt-1 max-w-xs text-right">
                                    {record.review_notes}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="p-6 border-t bg-gray-50 flex justify-end">
              <button
                onClick={() => setSelectedMember(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
