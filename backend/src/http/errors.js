export class AppError extends Error {
  constructor(statusCode, code, message, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function notFoundHandler(req, _res, next) {
  next(new AppError(404, 'route_not_found', `Route ${req.method} ${req.path} was not found.`));
}

export function errorHandler(err, req, res, _next) {
  let normalizedError = err;

  if (err instanceof SyntaxError && err.type === 'entity.parse.failed') {
    normalizedError = new AppError(400, 'invalid_json', 'Request body contains invalid JSON.');
  } else if (err.type === 'entity.too.large') {
    normalizedError = new AppError(413, 'payload_too_large', 'Request body is too large.');
  }

  const isAppError = normalizedError instanceof AppError;
  const statusCode = isAppError ? normalizedError.statusCode : 500;
  const code = isAppError ? normalizedError.code : 'internal_server_error';
  const message = isAppError ? normalizedError.message : 'Internal server error.';

  if (statusCode >= 500) {
    req.log?.error?.({
      error: {
        name: err.name,
        message: err.message,
        stack: req.config?.isProduction ? undefined : err.stack,
      },
      requestId: req.id,
    });
  }

  res.status(statusCode).json({
    error: {
      code,
      message,
      requestId: req.id,
      details: isAppError ? normalizedError.details : undefined,
    },
  });
}
