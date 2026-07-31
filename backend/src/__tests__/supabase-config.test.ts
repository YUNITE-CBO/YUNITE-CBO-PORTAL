import { describe, expect, it } from '@jest/globals';
import { config } from '../config';

describe('Supabase configuration', () => {
  it('requires the Supabase environment variables to be present', () => {
    expect(config.supabase.url).toBeTruthy();
    expect(config.supabase.anonKey).toBeTruthy();
    expect(config.supabase.serviceRoleKey).toBeTruthy();
  });
});
