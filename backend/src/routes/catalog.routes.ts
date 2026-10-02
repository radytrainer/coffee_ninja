import { Router } from 'express';
import * as c from '../controllers/catalog.controller';
import { optionalAuth, requireAdmin } from '../middleware/auth';

export const categoryRouter = Router();
categoryRouter.get('/', optionalAuth, c.listCategories);
categoryRouter.get('/:id', optionalAuth, c.getCategory);
categoryRouter.post('/', requireAdmin, c.createCategory);
categoryRouter.put('/:id', requireAdmin, c.updateCategory);
categoryRouter.delete('/:id', requireAdmin, c.deleteCategory);

export const productRouter = Router();
productRouter.get('/', optionalAuth, c.listProducts);
productRouter.get('/:id', optionalAuth, c.getProduct);
productRouter.post('/', requireAdmin, c.createProduct);
productRouter.put('/:id', requireAdmin, c.updateProduct);
productRouter.delete('/:id', requireAdmin, c.deleteProduct);

export const optionGroupRouter = Router();
optionGroupRouter.get('/', c.listOptionGroups);
optionGroupRouter.get('/:id', c.getOptionGroup);
optionGroupRouter.post('/', requireAdmin, c.createOptionGroup);
optionGroupRouter.put('/:id', requireAdmin, c.updateOptionGroup);
optionGroupRouter.delete('/:id', requireAdmin, c.deleteOptionGroup);
optionGroupRouter.post('/:id/options', requireAdmin, c.createOption);

export const optionRouter = Router();
optionRouter.put('/:id', requireAdmin, c.updateOption);
optionRouter.delete('/:id', requireAdmin, c.deleteOption);
