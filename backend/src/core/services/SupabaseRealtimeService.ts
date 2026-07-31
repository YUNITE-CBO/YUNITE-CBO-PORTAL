import { SupabaseService } from './SupabaseService';
import { Logger } from './Logger';

export type RealtimeEventType = 'members' | 'transactions' | 'loans' | 'savings' | 'notifications' | 'meetings' | 'reports';

export class SupabaseRealtimeService {
  public static subscribe(table: RealtimeEventType, callback: (payload: any) => void): { unsubscribe: () => void } {
    const client = SupabaseService.getAnonClient();
    const channel = client.channel(`realtime:${table}`);

    channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
      callback(payload);
    });

    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') {
        Logger.warn(`Realtime subscription pending for ${table}`, { status });
      }
    });

    return {
      unsubscribe: () => {
        client.removeChannel(channel);
      },
    };
  }
}
