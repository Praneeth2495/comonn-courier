const { prisma } = require('../config/db');

/** GET /api/addresses — the logged-in user's saved address book */
async function listAddresses(req, res, next) {
  try {
    const addresses = await prisma.address.findMany({
      where: { userId: req.user.id, isSaved: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ addresses });
  } catch (err) {
    next(err);
  }
}

const REQUIRED_FIELDS = ['contactName', 'phone', 'line1', 'city', 'postcode', 'countryCode'];

/** POST /api/addresses */
async function createAddress(req, res, next) {
  try {
    for (const f of REQUIRED_FIELDS) {
      if (!req.body[f]) return res.status(400).json({ error: `${f} is required` });
    }
    const { label, contactName, phone, email, instructions, line1, line2, city, state, postcode, countryCode, isDefault } = req.body;

    if (isDefault) {
      await prisma.address.updateMany({ where: { userId: req.user.id, isSaved: true }, data: { isDefault: false } });
    }

    const address = await prisma.address.create({
      data: {
        userId: req.user.id,
        isSaved: true,
        label,
        contactName,
        phone,
        email,
        instructions,
        line1,
        line2,
        city,
        state,
        postcode,
        countryCode,
        isDefault: Boolean(isDefault),
      },
    });
    res.status(201).json({ address });
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/addresses/:id */
async function updateAddress(req, res, next) {
  try {
    const existing = await prisma.address.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.user.id || !existing.isSaved) {
      return res.status(404).json({ error: 'Address not found' });
    }

    const { label, contactName, phone, email, instructions, line1, line2, city, state, postcode, countryCode, isDefault } = req.body;

    if (isDefault) {
      await prisma.address.updateMany({ where: { userId: req.user.id, isSaved: true }, data: { isDefault: false } });
    }

    const address = await prisma.address.update({
      where: { id: req.params.id },
      data: { label, contactName, phone, email, instructions, line1, line2, city, state, postcode, countryCode, isDefault },
    });
    res.json({ address });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/addresses/:id */
async function deleteAddress(req, res, next) {
  try {
    const existing = await prisma.address.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.user.id || !existing.isSaved) {
      return res.status(404).json({ error: 'Address not found' });
    }
    await prisma.address.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    // This address row is still directly referenced by an order
    // (senderAddressId/receiverAddressId is a RESTRICT foreign key) — can
    // happen for older accounts auto-created from a guest checkout, before
    // account provisioning started cloning addresses instead of reusing
    // the order's own rows. Prisma surfaces this as a generic
    // PrismaClientUnknownRequestError (not the usual P2003 code) when the
    // connection goes through Railway's proxy, so match on the underlying
    // Postgres error instead of err.code.
    if (err.code === 'P2003' || /violates.*foreign key constraint/i.test(err.message || '')) {
      return res.status(409).json({ error: 'This address is linked to an existing order and cannot be deleted.' });
    }
    next(err);
  }
}

module.exports = { listAddresses, createAddress, updateAddress, deleteAddress };
