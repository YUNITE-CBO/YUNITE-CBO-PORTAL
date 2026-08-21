/**
 * Settings categories: configuration-status computation + migration 042
 *
 * Guards two fixes:
 *  1. Optional settings (is_required === false) no longer hold a category at
 *     "Partial" when every required setting has a value (the "fully set but
 *     says partially" bug).
 *  2. The four previously-unimplemented categories (savings, integrations,
 *     compliance, branding) are seeded by migration 042 with real, non-empty
 *     defaults for every required setting, so they render as "Configured".
 */

import fs from 'fs';
import path from 'path';

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: async () => {
    throw new Error('computeCategoryStatus must not touch the database');
  },
}));

import { computeCategoryStatus } from '@/lib/services/configuration.service';

const s = (value: string | null, is_required?: boolean) => ({ value, is_required });

describe('computeCategoryStatus', () => {
  it('configured when every setting has a value', () => {
    const r = computeCategoryStatus([s('a'), s('b')]);
    expect(r.status).toBe('configured');
    expect(r.configuredCount).toBe(2);
    expect(r.totalCount).toBe(2);
  });

  it('configured when all REQUIRED settings have values even if optional ones are empty', () => {
    const r = computeCategoryStatus([
      s('YUNITE PAMOJA CBO'),          // organization.name (required)
      s('KES'),                        // organization.currency (required)
      s('', false),                    // organization.registration_number (optional, empty)
      s(null, false),                  // organization.website (optional, null)
      s('', false),                    // organization.logo_url (optional, empty)
    ]);
    expect(r.status).toBe('configured');
    expect(r.configuredCount).toBe(2);
    expect(r.totalCount).toBe(5);
  });

  it('partial when a required setting is empty but some values exist', () => {
    const r = computeCategoryStatus([s('587'), s('')]);
    expect(r.status).toBe('partial');
  });

  it('unconfigured when no setting has a value', () => {
    expect(computeCategoryStatus([s(''), s(null)]).status).toBe('unconfigured');
    expect(computeCategoryStatus([]).status).toBe('unconfigured');
  });

  it('whitespace-only values do not count as configured', () => {
    expect(computeCategoryStatus([s('   ')]).status).toBe('unconfigured');
  });

  it('treats a missing is_required (pre-migration DB) as required', () => {
    // select('*') on a DB without the is_required column yields undefined,
    // which must preserve the legacy all-settings-must-have-values behavior.
    expect(computeCategoryStatus([s('a'), s('', undefined)]).status).toBe('partial');
  });

  it('all-optional category is configured once any value is present', () => {
    expect(computeCategoryStatus([s('', false), s('x', false)]).status).toBe('configured');
    expect(computeCategoryStatus([s('', false), s('', false)]).status).toBe('unconfigured');
  });
});

describe('migration 042 (settings categories completion)', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrations', '042_settings_categories_completion.sql'),
    'utf8'
  );

  it('adds the is_required column idempotently', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS is_required/i);
  });

  it('marks the deliberately-optional organization + smtp settings as optional', () => {
    for (const key of [
      'organization.registration_number',
      'organization.email',
      'organization.phone',
      'organization.address',
      'organization.website',
      'organization.logo_url',
      'smtp.password',
    ]) {
      expect(sql).toContain(`'${key}'`);
    }
    expect(sql).toMatch(/UPDATE settings SET is_required = FALSE/i);
  });

  it('removes the dead smtp.username duplicate (email service reads smtp.user)', () => {
    expect(sql).toMatch(/DELETE FROM settings WHERE key = 'smtp\.username'/);
  });

  it('seeds required settings with non-empty defaults for the four previously-unset categories', () => {
    // Every INSERT for a required setting in these categories must carry a
    // non-empty default value, otherwise the category still shows "Not Set".
    const insertRe = /INSERT INTO settings \(key, value, category, config_category_id, data_type, display_order, help_text(?:, is_required)?\)\s*\nSELECT '([^']+)', '([^']*)', '([^']+)'(?:, id, '[^']+', \d+,\s*\n\s*'[^']*')?(?:, (FALSE))?/g;
    const seeded: Array<{ key: string; value: string; category: string; optional: boolean }> = [];
    let m: RegExpExecArray | null;
    while ((m = insertRe.exec(sql)) !== null) {
      seeded.push({ key: m[1], value: m[2], category: m[3], optional: m[4] === 'FALSE' });
    }

    for (const category of ['savings', 'integrations', 'compliance', 'branding']) {
      const rows = seeded.filter(r => r.category === category);
      expect(rows.length).toBeGreaterThan(0);
      const requiredRows = rows.filter(r => !r.optional);
      expect(requiredRows.length).toBeGreaterThan(0);
      for (const row of requiredRows) {
        expect(row.value.trim()).not.toBe('');
      }
    }
  });

  it('seeds the consumed gmail.* keys under the integrations category as optional', () => {
    for (const key of ['gmail.client_id', 'gmail.client_secret', 'gmail.refresh_token', 'gmail.sender_email', 'gmail.sender_name']) {
      expect(sql).toContain(`'${key}'`);
    }
  });

  it('seeds the settings keys wired into code', () => {
    for (const key of [
      'savings.min_balance',
      'savings.max_withdrawal_amount',
      'integrations.gmail_api_enabled',
      'compliance.allow_manual_completion',
      'branding.tagline',
    ]) {
      expect(sql).toContain(`'${key}'`);
    }
  });
});

export {};
