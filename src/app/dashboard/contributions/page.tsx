'use client';

import { useEffect, useState } from 'react';

interface Member {
  id: string;
  member_number: string;
  first_name: string;
  last_name: string;
  phone: string;
}

interface Campaign {
  id: string;
  campaign_name: string;
  description: string | null;
  target_amount: number | null;
  collected_amount?: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
}

interface Contribution {
  id: string;
  member_id: string;
  member_name?: string;
  campaign_id: string;
  campaign_name?: string;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  reference: string | null;
}

interface ContributionStats {
  active_campaigns: number;
  total_contributions: number;
  total_target: number;
  completion_rate: number;
}

interface CampaignForm {
  campaign_name: string;
  description: string;
  target_amount: string;
  start_date: string;
  end_date: string;
}

interface ContributionForm {
  member_id: string;
  campaign_id: string;
  amount: string;
  payment_method: string;
  reference: string;
}

export default function ContributionsPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [stats, setStats] = useState<ContributionStats>({
    active_campaigns: 0,
    total_contributions: 0,
    total_target: 0,
    completion_rate: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'campaigns' | 'contributions'>('campaigns');
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [showContributionForm, setShowContributionForm] = useState(false);
  const [campaignForm, setCampaignForm] = useState<CampaignForm>({
    campaign_name: '',
    description: '',
    target_amount: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
  });
  const [contributionForm, setContributionForm] = useState<ContributionForm>({
    member_id: '',
    campaign_id: '',
    amount: '',
    payment_method: 'cash',
    reference: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [membersRes, campaignsRes] = await Promise.all([
        fetch('/api/members'),
        fetch('/api/contributions/campaigns'),
      ]);
      const membersData = await membersRes.json();
      const campaignsData = await campaignsRes.json();

      if (membersData.success) setMembers(membersData.data || []);
      if (campaignsData.success) {
        setCampaigns(campaignsData.data || []);
        calculateStats(campaignsData.data || []);
      }
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (campaignsData: Campaign[]) => {
    const activeCampaigns = campaignsData.filter((c) => c.is_active);
    const totalTarget = campaignsData.reduce((sum, c) => sum + (c.target_amount || 0), 0);
    const totalContributions = campaignsData.reduce((sum, c) => sum + (c.collected_amount || 0), 0);
    const completionRate = totalTarget > 0 ? (totalContributions / totalTarget) * 100 : 0;

    setStats({
      active_campaigns: activeCampaigns.length,
      total_contributions: totalContributions,
      total_target: totalTarget,
      completion_rate: completionRate,
    });
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignForm.campaign_name || !campaignForm.start_date) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/contributions/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_name: campaignForm.campaign_name,
          description: campaignForm.description,
          target_amount: campaignForm.target_amount ? parseFloat(campaignForm.target_amount) : undefined,
          start_date: campaignForm.start_date,
          end_date: campaignForm.end_date || undefined,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSubmitSuccess(true);
        setCampaignForm({
          campaign_name: '',
          description: '',
          target_amount: '',
          start_date: new Date().toISOString().split('T')[0],
          end_date: '',
        });
        setShowCampaignForm(false);
        fetchData();
        setTimeout(() => setSubmitSuccess(false), 3000);
      } else {
        setError(data.error || 'Failed to create campaign');
      }
    } catch {
      setError('Failed to create campaign');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitContribution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contributionForm.member_id || !contributionForm.campaign_id || !contributionForm.amount) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/contributions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: contributionForm.member_id,
          campaign_id: contributionForm.campaign_id,
          amount: parseFloat(contributionForm.amount),
          payment_method: contributionForm.payment_method,
          reference: contributionForm.reference,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSubmitSuccess(true);
        setContributionForm({
          member_id: '',
          campaign_id: '',
          amount: '',
          payment_method: 'cash',
          reference: '',
        });
        setShowContributionForm(false);
        fetchData();
        setTimeout(() => setSubmitSuccess(false), 3000);
      } else {
        setError(data.error || 'Failed to record contribution');
      }
    } catch {
      setError('Failed to record contribution');
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getCampaignProgress = (campaign: Campaign) => {
    if (!campaign.target_amount || campaign.target_amount === 0) return 0;
    const collected = campaign.collected_amount || 0;
    return Math.min((collected / campaign.target_amount) * 100, 100);
  };

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
          <div className="h-96 bg-gray-200 rounded-lg"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Contributions</h1>
          <p className="text-gray-500 mt-1">Manage campaigns and track member contributions</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setShowContributionForm(!showContributionForm);
              setShowCampaignForm(false);
            }}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            <span>💰</span>
            Record Contribution
          </button>
          <button
            onClick={() => {
              setShowCampaignForm(!showCampaignForm);
              setShowContributionForm(false);
            }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
          >
            <span>{showCampaignForm ? '✕' : '➕'}</span>
            New Campaign
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center text-2xl">
              🎯
            </div>
            <div>
              <p className="text-sm text-gray-500">Active Campaigns</p>
              <p className="text-2xl font-bold text-gray-900">{stats.active_campaigns}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center text-2xl">
              💵
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Contributions</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(stats.total_contributions)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-2xl">
              🎯
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Target</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(stats.total_target)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center text-2xl">
              📊
            </div>
            <div>
              <p className="text-sm text-gray-500">Completion Rate</p>
              <p className="text-2xl font-bold text-gray-900">{stats.completion_rate.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Campaign Form */}
      {showCampaignForm && (
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Create New Campaign</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {submitSuccess && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              Campaign created successfully!
            </div>
          )}

          <form onSubmit={handleCreateCampaign} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Campaign Name *
              </label>
              <input
                type="text"
                value={campaignForm.campaign_name}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, campaign_name: e.target.value }))}
                placeholder="e.g., Annual Welfare Fund 2024"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={campaignForm.description}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Campaign description..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Target Amount (KES)
              </label>
              <input
                type="number"
                value={campaignForm.target_amount}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, target_amount: e.target.value }))}
                placeholder="0.00"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date *
              </label>
              <input
                type="date"
                value={campaignForm.start_date}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, start_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={campaignForm.end_date}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, end_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCampaignForm(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Creating...
                  </>
                ) : (
                  <>
                    <span>🎯</span>
                    Create Campaign
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Contribution Form */}
      {showContributionForm && (
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Record Contribution</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {submitSuccess && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              Contribution recorded successfully!
            </div>
          )}

          <form onSubmit={handleSubmitContribution} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Member *
              </label>
              <select
                value={contributionForm.member_id}
                onChange={(e) => setContributionForm((prev) => ({ ...prev, member_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
              >
                <option value="">Select member...</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.first_name} {m.last_name} ({m.member_number})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Campaign *
              </label>
              <select
                value={contributionForm.campaign_id}
                onChange={(e) => setContributionForm((prev) => ({ ...prev, campaign_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
              >
                <option value="">Select campaign...</option>
                {campaigns.filter((c) => c.is_active).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.campaign_name}
                    {c.target_amount ? ` (Target: ${formatCurrency(c.target_amount)})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount (KES) *
              </label>
              <input
                type="number"
                value={contributionForm.amount}
                onChange={(e) => setContributionForm((prev) => ({ ...prev, amount: e.target.value }))}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Method
              </label>
              <select
                value={contributionForm.payment_method}
                onChange={(e) => setContributionForm((prev) => ({ ...prev, payment_method: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="cash">Cash</option>
                <option value="mpesa">M-Pesa</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reference
              </label>
              <input
                type="text"
                value={contributionForm.reference}
                onChange={(e) => setContributionForm((prev) => ({ ...prev, reference: e.target.value }))}
                placeholder="M-Pesa code or reference"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowContributionForm(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Recording...
                  </>
                ) : (
                  <>
                    <span>💰</span>
                    Record Contribution
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border mb-6">
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('campaigns')}
            className={`px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'campaigns'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Campaigns ({campaigns.length})
          </button>
          <button
            onClick={() => setActiveTab('contributions')}
            className={`px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'contributions'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            All Contributions
          </button>
        </div>
      </div>

      {/* Campaign Content */}
      {activeTab === 'campaigns' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {campaigns.length === 0 ? (
            <div className="col-span-full bg-white rounded-xl shadow-sm border p-12 text-center text-gray-500">
              <span className="text-4xl">🎯</span>
              <p className="mt-2">No campaigns yet</p>
              <button
                onClick={() => setShowCampaignForm(true)}
                className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Create First Campaign
              </button>
            </div>
          ) : (
            campaigns.map((campaign) => {
              const progress = getCampaignProgress(campaign);
              return (
                <div key={campaign.id} className="bg-white rounded-xl shadow-sm border overflow-hidden">
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-gray-900">{campaign.campaign_name}</h3>
                        {campaign.description && (
                          <p className="text-sm text-gray-500 mt-1">{campaign.description}</p>
                        )}
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        campaign.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {campaign.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-500">Progress</span>
                          <span className="font-medium text-gray-900">
                            {progress.toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-indigo-600 h-2 rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">
                          {formatCurrency(campaign.collected_amount || 0)}
                        </span>
                        <span className="text-gray-500">
                          {campaign.target_amount ? formatCurrency(campaign.target_amount) : 'No target'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t text-xs text-gray-500 flex justify-between">
                      <span>Start: {formatDate(campaign.start_date)}</span>
                      {campaign.end_date && (
                        <span>End: {formatDate(campaign.end_date)}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Contributions Table */}
      {activeTab === 'contributions' && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">
              All Contributions ({contributions.length})
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
                    Campaign
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment Method
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {contributions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      <span className="text-4xl">💰</span>
                      <p className="mt-2">No contributions yet</p>
                    </td>
                  </tr>
                ) : (
                  contributions.map((contribution) => (
                    <tr key={contribution.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {contribution.member_name || 'Unknown Member'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {contribution.campaign_name || 'Unknown Campaign'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-semibold text-green-600">
                          {formatCurrency(contribution.amount)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-500">
                          {contribution.payment_method || 'N/A'}
                        </div>
                        {contribution.reference && (
                          <div className="text-xs text-gray-400">
                            Ref: {contribution.reference}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(contribution.payment_date)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
