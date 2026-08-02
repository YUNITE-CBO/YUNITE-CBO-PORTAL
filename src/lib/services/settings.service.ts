import { createClient } from '@/lib/supabase/server';

export class SettingsService {
  async getAll() {
    const supabase = await createClient();
    const { data } = await supabase.from('settings').select('*').order('category', {ascending: true}).order('key', {ascending: true});
    return data || [];
  }

  async update(params: any) {
    const supabase = await createClient();
    const { data, error } = await supabase.from('settings').update({value: params.value, description: params.description}).eq('key', params.key).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
}
export const settingsService = new SettingsService();
