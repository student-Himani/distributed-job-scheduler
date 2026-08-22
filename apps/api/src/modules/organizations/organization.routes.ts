import { Router } from 'express';
import { OrganizationController } from './organization.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

export const organizationRouter = Router();

organizationRouter.use(authenticateToken);

organizationRouter.post('/', OrganizationController.create);
organizationRouter.get('/', OrganizationController.list);
organizationRouter.get('/me', OrganizationController.getMe);
organizationRouter.patch('/me', OrganizationController.updateMe);
