// AUTHORIZATION middleware: "may this user touch this analysis?"
//
// Runs after requireAuth and validateObjectId("id") on the upload routes, so
// it is checked BEFORE Multer reads any file bytes: nobody can push a file at
// someone else's analysis.
//
// Answers 404 (not 403) when the analysis belongs to another user, so the
// response does not reveal that the id exists.
import { analysisService } from "../modules/analyses/analysis.service.js";

export async function requireOwnedAnalysis(req, res, next) {
  try {
    const owned = await analysisService.existsOwned(req.params.id, req.auth.userId);
    if (!owned) return res.status(404).json({ status: "not_found" });
    next();
  } catch (err) {
    next(err);
  }
}
