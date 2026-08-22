import { Router } from 'express';
import { AuthController } from './auth.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

export const authRouter = Router();

authRouter.post('/register', AuthController.register);
authRouter.post('/login', AuthController.login);
authRouter.get('/google', AuthController.googleAuth);
authRouter.get('/google/callback', AuthController.googleCallback);
authRouter.get('/me', authenticateToken, AuthController.me);
