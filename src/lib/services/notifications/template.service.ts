/**
 * TEMPLATE SERVICE - Notification Template Management
 * 
 * CRUD operations for notification templates with versioning support.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';

export interface TemplateData {
  template_code: string;
  name: string;
  description?: string;
  category_id?: string;
  channels?: string[];
  subject_template: string;
  subject_variables?: string[];
  body_template: string;
  body_variables?: string[];
  html_body_template?: string;
  html_body_variables?: string[];
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  is_active?: boolean;
  created_by?: string;
}

export interface TemplateVersion {
  id: string;
  version: number;
  subject_template: string;
  body_template: string;
  html_body_template?: string;
  created_at: string;
}

export class TemplateService {
  /**
   * Create a new template
   */
  async create(data: TemplateData): Promise<any> {
    const supabase = await createServiceClient();

    const { data: template, error } = await supabase
      .from('notification_templates')
      .insert({
        id: uuidv4(),
        template_code: data.template_code,
        name: data.name,
        description: data.description,
        category_id: data.category_id,
        channels: data.channels || ['in_app'],
        subject_template: data.subject_template,
        subject_variables: data.subject_variables || this.extractVariables(data.subject_template),
        body_template: data.body_template,
        body_variables: data.body_variables || this.extractVariables(data.body_template),
        html_body_template: data.html_body_template,
        html_body_variables: data.html_body_variables || (data.html_body_template ? this.extractVariables(data.html_body_template) : []),
        priority: data.priority || 'normal',
        is_active: data.is_active !== false,
        created_by: data.created_by,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create template: ${error.message}`);
    }

    return template;
  }

  /**
   * Get template by ID
   */
  async getById(templateId: string) {
    const supabase = await createServiceClient();

    const { data } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    return data;
  }

  /**
   * Get template by code
   */
  async getByCode(templateCode: string) {
    const supabase = await createServiceClient();

    const { data } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('template_code', templateCode)
      .single();

    return data;
  }

  /**
   * Get all templates with optional filters
   */
  async getAll(options?: {
    category_id?: string;
    is_active?: boolean;
    channels?: string[];
    limit?: number;
    offset?: number;
  }) {
    const supabase = await createServiceClient();
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;

    let query = supabase
      .from('notification_templates')
      .select('*, category:notification_categories(id, code, name, icon, color)', { count: 'exact' });

    if (options?.category_id) {
      query = query.eq('category_id', options.category_id);
    }

    if (options?.is_active !== undefined) {
      query = query.eq('is_active', options.is_active);
    }

    const { data, count } = await query
      .order('name')
      .range(offset, offset + limit - 1);

    return {
      templates: data || [],
      total: count || 0,
      limit,
      offset,
    };
  }

  /**
   * Update template (creates new version)
   */
  async update(templateId: string, data: Partial<TemplateData>, userId?: string): Promise<any> {
    const supabase = await createServiceClient();

    // Get current template
    const { data: current } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (!current) {
      throw new Error('Template not found');
    }

    // Create new version (archive current)
    await supabase
      .from('notification_templates')
      .update({
        is_active: false,
        previous_version_id: current.previous_version_id || current.id,
      })
      .eq('id', templateId);

    // Create new version
    const { data: newVersion, error } = await supabase
      .from('notification_templates')
      .insert({
        id: uuidv4(),
        template_code: data.template_code || current.template_code,
        name: data.name || current.name,
        description: data.description !== undefined ? data.description : current.description,
        category_id: data.category_id || current.category_id,
        channels: data.channels || current.channels,
        subject_template: data.subject_template || current.subject_template,
        subject_variables: data.subject_variables || this.extractVariables(data.subject_template || current.subject_template),
        body_template: data.body_template || current.body_template,
        body_variables: data.body_variables || this.extractVariables(data.body_template || current.body_template),
        html_body_template: data.html_body_template !== undefined ? data.html_body_template : current.html_body_template,
        html_body_variables: data.html_body_variables,
        priority: data.priority || current.priority,
        is_active: true,
        version: (current.version || 1) + 1,
        previous_version_id: templateId,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update template: ${error.message}`);
    }

    return newVersion;
  }

  /**
   * Delete template (soft delete - deactivate)
   */
  async delete(templateId: string): Promise<void> {
    const supabase = await createServiceClient();

    await supabase
      .from('notification_templates')
      .update({ is_active: false })
      .eq('id', templateId);
  }

  /**
   * Activate template
   */
  async activate(templateId: string): Promise<void> {
    const supabase = await createServiceClient();

    await supabase
      .from('notification_templates')
      .update({ is_active: true })
      .eq('id', templateId);
  }

  /**
   * Deactivate template
   */
  async deactivate(templateId: string): Promise<void> {
    const supabase = await createServiceClient();

    await supabase
      .from('notification_templates')
      .update({ is_active: false })
      .eq('id', templateId);
  }

  /**
   * Get template version history
   */
  async getVersionHistory(templateId: string): Promise<TemplateVersion[]> {
    const supabase = await createServiceClient();

    // Get the current template first
    const { data: current } = await supabase
      .from('notification_templates')
      .select('id, version')
      .eq('id', templateId)
      .single();

    if (!current) return [];

    // Find all versions by following previous_version_id chain
    const versions: TemplateVersion[] = [];
    let currentId: string | null = templateId;

    while (currentId) {
      const { data: version } = await supabase
        .from('notification_templates')
        .select('id, version, subject_template, body_template, html_body_template, created_at')
        .eq('id', currentId)
        .single();

      if (version) {
        versions.push(version);
        currentId = null; // For now, just get the current version
        // In production, you would follow the previous_version_id chain
      } else {
        break;
      }
    }

    return versions.sort((a, b) => b.version - a.version);
  }

  /**
   * Preview template with sample data
   */
  async preview(templateId: string, variables: Record<string, unknown>): Promise<{
    subject: string;
    body: string;
    html_body?: string;
  }> {
    const template = await this.getById(templateId);

    if (!template) {
      throw new Error('Template not found');
    }

    return {
      subject: this.renderTemplate(template.subject_template, variables),
      body: this.renderTemplate(template.body_template, variables),
      html_body: template.html_body_template
        ? this.renderTemplate(template.html_body_template, variables)
        : undefined,
    };
  }

  /**
   * Validate template syntax
   */
  async validate(templateCode: string): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const template = await this.getByCode(templateCode);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!template) {
      errors.push('Template not found');
      return { valid: false, errors, warnings };
    }

    // Check for common issues
    const subjectVars = this.extractVariables(template.subject_template);
    const bodyVars = this.extractVariables(template.body_template);

    // Check for unused variables
    if (template.subject_variables) {
      const unusedSubject = (template.subject_variables as string[]).filter((v: string) => !subjectVars.includes(v));
      if (unusedSubject.length > 0) {
        warnings.push(`Declared subject variables not used: ${unusedSubject.join(', ')}`);
      }
    }

    if (template.body_variables) {
      const unusedBody = (template.body_variables as string[]).filter((v: string) => !bodyVars.includes(v));
      if (unusedBody.length > 0) {
        warnings.push(`Declared body variables not used: ${unusedBody.join(', ')}`);
      }
    }

    // Check for empty templates
    if (!template.subject_template.trim()) {
      errors.push('Subject template is empty');
    }

    if (!template.body_template.trim()) {
      errors.push('Body template is empty');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Extract variables from template
   */
  private extractVariables(template: string): string[] {
    const regex = /\{\{(\w+)\}\}/g;
    const variables: string[] = [];
    let match;

    while ((match = regex.exec(template)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }

    return variables;
  }

  /**
   * Render template with variables
   */
  private renderTemplate(template: string, variables: Record<string, unknown>): string {
    let rendered = template;
    
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      const stringValue = value !== null && value !== undefined ? String(value) : '';
      rendered = rendered.split(placeholder).join(stringValue);
    }

    return rendered;
  }

  /**
   * Get categories
   */
  async getCategories() {
    const supabase = await createServiceClient();

    const { data } = await supabase
      .from('notification_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');

    return data || [];
  }

  /**
   * Create category
   */
  async createCategory(data: {
    code: string;
    name: string;
    description?: string;
    icon?: string;
    color?: string;
    sort_order?: number;
  }) {
    const supabase = await createServiceClient();

    const { data: category, error } = await supabase
      .from('notification_categories')
      .insert({
        id: uuidv4(),
        code: data.code,
        name: data.name,
        description: data.description,
        icon: data.icon,
        color: data.color,
        sort_order: data.sort_order || 0,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create category: ${error.message}`);
    }

    return category;
  }
}

export const templateService = new TemplateService();
