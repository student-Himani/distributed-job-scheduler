import { Router } from 'express';
import { ClaimingController } from './claiming.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

export const claimingRouter = Router({ mergeParams: true });

claimingRouter.use(authenticateToken);

claimingRouter.post('/:id/claim', ClaimingController.claim);
claimingRouter.post('/:id/release', ClaimingController.release);
