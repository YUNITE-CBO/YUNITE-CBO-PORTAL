import { createClient } from '@/lib/supabase/server';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET || 'secret');

export class AuthService {
  async login(email: string, password: string) {
    const supabase = await createClient();
    const { data: user } = await supabase.from('users').select('*').eq('email', email.toLowerCase()).single();
    if (!user) throw new Error('Invalid credentials');
    if (!user.is_active) throw new Error('Account disabled');
    if (user.password_hash) {
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) throw new Error('Invalid credentials');
    }
    const token = await new SignJWT({sub: user.id, email: user.email, role: user.role}).setProtectedHeader({alg: 'HS256'}).setExpirationTime('24h').sign(JWT_SECRET);
    await supabase.from('users').update({last_login: new Date().toISOString()}).eq('id', user.id);
    return {user, access_token: token};
  }

  async verifyToken(token: string) {
    try {
      const {payload} = await jwtVerify(token, JWT_SECRET);
      return {id: payload.sub as string, email: payload.email as string, role: payload.role as string};
    } catch { return null; }
  }
}
export const authService = new AuthService();
