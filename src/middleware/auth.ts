import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthedRequest extends Request {
  user?: { id: number };
}

export function verifyJWT(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res
      .status(401)
      .json({ error: { code: 'UNAUTHORIZED', message: 'Missing token' } });
  }
  const token = header.slice(7);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(500).json({
      error: { code: 'CONFIG', message: 'JWT_SECRET not set' },
    });
  }
  try {
    const payload = jwt.verify(token, secret) as { sub: number | string };
    const id = typeof payload.sub === 'string' ? Number(payload.sub) : payload.sub;
    if (!id || Number.isNaN(id)) {
      return res
        .status(401)
        .json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
    }
    req.user = { id };
    next();
  } catch {
    return res
      .status(401)
      .json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
  }
}

export function signToken(userId: number): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set');
  return jwt.sign({ sub: userId }, secret, {
    algorithm: 'HS256',
    expiresIn: '7d',
  });
}
