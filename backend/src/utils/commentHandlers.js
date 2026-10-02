const { prisma } = require('../config/db');

/**
 * Generates the identical list/add pair used by every "internal staff
 * comment thread on a parent record" feature (orders, party invoices,
 * merchant invoices, box bookings) — these were four byte-structurally
 * identical copies differing only in the Prisma model names and the
 * 404 text.
 */
function makeCommentHandlers({ commentModel, parentModel, fkField, notFoundError }) {
  async function listComments(req, res, next) {
    try {
      const comments = await prisma[commentModel].findMany({
        where: { [fkField]: req.params.id },
        include: { author: { select: { fullName: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      });
      res.json({ comments });
    } catch (err) {
      next(err);
    }
  }

  async function addComment(req, res, next) {
    try {
      const { body } = req.body;
      if (!body || !body.trim()) return res.status(400).json({ error: 'Comment body is required' });

      const parent = await prisma[parentModel].findUnique({ where: { id: req.params.id } });
      if (!parent) return res.status(404).json({ error: notFoundError });

      const comment = await prisma[commentModel].create({
        data: { [fkField]: parent.id, authorId: req.user.id, body: body.trim() },
        include: { author: { select: { fullName: true, email: true } } },
      });
      res.status(201).json({ comment });
    } catch (err) {
      next(err);
    }
  }

  return { listComments, addComment };
}

module.exports = { makeCommentHandlers };
