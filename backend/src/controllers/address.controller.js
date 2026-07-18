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
    next(err);
  }
}

module.exports = { listAddresses, createAddress, updateAddress, deleteAddress };
