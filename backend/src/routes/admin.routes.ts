import { Router } from 'express';
import * as c from '../controllers/admin.controller';
import { requireAdmin } from '../middleware/auth';

export const reportRouter = Router();
reportRouter.use(requireAdmin);
reportRouter.get('/dashboard', c.dashboard);
reportRouter.get('/sales', c.sales);
reportRouter.get('/products', c.products);
reportRouter.get('/orders', c.orders);

export const inventoryRouter = Router();
inventoryRouter.use(requireAdmin);
inventoryRouter.get('/', c.listInventory);
inventoryRouter.post('/', c.createInventory);
inventoryRouter.put('/:id', c.updateInventory);
inventoryRouter.post('/:id/adjust', c.adjustInventory);
inventoryRouter.delete('/:id', c.deleteInventory);

export const kioskAdminRouter = Router();
kioskAdminRouter.use(requireAdmin);
kioskAdminRouter.get('/', c.listKiosks);
kioskAdminRouter.post('/', c.createKiosk);
kioskAdminRouter.put('/:id', c.updateKiosk);
kioskAdminRouter.delete('/:id', c.deleteKiosk);

export const settingsRouter = Router();
settingsRouter.use(requireAdmin);
settingsRouter.get('/', c.getSettings);
settingsRouter.put('/', c.updateSettings);
