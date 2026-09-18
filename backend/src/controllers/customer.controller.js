const { prisma } = require('../config/db');

/**
 * GET /api/admin/customers?q=search — ADMIN & STAFF (gated by requirePage
 * ('customers'), a page key deliberately separate from the ADMIN-only
 * "Users" tab — this never exposes staff/admin accounts or role controls,
 * only customer accounts, their orders, and wallet.
 */
async function listCustomers(req, res, next) {
  try {
    const q = (req.query.q || '').trim();
    const where = {
      role: 'CUSTOMER',
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const customers = await prisma.user.findMany({
      where,
      select: {
        id: true, fullName: true, email: true, phone: true, walletBalance: true, referralCode: true,
        createdAt: true, isActive: true,
        _count: { select: { orders: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ customers });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/customers/:id — one customer's own orders + wallet ledger */
async function getCustomer(req, res, next) {
  try {
    const customer = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, fullName: true, email: true, phone: true, company: true, walletBalance: true,
        referralCode: true, createdAt: true, isActive: true,
        referredBy: { select: { id: true, fullName: true, email: true } },
      },
    });
    // role isn't in the select above (only ever fetched to gate access, not
    // shown) — a separate check so a non-customer id (e.g. a staff account)
    // 404s rather than silently exposing it through this customer-only view.
    const roleCheck = await prisma.user.findUnique({ where: { id: req.params.id }, select: { role: true } });
    if (!customer || !roleCheck || roleCheck.role !== 'CUSTOMER') {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const orders = await prisma.order.findMany({
      where: { userId: customer.id },
      select: {
        id: true, orderNumber: true, status: true, grandTotal: true, currency: true,
        walletAmountUsed: true, createdAt: true,
        receiverAddress: { select: { city: true, countryCode: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const walletTransactions = await prisma.walletTransaction.findMany({
      where: { userId: customer.id },
      include: { createdBy: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const referralCount = await prisma.user.count({ where: { referredById: customer.id } });

    res.json({ customer: { ...customer, referralCount }, orders, walletTransactions });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/customers/:id/wallet-adjust — body: { amount, note }.
 * amount is signed (positive = credit, negative = debit) — a debit can
 * never take the balance below zero. Always recorded as its own
 * WalletTransaction (type ADMIN_CREDIT/ADMIN_DEBIT) with createdById set,
 * so every manual change staff make is independently auditable.
 */
async function adjustWallet(req, res, next) {
  try {
    const { amount, note } = req.body;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount === 0) {
      return res.status(400).json({ error: 'amount must be a non-zero number' });
    }
    if (!note?.trim()) {
      return res.status(400).json({ error: 'A note is required for a manual wallet adjustment' });
    }

    const customer = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!customer || customer.role !== 'CUSTOMER') {
      return res.status(404).json({ error: 'Customer not found' });
    }
    const newBalance = Number(customer.walletBalance) + numericAmount;
    if (newBalance < 0) {
      return res.status(400).json({ error: `Cannot deduct ₹${Math.abs(numericAmount).toFixed(2)} — this would take the wallet below zero (current balance ₹${Number(customer.walletBalance).toFixed(2)}).` });
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: customer.id }, data: { walletBalance: { increment: numericAmount } } }),
      prisma.walletTransaction.create({
        data: {
          userId: customer.id,
          amount: numericAmount,
          type: numericAmount > 0 ? 'ADMIN_CREDIT' : 'ADMIN_DEBIT',
          note: note.trim(),
          createdById: req.user.id,
        },
      }),
    ]);

    const updated = await prisma.user.findUnique({ where: { id: customer.id }, select: { walletBalance: true } });
    res.json({ walletBalance: updated.walletBalance });
  } catch (err) {
    next(err);
  }
}

module.exports = { listCustomers, getCustomer, adjustWallet };
