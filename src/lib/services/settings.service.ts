/**
 * SETTINGS SERVICE - All business rules from Settings
 */

import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';

export class SettingsService {
  async getAll() {
    const supabase = await createServiceClient();
    const { data } = await supabase.from('settings').select('*').order('category').order('key');
    return data || [];
  }

  async get(key: string): Promise<string | null> {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase.from('settings').select('value').eq('key', key).single();
      if (error || !data) return null;
      return data?.value || null;
    } catch (e) {
      // If no rows or error, return null
      return null;
    }
  }

  async getNumber(key: string, defaultValue: number = 0): Promise<number> {
    const value = await this.get(key);
    if (!value) return defaultValue;
    const num = parseFloat(value);
    return isNaN(num) ? defaultValue : num;
  }

  async getMany(keys: string[]): Promise<Record<string, string>> {
    const supabase = await createServiceClient();
    const { data } = await supabase.from('settings').select('key, value').in('key', keys);
    if (!data) return {};
    return data.reduce((acc, item) => ({ ...acc, [item.key]: item.value }), {});
  }

  async update(key: string, value: string, userId?: string) {
    const supabase = await createServiceClient();
    const { data: current } = await supabase.from('settings').select('value').eq('key', key).single();

    const { data, error } = await supabase
      .from('settings')
      .update({ value, updated_by: userId, updated_at: new Date().toISOString() })
      .eq('key', key)
      .select()
      .single();

    if (error || !data) throw new Error(`Failed to update setting: ${error?.message}`);

    await supabase.from('audit_logs').insert({
      id: uuidv4(),
      action: 'settings.update',
      record_id: data.id,
      user_id: userId || 'system',
      before_value: { key, value: current?.value },
      after_value: { key, value },
      created_at: new Date().toISOString(),
    });

    return data;
  }

  async seedDefaults() {
    const supabase = await createServiceClient();
    const defaults = [
      { key: 'shares.share_value', value: '100', category: 'financial' },
      { key: 'loan.max_percentage', value: '75', category: 'loan' },
      { key: 'loan.max_period_months', value: '12', category: 'loan' },
      { key: 'loan.default_period_months', value: '12', category: 'loan' },
      { key: 'loan.default_interest_rate', value: '10', category: 'loan' },
      { key: 'loan.max_amount', value: '500000', category: 'loan' },
      { key: 'fees.registration', value: '500', category: 'fees' },
      { key: 'fees.annual', value: '2000', category: 'fees' },
      { key: 'organization.name', value: 'YUNITE CBO', category: 'organization' },
      { key: 'organization.currency', value: 'KES', category: 'organization' },
      { key: 'welfare.monthly_amount', value: '500', category: 'welfare' },
      { key: 'contributions.monthly_default', value: '1000', category: 'contributions' },
    ];

    for (const setting of defaults) {
      const { data: existing } = await supabase.from('settings').select('id').eq('key', setting.key).single();
      if (!existing) {
        await supabase.from('settings').insert({ id: uuidv4(), ...setting });
      }
    }
  }
}

export const settingsService = new SettingsService();
