export class CacheService {
  private cache = new Map<string, {data: unknown; expiry: number}>();

  async get<T>(key: string): Promise<T | null> {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) { this.cache.delete(key); return null; }
    return item.data as T;
  }

  async set(key: string, value: unknown, ttlSeconds: number = 300) {
    this.cache.set(key, {data: value, expiry: Date.now() + ttlSeconds * 1000});
  }

  async del(key: string) { this.cache.delete(key); }
  async invalidateMember(id: string) { Array.from(this.cache.keys()).filter(k => k.includes(id)).forEach(k => this.cache.delete(k)); }
}
export const cacheService = new CacheService();
