const { prisma } = require('../config/db');

/** GET /api/admin/sub-contractors?q=... */
async function listSubContractors(req, res, next) {
  try {
    const { q } = req.query;
    const where = {};
    if (q && q.trim()) {
      const term = q.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { businessName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { mobile1: { contains: term, mode: 'insensitive' } },
        { mobile2: { contains: term, mode: 'insensitive' } },
        { gst: { contains: term, mode: 'insensitive' } },
      ];
    }
    const subContractors = await prisma.subContractor.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json({ subContractors });
  } catch (err) {
    next(err);
  }
}

const REQUIRED_FIELDS = ['name', 'businessName', 'mobile1', 'mobile2', 'email', 'address', 'cityTown', 'district', 'state', 'countryCode', 'gst'];

/** POST /api/admin/sub-contractors — every field mandatory except reference/notes. */
async function createSubContractor(req, res, next) {
  try {
    const body = req.body;
    for (const field of REQUIRED_FIELDS) {
      if (!body[field]?.trim()) {
        return res.status(400).json({ error: `${field} is required` });
      }
    }

    const subContractor = await prisma.subContractor.create({
      data: {
        name: body.name.trim(),
        businessName: body.businessName.trim(),
        mobile1: body.mobile1.trim(),
        mobile2: body.mobile2.trim(),
        email: body.email.trim(),
        address: body.address.trim(),
        cityTown: body.cityTown.trim(),
        district: body.district.trim(),
        state: body.state.trim(),
        countryCode: body.countryCode.trim(),
        gst: body.gst.trim(),
        reference: body.reference?.trim() || null,
        notes: body.notes?.trim() || null,
        createdById: req.user.id,
      },
    });
    res.status(201).json({ subContractor });
  } catch (err) {
    next(err);
  }
}

module.exports = { listSubContractors, createSubContractor };
