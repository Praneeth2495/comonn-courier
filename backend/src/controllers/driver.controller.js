const { prisma } = require('../config/db');

/** GET /api/driver/jobs — pickup jobs assigned to the logged-in driver */
async function listMyJobs(req, res, next) {
  try {
    const jobs = await prisma.order.findMany({
      where: { assignedDriverId: req.user.id },
      include: { senderAddress: true, receiverAddress: true, service: true, items: true },
      orderBy: { driverAssignedAt: 'desc' },
    });
    res.json({ jobs });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/driver/jobs/:id/arrived
 * Driver confirms they've arrived at the pickup location — an intermediate
 * checkpoint before the parcel is actually collected. Doesn't change the
 * order's status, just records the timestamp.
 */
async function markArrived(req, res, next) {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ error: 'Job not found' });
    if (order.assignedDriverId !== req.user.id) {
      return res.status(403).json({ error: 'This job is not assigned to you' });
    }
    if (!['PICKUP_CONFIRMED', 'PAID', 'LABEL_GENERATED'].includes(order.status)) {
      return res.status(409).json({ error: `Order can no longer be updated (status: ${order.status})` });
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { driverArrivedAt: new Date() },
    });
    res.json({ order: updated });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/driver/jobs/:id/picked-up
 * Driver confirms they collected the parcel in person. Only the driver this
 * job is assigned to can do this, and only while the order is still awaiting
 * pickup — never lets a driver "un-pick-up" or skip ahead of later statuses.
 */
async function markPickedUp(req, res, next) {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ error: 'Job not found' });
    if (order.assignedDriverId !== req.user.id) {
      return res.status(403).json({ error: 'This job is not assigned to you' });
    }
    if (!['PICKUP_CONFIRMED', 'PAID', 'LABEL_GENERATED'].includes(order.status)) {
      return res.status(409).json({ error: `Order can no longer be marked picked up (status: ${order.status})` });
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'PICKED_UP',
        pickedUpAt: new Date(),
        trackingEvents: { create: { status: 'PICKED_UP', note: 'Picked up by driver' } },
      },
    });
    res.json({ order: updated });
  } catch (err) {
    next(err);
  }
}

module.exports = { listMyJobs, markArrived, markPickedUp };
