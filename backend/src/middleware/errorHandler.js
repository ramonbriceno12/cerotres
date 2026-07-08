export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Internal server error" });
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
