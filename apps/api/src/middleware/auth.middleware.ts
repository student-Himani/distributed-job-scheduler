import { Request, Response, NextFunction } from 'express';
import { AuthService, TokenPayload } from '../modules/auth/auth.service';
import { ApiResponse } from '@job-scheduler/shared';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication token is missing. Please provide a valid Bearer token.',
      },
    };
    return res.status(401).json(response);
  }

  const token = authHeader.substring(7).trim();

  if (!token) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'MISSING_TOKEN',
        message: 'Empty Bearer token provided.',
      },
    };
    return res.status(401).json(response);
  }

  try {
    const payload = AuthService.verifyToken(token);
    req.user = payload;
    return next();
  } catch (err) {
    const isExpired = err instanceof Error && err.name === 'TokenExpiredError';
    const response: ApiResponse = {
      success: false,
      error: {
        code: isExpired ? 'EXPIRED_TOKEN' : 'INVALID_TOKEN',
        message: isExpired
          ? 'Authentication token has expired. Please log in again.'
          : 'Invalid or tampered authentication token.',
      },
    };
    return res.status(401).json(response);
  }
}
