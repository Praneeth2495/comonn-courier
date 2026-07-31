// The Razorpay SDK doesn't throw standard Error instances — it rejects with
// a plain object shaped like { statusCode, error: { code, description } },
// so err.message is always undefined for those and the real reason was
// getting silently swallowed in logs. Prefer that shape's description when
// present, falling back to a normal Error's message otherwise.
function describeError(err) {
  return err?.error?.description || err?.message || 'Internal server error';
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const message = describeError(err);
  console.error(`[error] ${req.method} ${req.originalUrl} ->`, message, err?.error ? { razorpay: err.error, statusCode: err.statusCode } : '');
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: message,
    code: err.code || err?.error?.code || undefined,
  });
}

function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

module.exports = { errorHandler, notFound };
