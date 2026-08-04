'use client';

import { useEffect, useState } from 'react';

interface Statement {
  id: string;
  statement_ref: string;
  statement_type: string;
  period_start: string;
  period_end: string;
  recipient_name: string;
  recipient_email: string;
  title: string;
  status: string;
  email_sent: boolean;
  download_count: number;
  created_at: string;
}

interface Member {
  id: string;
  member_number: string;
  first_name: string;
  last_name: string;
  email: string | null;
}

export default function StatementsPage() {
  const [loading, setLoading] = useState(true);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateForm, setGenerateForm] = useState({
    statement_type: 'member_monthly',
    member_id: '',
    period_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    period_end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0],
    deliver_email: true,
  });
  const [generationResult, setGenerationResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch statements
      const statementsRes = await fetch('/api/notifications/statements');
      const statementsData = await statementsRes.json();
      if (statementsData.success) {
        setStatements(statementsData.data || []);
      }

      // Fetch members for dropdown
      const membersRes = await fetch('/api/members?limit=100');
      const membersData = await membersRes.json();
      if (membersData.success) {
        setMembers(membersData.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
    setLoading(false);
  };

  const handleGenerateStatement = async () => {
    if (!generateForm.member_id) {
      alert('Please select a member');
      return;
    }

    setGenerating(true);
    setGenerationResult(null);

    try {
      const member = members.find(m => m.id === generateForm.member_id);
      
      const res = await fetch('/api/notifications/statements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statement_type: generateForm.statement_type,
          period_start: generateForm.period_start,
          period_end: generateForm.period_end,
          recipient_type: 'member',
          recipient_id: generateForm.member_id,
          recipient_email: member?.email || undefined,
          recipient_name: member ? `${member.first_name} ${member.last_name}` : undefined,
          deliver: generateForm.deliver_email,
        }),
      });
      const data = await res.json();
      
      if (data.success) {
        setGenerationResult({ 
          success: true, 
          message: generateForm.deliver_email 
            ? 'Statement generated and delivered successfully!' 
            : 'Statement generated successfully!' 
        });
        fetchData();
      } else {
        setGenerationResult({ success: false, message: data.error || 'Failed to generate statement' });
      }
    } catch (error) {
      setGenerationResult({ success: false, message: 'Failed to generate statement' });
    }
    setGenerating(false);
  };

  const getStatementTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      member_weekly: 'Weekly Statement',
      member_monthly: 'Monthly Statement',
      member_quarterly: 'Quarterly Statement',
      member_annual: 'Annual Statement',
      loan_statement: 'Loan Statement',
      savings_statement: 'Savings Statement',
      contribution_statement: 'Contribution Statement',
      welfare_statement: 'Welfare Statement',
      organization_summary: 'Organization Summary',
      custom: 'Custom Statement',
    };
    return labels[type] || type;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return 'bg-green-100 text-green-800';
      case 'generating': return 'bg-blue-100 text-blue-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⚙️</div>
          <p className="text-gray-600">Loading statements...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">📄 Financial Statements</h1>
          <p className="text-gray-600 mt-1">Generate and manage financial statements from live data</p>
        </div>
        <button
          onClick={() => {
            setShowGenerateModal(true);
            setGenerationResult(null);
          }}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          + Generate Statement
        </button>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <button
          onClick={() => {
            setGenerateForm({
              ...generateForm,
              statement_type: 'member_monthly',
              period_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
              period_end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0],
            });
            setShowGenerateModal(true);
          }}
          className="bg-white rounded-xl shadow p-6 hover:shadow-lg transition-shadow text-left"
        >
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-2xl mb-4">📊</div>
          <h3 className="font-semibold text-gray-900">Monthly Statement</h3>
          <p className="text-sm text-gray-600 mt-1">Generate monthly account summary</p>
        </button>

        <button
          onClick={() => {
            setGenerateForm({
              ...generateForm,
              statement_type: 'loan_statement',
              period_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
              period_end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0],
            });
            setShowGenerateModal(true);
          }}
          className="bg-white rounded-xl shadow p-6 hover:shadow-lg transition-shadow text-left"
        >
          <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center text-2xl mb-4">🏦</div>
          <h3 className="font-semibold text-gray-900">Loan Statement</h3>
          <p className="text-sm text-gray-600 mt-1">Generate loan repayment summary</p>
        </button>

        <button
          onClick={() => {
            setGenerateForm({
              ...generateForm,
              statement_type: 'organization_summary',
              period_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
              period_end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0],
            });
            setShowGenerateModal(true);
          }}
          className="bg-white rounded-xl shadow p-6 hover:shadow-lg transition-shadow text-left"
        >
          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center text-2xl mb-4">📈</div>
          <h3 className="font-semibold text-gray-900">Organization Summary</h3>
          <p className="text-sm text-gray-600 mt-1">Generate org-wide financial summary</p>
        </button>
      </div>

      {/* Statement Types Guide */}
      <div className="bg-white rounded-xl shadow p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">Available Statement Types</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { type: 'member_weekly', label: 'Weekly', icon: '📅' },
            { type: 'member_monthly', label: 'Monthly', icon: '📊' },
            { type: 'member_quarterly', label: 'Quarterly', icon: '📉' },
            { type: 'member_annual', label: 'Annual', icon: '📆' },
            { type: 'loan_statement', label: 'Loan', icon: '🏦' },
            { type: 'savings_statement', label: 'Savings', icon: '💰' },
            { type: 'contribution_statement', label: 'Contribution', icon: '🎯' },
            { type: 'welfare_statement', label: 'Welfare', icon: '🛡️' },
            { type: 'organization_summary', label: 'Organization', icon: '🏢' },
          ].map((item) => (
            <div key={item.type} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
              <span className="text-xl">{item.icon}</span>
              <span className="text-sm font-medium text-gray-700">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Statements */}
      <div className="bg-white rounded-xl shadow">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Recent Statements</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Statement</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Type</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Period</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Recipient</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Status</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Email</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Date</th>
              </tr>
            </thead>
            <tbody>
              {statements.length > 0 ? statements.map((statement) => (
                <tr key={statement.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <p className="font-medium text-gray-900">{statement.title}</p>
                    <p className="text-xs text-gray-500">{statement.statement_ref}</p>
                  </td>
                  <td className="py-3 px-4 text-sm">
                    {getStatementTypeLabel(statement.statement_type)}
                  </td>
                  <td className="py-3 px-4 text-sm">
                    {formatDate(statement.period_start)} - {formatDate(statement.period_end)}
                  </td>
                  <td className="py-3 px-4">
                    <p className="text-sm">{statement.recipient_name || 'N/A'}</p>
                    <p className="text-xs text-gray-500">{statement.recipient_email || ''}</p>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(statement.status)}`}>
                      {statement.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {statement.email_sent ? (
                      <span className="text-green-600">✓ Sent</span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500">
                    {formatDate(statement.created_at)}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    <div className="text-4xl mb-4">📄</div>
                    <p>No statements generated yet</p>
                    <p className="text-sm mt-1">Generated statements will appear here</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generate Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Generate Statement</h2>
                <button onClick={() => setShowGenerateModal(false)} className="text-gray-400 hover:text-gray-600">
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {generationResult && (
                <div className={`p-4 rounded-lg ${generationResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                  {generationResult.message}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Statement Type *
                </label>
                <select
                  value={generateForm.statement_type}
                  onChange={(e) => setGenerateForm({ ...generateForm, statement_type: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <optgroup label="Member Statements">
                    <option value="member_weekly">Weekly Statement</option>
                    <option value="member_monthly">Monthly Statement</option>
                    <option value="member_quarterly">Quarterly Statement</option>
                    <option value="member_annual">Annual Statement</option>
                  </optgroup>
                  <optgroup label="Financial Statements">
                    <option value="loan_statement">Loan Statement</option>
                    <option value="savings_statement">Savings Statement</option>
                    <option value="contribution_statement">Contribution Statement</option>
                    <option value="welfare_statement">Welfare Statement</option>
                  </optgroup>
                  <optgroup label="Reports">
                    <option value="organization_summary">Organization Summary</option>
                  </optgroup>
                </select>
              </div>

              {!generateForm.statement_type.includes('organization') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Member *
                  </label>
                  <select
                    value={generateForm.member_id}
                    onChange={(e) => setGenerateForm({ ...generateForm, member_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">Choose a member...</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.member_number} - {member.first_name} {member.last_name}
                        {member.email ? ` (${member.email})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Period Start *
                  </label>
                  <input
                    type="date"
                    value={generateForm.period_start}
                    onChange={(e) => setGenerateForm({ ...generateForm, period_start: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Period End *
                  </label>
                  <input
                    type="date"
                    value={generateForm.period_end}
                    onChange={(e) => setGenerateForm({ ...generateForm, period_end: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="deliver_email"
                  checked={generateForm.deliver_email}
                  onChange={(e) => setGenerateForm({ ...generateForm, deliver_email: e.target.checked })}
                  className="rounded text-indigo-600"
                />
                <label htmlFor="deliver_email" className="text-sm text-gray-700">
                  Deliver via email
                </label>
              </div>

              <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">How it works</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Statements are generated from live transaction data</li>
                  <li>• All balances are calculated in real-time</li>
                  <li>• Professional HTML email sent with statement details</li>
                  <li>• Recipients can download full statement from portal</li>
                </ul>
              </div>
            </div>

            <div className="p-6 border-t bg-gray-50 rounded-b-2xl">
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowGenerateModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-100"
                >
                  Close
                </button>
                <button
                  onClick={handleGenerateStatement}
                  disabled={generating || (!generateForm.member_id && !generateForm.statement_type.includes('organization'))}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {generating ? 'Generating...' : 'Generate & Deliver'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
