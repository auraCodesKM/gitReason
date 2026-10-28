/**
 * Wraps an async route handler so a rejected promise reaches Express's error
 * middleware (src/middleware/error-handler.js). Express 4 does not do this by
 * itself: without the wrapper an exception inside `await` would never send a
 * response and the request would hang.
 * @param {(req, res, next) => Promise<unknown>} fn
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
