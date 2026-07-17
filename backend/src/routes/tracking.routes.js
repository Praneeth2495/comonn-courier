const router = require('express').Router();
const { prisma } = require('../config/db');

/** GET /api/track/:trackingNumber — public, no auth. Used by the "Track" screen. */
router.get('/:trackingNumber', async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({
      where: { trackingNumber: req.params.trackingNumber },
      include: {
        service: true,
        receiverAddress: { select: { city: true, state: true, countryCode: true } },
        trackingEvents: { orderBy: { occurredAt: 'asc' } },
      },
    });
    if (!order) return res.status(404).json({ error: 'No shipment found for that tracking number' });

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
