import { Request, Response } from 'express';
import { registerSchema, loginSchema } from './auth.schema';
import { AuthService } from './auth.service';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { env } from '../../config/env';
import { ApiResponse } from '@job-scheduler/shared';

export class AuthController {
  static async register(req: Request, res: Response) {
    const parseResult = registerSchema.safeParse(req.body);

    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Validation failed for registration input data.',
          details: parseResult.error.flatten().fieldErrors,
        },
      };
      return res.status(400).json(response);
    }

    try {
      const data = await AuthService.register(parseResult.data);
      const response: ApiResponse<typeof data> = {
        success: true,
        data,
      };
      return res.status(201).json(response);
    } catch (err: unknown) {
      const errorCode = (err as { code?: string })?.code;
      if (errorCode === 'DUPLICATE_EMAIL') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'DUPLICATE_EMAIL',
            message: 'A user with this email address already exists.',
          },
        };
        return res.status(409).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Registration failed due to a server error.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async login(req: Request, res: Response) {
    const parseResult = loginSchema.safeParse(req.body);

    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Validation failed for login credentials.',
          details: parseResult.error.flatten().fieldErrors,
        },
      };
      return res.status(400).json(response);
    }

    try {
      const data = await AuthService.login(parseResult.data);
      const response: ApiResponse<typeof data> = {
        success: true,
        data,
      };
      return res.status(200).json(response);
    } catch (err: unknown) {
      const errorCode = (err as { code?: string })?.code;
      if (errorCode === 'INVALID_CREDENTIALS') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password provided.',
          },
        };
        return res.status(401).json(response);
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Login failed due to a server error.',
        },
      };
      return res.status(500).json(response);
    }
  }

  static async googleAuth(_req: Request, res: Response) {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      const frontendErrorUrl = `http://localhost:5173/?error=${encodeURIComponent('Google OAuth configuration is missing or incomplete.')}`;
      return res.redirect(frontendErrorUrl);
    }

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(
      env.GOOGLE_CALLBACK_URL
    )}&response_type=code&scope=openid%20email%20profile&prompt=consent`;

    return res.redirect(googleAuthUrl);
  }

  static async googleCallback(req: Request, res: Response) {
    const code = req.query.code as string;
    const errorParam = req.query.error as string;

    if (errorParam || !code) {
      const errorMsg = errorParam || 'Authorization code missing from Google callback.';
      return res.redirect(`http://localhost:5173/?error=${encodeURIComponent(errorMsg)}`);
    }

    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      return res.redirect(`http://localhost:5173/?error=${encodeURIComponent('Google OAuth configuration is missing.')}`);
    }

    try {
      // Exchange authorization code for tokens with Google OAuth 2.0 API
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: env.GOOGLE_CALLBACK_URL,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) {
        const errorText = await tokenRes.text();
        return res.redirect(`http://localhost:5173/?error=${encodeURIComponent('Failed to exchange code for Google token: ' + errorText)}`);
      }

      const tokens = (await tokenRes.json()) as { access_token: string };

      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      if (!userRes.ok) {
        return res.redirect(`http://localhost:5173/?error=${encodeURIComponent('Failed to fetch user profile from Google.')}`);
      }

      const userData = (await userRes.json()) as { email?: string; name?: string; id?: string };

      if (!userData.email) {
        return res.redirect(`http://localhost:5173/?error=${encodeURIComponent('Google account has no associated email address.')}`);
      }

      const googleProfile = {
        email: userData.email,
        name: userData.name || userData.email.split('@')[0],
        id: userData.id || 'google-id',
      };

      const authResult = await AuthService.handleGoogleAuth(googleProfile);

      const frontendUrl = `http://localhost:5173/?token=${authResult.accessToken}&user=${encodeURIComponent(
        JSON.stringify(authResult.user)
      )}`;

      return res.redirect(frontendUrl);
    } catch (err: unknown) {
      return res.redirect(`http://localhost:5173/?error=${encodeURIComponent(err instanceof Error ? err.message : 'Google Auth Failed')}`);
    }
  }

  static async me(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required to access user profile.',
          },
        };
        return res.status(401).json(response);
      }

      const userProfile = await AuthService.me(userId);
      const response: ApiResponse<typeof userProfile> = {
        success: true,
        data: userProfile,
      };
      return res.status(200).json(response);
    } catch (err: unknown) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: err instanceof Error ? err.message : 'User profile not found.',
        },
      };
      return res.status(404).json(response);
    }
  }
}
