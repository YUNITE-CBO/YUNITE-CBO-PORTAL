'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AutofillFromSubmissionsModal, { AutofillData } from '@/components/members/AutofillFromSubmissionsModal';

interface Member {
  id: string;
  member_number: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string;
  status: 'pending' | 'active' | 'suspended' | 'withdrawn' | 'deceased';
  registration_date: string;
  created_at: string;
}

interface RegistrationForm {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  alt_phone: string;
  alt_email: string;
  id_number: string;
  kra_pin: string;
  date_of_birth: string;
  gender: 'male' | 'female' | 'other';
  marital_status: string;
  nationality: string;
  physical_address: string;
  postal_address: string;
  occupation: string;
  employer: string;
  employer_address: string;
  next_of_kin_name: string;
  next_of_kin_phone: string;
  next_of_kin_relationship: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [autofillOpen, setAutofillOpen] = useState(false);
  const [activeSubmission, setActiveSubmission] = useState<{ id: string; reference: string } | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<AutofillData['duplicate_match']>(null);

  const [formData, setFormData] = useState<RegistrationForm>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    alt_phone: '',
    alt_email: '',
    id_number: '',
    kra_pin: '',
    date_of_birth: '',
    gender: 'male',
    marital_status: '',
    nationality: '',
    physical_address: '',
    postal_address: '',
    occupation: '',
    employer: '',
    employer_address: '',
    next_of_kin_name: '',
    next_of_kin_phone: '',
    next_of_kin_relationship: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
  });

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      const res = await fetch('/api/members');
      const data = await res.json();
      if (data.success) {
        setMembers(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch members:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAutofill = (data: AutofillData) => {
    // Populate the EXISTING registration form with the submitted information.
    // The admin can still review and edit every field before clicking Register.
    setFormData((prev) => ({ ...prev, ...data.fields }));
    setActiveSubmission({ id: data.submission_id, reference: data.submission_reference });
    setDuplicateWarning(data.duplicate_match);
    setAutofillOpen(false);
    setMessage({
      type: 'success',
      text: `Auto-filled from submission ${data.submission_reference}. Review the information and click Register Member to complete registration.`,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      // If auto-filled from a submission, send its id so the backend links it
      // (marks REGISTERED + member id) AFTER the existing registration engine
      // succeeds — preventing double-registration from the same submission.
      const payload: Record<string, unknown> = { ...formData };
      if (activeSubmission) {
        payload._submission_id = activeSubmission.id;
      }
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        const linkedNote = activeSubmission
          ? ` Submission ${activeSubmission.reference} marked as registered and linked.`
          : '';
        setMessage({ type: 'success', text: `Member registered successfully!${linkedNote}` });
        setFormData({
          first_name: '',
          last_name: '',
          email: '',
          phone: '',
          alt_phone: '',
          alt_email: '',
          id_number: '',
          kra_pin: '',
          date_of_birth: '',
          gender: 'male',
          marital_status: '',
          nationality: '',
          physical_address: '',
          postal_address: '',
          occupation: '',
          employer: '',
          employer_address: '',
          next_of_kin_name: '',
          next_of_kin_phone: '',
          next_of_kin_relationship: '',
          emergency_contact_name: '',
          emergency_contact_phone: '',
          emergency_contact_relationship: '',
        });
        setActiveSubmission(null);
        setDuplicateWarning(null);
        setShowForm(false);
        fetchMembers();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to register member' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to register member' });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredMembers = members.filter((member) => {
    const matchesSearch =
      member.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.phone.includes(searchTerm) ||
      member.member_number.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || member.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      suspended: 'bg-red-100 text-red-800',
      withdrawn: 'bg-gray-100 text-gray-800',
      deceased: 'bg-gray-200 text-gray-600',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Members</h1>
          <p className="text-gray-500 mt-1">Manage organization members and registrations</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
            showForm
              ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
        >
          <span>{showForm ? '✕' : '+'}</span>
          {showForm ? 'Cancel' : 'Register Member'}
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-6 p-4 rounded-lg ${
          message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          {message.text}
        </div>
      )}

      {/* Registration Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">New Member Registration</h2>

          {/* Auto-fill helper — populates THIS form from a public pre-registration submission. */}
          <div className="mb-6 p-4 rounded-lg border border-indigo-200 bg-indigo-50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-indigo-900">
                  Pre-Registration Submissions
                </div>
                <div className="text-xs text-indigo-700">
                  Auto-fill this form from information prospective members submitted through the public registration link.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAutofillOpen(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium whitespace-nowrap"
              >
                Auto-fill from Submitted Registrations
              </button>
            </div>
            {activeSubmission && (
              <div className="mt-3 text-xs text-indigo-800 bg-white border border-indigo-200 rounded p-2">
                <strong>Auto-filled from:</strong> {activeSubmission.reference}
                <button
                  type="button"
                  onClick={() => {
                    setActiveSubmission(null);
                    setDuplicateWarning(null);
                  }}
                  className="ml-3 text-indigo-500 hover:text-indigo-700 underline"
                >
                  clear link
                </button>
                <span className="block mt-1 text-indigo-600">
                  The existing registration engine will run when you click Register Member; this submission will then be marked registered.
                </span>
              </div>
            )}
            {duplicateWarning && Object.keys(duplicateWarning).length > 0 && (
              <div className="mt-3 p-3 rounded-lg border border-orange-300 bg-orange-50">
                <div className="text-sm font-semibold text-orange-900">⚠ Possible Existing Member</div>
                <div className="text-xs text-orange-800 mt-1">
                  An existing member may already share this applicant&apos;s information. Review before registering:
                </div>
                <ul className="mt-2 space-y-1">
                  {Object.entries(duplicateWarning).map(([field, m]) => (
                    <li key={field} className="text-xs text-orange-900">
                      <span className="capitalize">{field.replace('_', ' ')}:</span> {m.name} ({m.member_number}){' '}
                      <Link href={`/dashboard/members/${m.member_id}`} className="text-indigo-600 hover:underline">
                        View member →
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Personal Information */}
            <div>
              <h3 className="text-md font-medium text-gray-900 mb-4">Personal Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                  <input type="text" name="first_name" value={formData.first_name} onChange={handleInputChange} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                  <input type="text" name="last_name" value={formData.last_name} onChange={handleInputChange} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" name="email" value={formData.email} onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                  <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} required placeholder="0712345678"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ID Number</label>
                  <input type="text" name="id_number" value={formData.id_number} onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">KRA PIN</label>
                  <input type="text" name="kra_pin" value={formData.kra_pin} onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                  <input type="date" name="date_of_birth" value={formData.date_of_birth} onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                  <select name="gender" value={formData.gender} onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Marital Status</label>
                  <select name="marital_status" value={formData.marital_status} onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                    <option value="">Select</option>
                    <option value="single">Single</option>
                    <option value="married">Married</option>
                    <option value="divorced">Divorced</option>
                    <option value="widowed">Widowed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nationality</label>
                  <input type="text" name="nationality" value={formData.nationality} onChange={handleInputChange} placeholder="e.g. Kenyan"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div className="border-t pt-6">
              <h3 className="text-md font-medium text-gray-900 mb-4">Contact Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Physical Address</label>
                  <input type="text" name="physical_address" value={formData.physical_address} onChange={handleInputChange} placeholder="e.g. Nairobi, Kariobangi"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Postal Address</label>
                  <input type="text" name="postal_address" value={formData.postal_address} onChange={handleInputChange} placeholder="e.g. 00100"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Alt. Phone</label>
                  <input type="tel" name="alt_phone" value={formData.alt_phone} onChange={handleInputChange} placeholder="0712345678"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Alt. Email</label>
                  <input type="email" name="alt_email" value={formData.alt_email} onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
            </div>

            {/* Employment Information */}
            <div className="border-t pt-6">
              <h3 className="text-md font-medium text-gray-900 mb-4">Employment Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Occupation</label>
                  <input type="text" name="occupation" value={formData.occupation} onChange={handleInputChange} placeholder="e.g. Barista"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employer</label>
                  <input type="text" name="employer" value={formData.employer} onChange={handleInputChange} placeholder="e.g. Self Employed"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employer Address</label>
                  <input type="text" name="employer_address" value={formData.employer_address} onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
            </div>

            {/* Next of Kin */}
            <div className="border-t pt-6">
              <h3 className="text-md font-medium text-gray-900 mb-4">Next of Kin</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input type="text" name="next_of_kin_name" value={formData.next_of_kin_name} onChange={handleInputChange} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                  <input type="tel" name="next_of_kin_phone" value={formData.next_of_kin_phone} onChange={handleInputChange} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Relationship *</label>
                  <input type="text" name="next_of_kin_relationship" value={formData.next_of_kin_relationship} onChange={handleInputChange} required placeholder="Spouse, Parent..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
            </div>

            {/* Emergency Contact */}
            <div className="border-t pt-6">
              <h3 className="text-md font-medium text-gray-900 mb-4">Emergency Contact</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input type="text" name="emergency_contact_name" value={formData.emergency_contact_name} onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input type="tel" name="emergency_contact_phone" value={formData.emergency_contact_phone} onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Relationship</label>
                  <input type="text" name="emergency_contact_relationship" value={formData.emergency_contact_relationship} onChange={handleInputChange} placeholder="e.g. Spouse, Parent, Sibling"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={submitting} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {submitting ? 'Registering...' : 'Register Member'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <input type="text" placeholder="Search by name, phone, or member number..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="suspended">Suspended</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        </div>
      </div>

      {/* Members Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading members...</div>
        ) : filteredMembers.length === 0 ? (
          <div className="p-8 text-center text-gray-500"><span className="text-4xl">👥</span><p className="mt-2">No members found</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Member</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Member #</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Registered</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-medium">
                          {member.first_name[0]}{member.last_name[0]}
                        </div>
                        <div className="font-medium text-gray-900">{member.first_name} {member.last_name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{member.phone}</div>
                      {member.email && <div className="text-sm text-gray-500">{member.email}</div>}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{member.member_number}</td>
                    <td className="px-6 py-4">{getStatusBadge(member.status)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{new Date(member.registration_date).toLocaleDateString('en-KE')}</td>
                    <td className="px-6 py-4">
                      <Link href={`/dashboard/members/${member.id}`} className="text-indigo-600 hover:text-indigo-900 text-sm font-medium">View →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Auto-fill from public pre-registration submissions */}
      <AutofillFromSubmissionsModal
        open={autofillOpen}
        onClose={() => setAutofillOpen(false)}
        onAutofill={handleAutofill}
      />
    </div>
  );
}
