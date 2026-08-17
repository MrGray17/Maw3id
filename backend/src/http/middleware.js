import crypto from 'node:crypto';

export function requestContext(config) {
  return (req, res, next) => {
    const requestId = req.get('x-request-id') || crypto.randomUUID();
    req.id = requestId;
    req.config = config;
    req.log = console;
    res.setHeader('x-request-id', requestId);
    next();
  };
}

export function securityHeaders(_req, res, next) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('permissions-policy', 'geolocation=(self)');
  next();
}

export function cors(allowedOrigins) {
  return (req, res, next) => {
    const origin = req.get('origin');

    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'Origin');
      res.setHeader('access-control-allow-credentials', 'true');
      res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('access-control-allow-headers', 'Content-Type,Authorization,X-Request-Id');
    }

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    return next();
  };
}
