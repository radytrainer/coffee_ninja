import { Router } from 'express';
import * as c from '../controllers/auth.controller';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { loginLimiter } from '../middleware/rateLimit';

export const authRouter = Router();

authRouter.post('/login', loginLimiter, c.login);
authRouter.post('/logout', optionalAuth, c.logout);
authRouter.get('/me', requireAuth(), c.me);
