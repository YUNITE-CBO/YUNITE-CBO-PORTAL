import { Router } from 'express';
import { SupabaseAuthService } from '../../core/services/SupabaseAuthService';
import { authenticate } from '../../interfaces/http/middleware/auth';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await SupabaseAuthService.signInWithPassword(email, password);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/magic-link', async (req, res, next) => {
  try {
    await SupabaseAuthService.signInWithOtp(req.body.email);
    res.json({ success: true, data: { message: 'Magic link sent' } });
  } catch (error) {
    next(error);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    res.json({ success: true, data: { user: req.user } });
  } catch (error) {
    next(error);
  }
});

export default router;
