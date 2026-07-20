const router = require('express').Router();
const { prisma } = require('../config/db');

/**
 * GET /api/track/:trackingNumber — public, no auth. Used by the "Track"
 * screen. Accepts either the tracking number or the order number/ID —
 * customers mainly see the latter (dashboard, emails), and the two are
 * separate sequences, so a search that only matched tracking numbers
 * looked "broken" for anyone who (reasonably) typed their order ID.
 */
router.get('/:trackingNumber', async (req, res, next) => {
  try {
    const code = req.params.trackingNumber;
    const order = await prisma.order.findFirst({
      where: { OR: [{ trackingNumber: code }, { orderNumber: code }] },
      include: {
        service: true,
        receiverAddress: { select: { city: true, state: true, countryCode: true } },
        trackingEvents: { orderBy: { occurredAt: 'asc' } },
      },
    });
    if (!order) return res.status(404).json({ error: 'No shipment found for that order or tracking number' });

    res.json({
      trackingNumber: order.trackingNumber,
      orderNumber: order.orderNumber,
      status: order.status,
      service: order.service.name,
      destination: order.receiverAddress,
      events: order.trackingEvents,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
