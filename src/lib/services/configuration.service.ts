/**
 * CONFIGURATION SERVICE
 * Phase 4: Enterprise Configuration Management Framework
 * 
 * Provides comprehensive configuration management with:
 * - Category-based organization
 * - Change history tracking
 * - Value validation
 * - Integration with audit logs
 */

import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';

export interface SettingWithCategory {
  id: string;
  key: string;
  value: string;
  description: string | null;
  category: string;
  config_category_id: string | null;
  category_id: string | null;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  data_type: string;
  is_encrypted: boolean;
  is_public: boolean;
  display_order: number;
  help_text: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface ConfigurationCategoryWithSettings {
  id: string;
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string;
  sort_order: number;
  is_active: boolean;
  settings: SettingWithCategory[];
  configuration_status: 'configured' | 'partial' | 'unconfigured';
  configured_count: number;
  total_count: number;
}

export interface ConfigurationChange {
  id: string;
  setting_key: string;
  old_value: string | null;
  new_value: string | null;
  old_value_masked: string | null;
  new_value_masked: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  reason: string | null;
  created_at: string;
}

export class ConfigurationService {
  /**
   * Get all settings organized by category
   */
  async getAllByCategory(): Promise<ConfigurationCategoryWithSettings[]> {
    const supabase = await createServiceClient();

    // Get all categories
    const { data: categories } = await supabase
      .from('configuration_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');

    if (!categories) return [];

    // Create a map of code -> category for lookup by code
    const categoriesByCode: Record<string, typeof categories[0]> = {};
    for (const cat of categories) {
      categoriesByCode[cat.code] = cat;
    }

    // Get all settings with category info
    const { data: settings } = await supabase
      .from('settings')
      .select('*')
      .order('display_order');

    // Group settings by category - use config_category_id first, then category field, then 'uncategorized'
    const groupedSettings: Record<string, SettingWithCategory[]> = {};
    for (const setting of settings || []) {
      // Try to find category by config_category_id first, then by category code
      let categoryInfo = categories.find(c => c.id === setting.config_category_id);
      if (!categoryInfo && setting.category) {
        // Try matching by category code
        categoryInfo = categoriesByCode[setting.category];
      }
      const categoryId = categoryInfo?.id || 'uncategorized';
      const categoryCode = categoryInfo?.code || setting.category || 'uncategorized';
      
      if (!groupedSettings[categoryId]) {
        groupedSettings[categoryId] = [];
      }
      groupedSettings[categoryId].push({
        ...setting,
        category_name: categoryInfo?.name || 'Other',
        category_icon: categoryInfo?.icon || null,
        category_color: categoryInfo?.color || '#6B7280',
      });
    }

    // Build result with configuration status
    return categories.map(category => {
      const categorySettings = groupedSettings[category.id] || [];
      const totalCount = categorySettings.length;
      const configuredCount = categorySettings.filter(s => s.value && s.value.trim() !== '').length;
      
      let configuration_status: 'configured' | 'partial' | 'unconfigured' = 'unconfigured';
      if (configuredCount === totalCount && totalCount > 0) {
        configuration_status = 'configured';
      } else if (configuredCount > 0) {
        configuration_status = 'partial';
      }

      return {
        ...category,
        settings: categorySettings,
        configuration_status,
        configured_count: configuredCount,
        total_count: totalCount,
      };
    });
  }

  /**
   * Get settings for a specific category
   */
  async getByCategory(categoryCode: string): Promise<ConfigurationCategoryWithSettings | null> {
    const supabase = await createServiceClient();

    const { data: category } = await supabase
      .from('configuration_categories')
      .select('*')
      .eq('code', categoryCode)
      .single();

    if (!category) return null;

    const { data: settings } = await supabase
      .from('settings')
      .select('*')
      .eq('config_category_id', category.id)
      .order('display_order');

    const categorySettings = settings || [];
    const totalCount = categorySettings.length;
    const configuredCount = categorySettings.filter(s => s.value && s.value.trim() !== '').length;
    
    let configuration_status: 'configured' | 'partial' | 'unconfigured' = 'unconfigured';
    if (configuredCount === totalCount && totalCount > 0) {
      configuration_status = 'configured';
    } else if (configuredCount > 0) {
      configuration_status = 'partial';
    }

    return {
      ...category,
      settings: categorySettings.map(s => ({
        ...s,
        category_name: category.name,
        category_icon: category.icon,
        category_color: category.color,
      })),
      configuration_status,
      configured_count: configuredCount,
      total_count: totalCount,
    };
  }

  /**
   * Get a single setting by key
   */
  async getSetting(key: string): Promise<string | null> {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', key)
      .single();
    return data?.value || null;
  }

  /**
   * Get multiple settings by keys
   */
  async getMany(keys: string[]): Promise<Record<string, string>> {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', keys);
    
    if (!data) return {};
    return data.reduce((acc, item) => ({ ...acc, [item.key]: item.value }), {});
  }

  /**
   * Update a setting with history tracking
   */
  async updateSetting(
    key: string,
    newValue: string,
    userId?: string,
    userName?: string,
    reason?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = await createServiceClient();

    // Get current value
    const { data: current } = await supabase
      .from('settings')
      .select('value, data_type, is_encrypted')
      .eq('key', key)
      .single();

    if (!current) {
      return { success: false, error: 'Setting not found' };
    }

    // Skip if value hasn't changed
    if (current.value === newValue) {
      return { success: true };
    }

    // Update the setting
    const { error: updateError } = await supabase
      .from('settings')
      .update({
        value: newValue,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('key', key);

    if (updateError) {
      return { success: false, error: `Failed to update setting: ${updateError.message}` };
    }

    // Record in configuration history
    const oldValueMasked = current.is_encrypted ? '********' : current.value;
    const newValueMasked = current.is_encrypted ? '********' : newValue;

    await supabase.from('configuration_history').insert({
      id: uuidv4(),
      setting_key: key,
      old_value: current.value,
      new_value: newValue,
      old_value_masked: oldValueMasked,
      new_value_masked: newValueMasked,
      changed_by: userId,
      changed_by_name: userName,
      reason: reason || null,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
      created_at: new Date().toISOString(),
    });

    // Also record in audit logs
    await supabase.from('audit_logs').insert({
      id: uuidv4(),
      user_id: userId || 'system',
      action: 'configuration.updated',
      record_id: key,
      before_value: { key, value: current.value },
      after_value: { key, value: newValue },
      description: `Configuration updated: ${key}`,
      ip_address: ipAddress,
      created_at: new Date().toISOString(),
    });

    return { success: true };
  }

  /**
   * Update multiple settings at once
   */
  async updateMany(
    updates: Record<string, string>,
    userId?: string,
    userName?: string,
    reason?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    for (const [key, value] of Object.entries(updates)) {
      const result = await this.updateSetting(key, value, userId, userName, reason, ipAddress, userAgent);
      if (!result.success && result.error) {
        errors.push(`${key}: ${result.error}`);
      }
    }

    return { success: errors.length === 0, errors };
  }

  /**
   * Get configuration change history
   */
  async getHistory(
    options?: {
      settingKey?: string;
      changedBy?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ history: ConfigurationChange[]; total: number }> {
    const supabase = await createServiceClient();
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    let query = supabase
      .from('configuration_history')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (options?.settingKey) {
      query = query.eq('setting_key', options.settingKey);
    }
    if (options?.changedBy) {
      query = query.eq('changed_by', options.changedBy);
    }

    const { data, count } = await query;

    return {
      history: data || [],
      total: count || 0,
    };
  }

  /**
   * Get configuration status summary
   */
  async getStatusSummary(): Promise<{
    total_categories: number;
    configured_categories: number;
    partial_categories: number;
    unconfigured_categories: number;
    total_settings: number;
    configured_settings: number;
  }> {
    const categories = await this.getAllByCategory();

    const total_categories = categories.length;
    const configured_categories = categories.filter(c => c.configuration_status === 'configured').length;
    const partial_categories = categories.filter(c => c.configuration_status === 'partial').length;
    const unconfigured_categories = categories.filter(c => c.configuration_status === 'unconfigured').length;
    
    const total_settings = categories.reduce((sum, c) => sum + c.total_count, 0);
    const configured_settings = categories.reduce((sum, c) => sum + c.configured_count, 0);

    return {
      total_categories,
      configured_categories,
      partial_categories,
      unconfigured_categories,
      total_settings,
      configured_settings,
    };
  }

  /**
   * Reset setting to default value
   */
  async resetToDefault(
    key: string,
    defaultValue: string,
    userId?: string,
    userName?: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.updateSetting(key, defaultValue, userId, userName, reason || 'Reset to default value');
  }
}

export const configurationService = new ConfigurationService();
