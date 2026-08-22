import { Router } from 'express';
import { ProjectController } from './project.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

export const projectRouter = Router();

projectRouter.use(authenticateToken);

projectRouter.post('/', ProjectController.create);
projectRouter.get('/', ProjectController.list);
projectRouter.get('/:id', ProjectController.getById);
projectRouter.patch('/:id', ProjectController.update);
projectRouter.delete('/:id', ProjectController.delete);
