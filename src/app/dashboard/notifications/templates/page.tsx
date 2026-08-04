'use client';

import { useEffect, useState } from 'react';

interface Template {
  id: string;
  template_code: string;
  name: string;
  description: string;
  category_id: string;
  channels: string[];
  subject_template: string;
  body_template: string;
  priority: string;
  is_active: boolean;
  version: number;
  created_at: string;
  category?: { id: string; name: string; color: string };
}

interface Category {
  id: string;
  code: string;
  name: string;
  color: string;
}

export default function TemplatesPage() {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filter, setFilter] = useState({ category: '', status: '', search: '' });
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<Record<string, string>>({});
  const [previewResult, setPreviewResult] = useState<{ subject: string; body: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [templatesRes, categoriesRes] = await Promise.all([
        fetch('/api/notifications/templates'),
        fetch('/api/notifications/templates/categories').catch(() => ({ json: () => ({ success: true, data: [] }) })),
      ]);

      const templatesData = await templatesRes.json();
      const categoriesData = await categoriesRes.json();

      if (templatesData.success) {
        setTemplates(templatesData.data || []);
      }
      if (categoriesData.success) {
        setCategories(categoriesData.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
    setLoading(false);
  };

  const handleToggleActive = async (template: Template) => {
    try {
      const action = template.is_active ? 'deactivate' : 'activate';
      await fetch(`/api/notifications/templates/${action}?id=${template.id}`, { method: 'POST' });
      fetchData();
    } catch (error) {
      console.error('Failed to toggle template:', error);
    }
  };

  const handlePreview = async () => {
    if (!selectedTemplate) return;
    try {
      const res = await fetch('/api/notifications/templates/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: selectedTemplate.id,
          variables: previewData,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPreviewResult(data.data);
      }
    } catch (error) {
      console.error('Failed to preview:', error);
    }
  };

  const filteredTemplates = templates.filter((t) => {
    if (filter.category && t.category_id !== filter.category) return false;
    if (filter.status === 'active' && !t.is_active) return false;
    if (filter.status === 'inactive' && t.is_active) return false;
    if (filter.search && !t.name.toLowerCase().includes(filter.search.toLowerCase()) && !t.template_code.toLowerCase().includes(filter.search.toLowerCase())) return false;
    return true;
  });

  const getCategoryColor = (color: string) => {
    const colorMap: Record<string, string> = {
      '#10B981': 'bg-emerald-100 text-emerald-800',
      '#3B82F6': 'bg-blue-100 text-blue-800',
      '#F59E0B': 'bg-amber-100 text-amber-800',
      '#EC4899': 'bg-pink-100 text-pink-800',
      '#8B5CF6': 'bg-violet-100 text-violet-800',
      '#EF4444': 'bg-red-100 text-red-800',
      '#06B6D4': 'bg-cyan-100 text-cyan-800',
      '#64748B': 'bg-slate-100 text-slate-800',
      '#6B7280': 'bg-gray-100 text-gray-800',
      '#DC2626': 'bg-red-100 text-red-800',
    };
    return colorMap[color] || 'bg-gray-100 text-gray-800';
  };

  const extractVariables = (template: Template): string[] => {
    const subjectVars = template.subject_template?.match(/\{\{(\w+)\}\}/g) || [];
    const bodyVars = template.body_template?.match(/\{\{(\w+)\}\}/g) || [];
    const allVars = [...subjectVars, ...bodyVars];
    const uniqueVars: string[] = [];
    const seen = new Set<string>();
    for (const v of allVars) {
      const name = v.replace(/\{\{|\}\}/g, '');
      if (!seen.has(name)) {
        seen.add(name);
        uniqueVars.push(name);
      }
    }
    return uniqueVars;
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⚙️</div>
          <p className="text-gray-600">Loading templates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">📝 Notification Templates</h1>
          <p className="text-gray-600 mt-1">Manage notification templates with placeholders</p>
        </div>
        <button
          onClick={() => {
            setSelectedTemplate(null);
            setShowPreview(true);
            setPreviewResult(null);
            setPreviewData({});
          }}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          + Create Template
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search templates..."
              value={filter.search}
              onChange={(e) => setFilter({ ...filter, search: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <select
            value={filter.status}
            onChange={(e) => setFilter({ ...filter, status: e.target.value })}
            className="px-3 py-2 border rounded-lg"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTemplates.map((template) => (
          <div key={template.id} className="bg-white rounded-xl shadow overflow-hidden hover:shadow-lg transition-shadow">
            <div className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{template.name}</h3>
                  <code className="text-xs text-gray-500">{template.template_code}</code>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${template.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                  {template.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              
              <p className="text-sm text-gray-600 mb-3 line-clamp-2">{template.description || 'No description'}</p>

              <div className="flex flex-wrap gap-1 mb-3">
                {template.channels?.map((channel) => (
                  <span key={channel} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                    {channel}
                  </span>
                ))}
                <span className={`px-2 py-0.5 rounded text-xs ${getCategoryColor(template.category?.color || '#6B7280')}`}>
                  {template.category?.name || 'Uncategorized'}
                </span>
              </div>

              <div className="text-xs text-gray-500 mb-3">
                <span className="bg-gray-100 px-2 py-0.5 rounded mr-2">v{template.version}</span>
                <span>Priority: {template.priority}</span>
              </div>

              <div className="text-xs text-gray-500 mb-3">
                <span className="font-medium">Variables:</span>{' '}
                {extractVariables(template).slice(0, 3).join(', ')}
                {extractVariables(template).length > 3 && ` +${extractVariables(template).length - 3} more`}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSelectedTemplate(template);
                    setShowPreview(true);
                    setPreviewResult(null);
                    const vars = extractVariables(template);
                    const initialData: Record<string, string> = {};
                    vars.forEach(v => { initialData[v] = ''; });
                    setPreviewData(initialData);
                  }}
                  className="flex-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-sm hover:bg-indigo-100"
                >
                  Preview
                </button>
                <button
                  onClick={() => handleToggleActive(template)}
                  className="flex-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
                >
                  {template.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredTemplates.length === 0 && (
        <div className="bg-white rounded-xl shadow p-12 text-center">
          <div className="text-6xl mb-4">📝</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Templates Found</h3>
          <p className="text-gray-600">
            {filter.search || filter.status || filter.category
              ? 'Try adjusting your filters'
              : 'Templates will appear after database migration is applied'}
          </p>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-auto">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">
                  {selectedTemplate ? 'Preview Template' : 'Create Template'}
                </h2>
                <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600">
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6">
              {selectedTemplate ? (
                <>
                  <div className="mb-6">
                    <h3 className="font-medium mb-2">Template: {selectedTemplate.name}</h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm text-gray-600 mb-2">
                        <strong>Subject:</strong> {selectedTemplate.subject_template}
                      </p>
                      <p className="text-sm text-gray-600">
                        <strong>Body:</strong> {selectedTemplate.body_template.substring(0, 200)}...
                      </p>
                    </div>
                  </div>

                  <div className="mb-6">
                    <h3 className="font-medium mb-3">Fill Variable Values</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {Object.keys(previewData).map((key) => (
                        <div key={key}>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {key}
                          </label>
                          <input
                            type="text"
                            value={previewData[key]}
                            onChange={(e) => setPreviewData({ ...previewData, [key]: e.target.value })}
                            placeholder={`Enter ${key}...`}
                            className="w-full px-3 py-2 border rounded-lg"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {previewResult && (
                    <div className="mb-6">
                      <h3 className="font-medium mb-3">Rendered Output</h3>
                      <div className="bg-blue-50 rounded-lg p-4">
                        <p className="text-sm font-medium text-blue-900 mb-2">Subject:</p>
                        <p className="text-blue-800 mb-4">{previewResult.subject}</p>
                        <p className="text-sm font-medium text-blue-900 mb-2">Body:</p>
                        <p className="text-blue-800 whitespace-pre-wrap">{previewResult.body}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={handlePreview}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                      Generate Preview
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📝</div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Template Creation</h3>
                  <p className="text-gray-600 mb-4">
                    Template creation is done via API or direct database access.
                    Run the migration to create default templates.
                  </p>
                  <div className="bg-gray-50 rounded-lg p-4 text-left">
                    <p className="text-sm font-medium mb-2">Required Database Tables:</p>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• notification_templates</li>
                      <li>• notification_categories</li>
                      <li>• notification_channels</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
