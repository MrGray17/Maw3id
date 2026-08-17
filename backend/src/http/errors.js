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
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const code = isAppError ? err.code : 'internal_server_error';
  const message = isAppError ? err.message : 'Internal server error.';

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
      details: isAppError ? err.details : undefined,
    },
  });
}
