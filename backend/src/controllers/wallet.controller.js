const { prisma } = require('../config/db');

/** GET /api/wallet/transactions — the logged-in customer's own wallet ledger, newest first */
async function listMyTransactions(req, res, next) {
  try {
    const transactions = await prisma.walletTransaction.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ transactions });
  } catch (err) {
    next(err);
  }
}

module.exports = { listMyTransactions };
