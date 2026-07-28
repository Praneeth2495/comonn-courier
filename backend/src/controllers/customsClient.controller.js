const { prisma } = require('../config/db');

/** GET /api/admin/customs-clients?q=... */
async function listClients(req, res, next) {
  try {
    const { q } = req.query;
    const where = {};
    if (q && q.trim()) {
      const term = q.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { businessName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { mobile: { contains: term, mode: 'insensitive' } },
      ];
    }
    const clients = await prisma.customsClient.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json({ clients });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/customs-clients */
async function createClient(req, res, next) {
  try {
    const { name, businessName, mobile, email, countryCode, city, address } = req.body;
    if (!name?.trim() || !mobile?.trim() || !countryCode?.trim() || !city?.trim() || !address?.trim()) {
      return res.status(400).json({ error: 'name, mobile, countryCode, city and address are required' });
    }

    const client = await prisma.customsClient.create({
      data: {
        name: name.trim(),
        businessName: businessName?.trim() || null,
        mobile: mobile.trim(),
        email: email?.trim() || null,
        countryCode: countryCode.trim(),
        city: city.trim(),
        address: address.trim(),
        createdById: req.user.id,
      },
    });
    res.status(201).json({ client });
  } catch (err) {
    next(err);
  }
}

module.exports = { listClients, createClient };
