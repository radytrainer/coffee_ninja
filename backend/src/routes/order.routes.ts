import { Router } from 'express';
import * as c from '../controllers/order.controller';
import { optionalAuth, requireStaff } from '../middleware/auth';
import { orderLimiter } from '../middleware/rateLimit';

export const orderRouter = Router();

// Customer (kiosk) endpoints — no account required.
orderRouter.post('/quote', c.quote);
orderRouter.post('/', orderLimiter, c.create);
orderRouter.get('/:id/status', c.publicStatus);
orderRouter.get('/:id/payment', c.payment);
orderRouter.post('/:id/payment/cash', c.payCash);
orderRouter.post('/:id/cancel', c.cancelUnpaid);
orderRouter.get('/:id', optionalAuth, c.getOne);

// Staff / admin endpoints.
orderRouter.get('/', requireStaff, c.list);
orderRouter.patch('/:id/status', requireStaff, c.updateStatus);

export const kioskRouter = Router();
kioskRouter.get('/config', c.kioskConfig);
