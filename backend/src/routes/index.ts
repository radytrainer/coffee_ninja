import { Router } from 'express';
import { health } from '../controllers/health.controller';
import { inventoryRouter, kioskAdminRouter, reportRouter, settingsRouter } from './admin.routes';
import { authRouter } from './auth.routes';
import { categoryRouter, optionGroupRouter, optionRouter, productRouter } from './catalog.routes';
import { kioskRouter, orderRouter } from './order.routes';
import { userRouter } from './user.routes';

export const apiRouter = Router();

apiRouter.get('/health', health);
apiRouter.use('/auth', authRouter);
apiRouter.use('/categories', categoryRouter);
apiRouter.use('/products', productRouter);
apiRouter.use('/option-groups', optionGroupRouter);
apiRouter.use('/options', optionRouter);
apiRouter.use('/orders', orderRouter);
apiRouter.use('/kiosk', kioskRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/reports', reportRouter);
apiRouter.use('/inventory', inventoryRouter);
apiRouter.use('/kiosks', kioskAdminRouter);
apiRouter.use('/settings', settingsRouter);
