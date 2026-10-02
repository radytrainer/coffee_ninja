import { Router } from 'express';
import * as c from '../controllers/user.controller';
import { requireAdmin } from '../middleware/auth';

/** Staff management — admin only. */
export const userRouter = Router();
userRouter.use(requireAdmin);
userRouter.get('/', c.list);
userRouter.post('/', c.create);
userRouter.put('/:id', c.update);
userRouter.delete('/:id', c.remove);
