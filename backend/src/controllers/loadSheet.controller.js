const fs = require('fs');
const path = require('path');
const { prisma } = require('../config/db');
const { generateLoadSheetNumber } = require('../utils/invoiceNumber');
const { generateHubLoadSheetPdf } = require('../services/hubLoadSheetPdf');
const { STORAGE_DIR } = require('../utils/pdfHelpers');
const { applyStatusToItems } = require('./batch.controller');
const { buildOrdersWhere } = require('./order.controller');

const ORDER_INCLUDE = { senderAddress: true, receiverAddress: true, items: true, service: true };

function withQty(order) {
  const qty = (order.items || []).reduce((sum, it) => sum + it.quantity, 0);
  return { ...order, qty };
}

// STAFF only ever see load sheets touching their own assigned hub (set at
// onboarding — EmployeeProfile.hubId, "which branch this hire belongs to").
// ADMIN/ACCOUNTS see everything, same as every other load-sheet route.
// A STAFF account with no hub assigned sees nothing rather than everything
// — the safe default when the permission itself can't be resolved.
async function staffHubScope(req) {
  if (req.user.role !== 'STAFF') return null;
  const profile = await prisma.employeeProfile.findUnique({ where: { userId: req.user.id }, select: { hubId: true } });
  return profile?.hubId || '__none__';
}

/** Recomputes and persists orderCount/totalQty/totalWeightKg from the load sheet's current orders, regenerates the PDF, and keeps its mirrored ScanBatch row (see createLoadSheet) in sync so Batch Scan's "Saved batches" always reflects the real order list. */
async function recomputeAndRegenerate(loadSheetId) {
  const loadSheet = await prisma.loadSheet.findUnique({
    where: { id: loadSheetId },
    include: { fromHub: true, toHub: true, orders: { include: ORDER_INCLUDE } },
  });
  const totalQty = loadSheet.orders.reduce((sum, o) => sum + (o.items || []).reduce((s, it) => s + it.quantity, 0), 0);
  const totalWeightKg = loadSheet.orders.reduce((sum, o) => sum + Number(o.chargeableWeightKg), 0);
  const updated = await prisma.loadSheet.update({
    where: { id: loadSheetId },
    data: { orderCount: loadSheet.orders.length, totalQty, totalWeightKg },
    include: { fromHub: true, toHub: true, orders: { include: ORDER_INCLUDE } },
  });

  const { fileName } = await generateHubLoadSheetPdf(updated);
  await prisma.loadSheet.update({ where: { id: loadSheetId }, data: { pdfFileUrl: fileName } });

  const batch = await prisma.scanBatch.findFirst({ where: { name: `Load Sheet ${updated.loadSheetNumber}` } });
  if (batch) {
    const labels = updated.orders.length
      ? await prisma.label.findMany({ where: { orderId: { in: updated.orders.map((o) => o.id) } }, select: { orderId: true, barcodeValue: true } })
      : [];
    const labelByOrder = new Map(labels.map((l) => [l.orderId, l.barcodeValue]));
    await prisma.$transaction([
      prisma.scanBatchItem.deleteMany({ where: { batchId: batch.id } }),
      prisma.scanBatchItem.createMany({
        data: updated.orders.map((o) => ({
          batchId: batch.id,
          barcodeValue: labelByOrder.get(o.id) || o.trackingNumber || o.orderNumber,
          matched: true,
          orderId: o.id,
          orderNumber: o.orderNumber,
        })),
      }),
    ]);
  }

  return { ...updated, pdfFileUrl: fileName };
}

/**
 * POST /api/admin/loadsheets — { orderIds, fromHubId, toHubId, transferBy,
 * reference?, contactName?, contactMobile? }. Created from the Pickup orders
 * tab's checklist (same selection used for "Send to rider"). Also mirrors a
 * ScanBatch row (name "Load Sheet <LS#>") the same way Manifest does, so
 * this load sheet shows up in Batch Scan's "Saved batches" tab immediately
 * and its status can be changed there without re-scanning.
 */
async function createLoadSheet(req, res, next) {
  try {
    const { orderIds, fromHubId, toHubId, transferBy, reference, contactName, contactMobile } = req.body;
    if (!Array.isArray(orderIds) || orderIds.length === 0) return res.status(400).json({ error: 'orderIds is required' });
    if (!fromHubId) return res.status(400).json({ error: 'From Hub is required' });
    if (!toHubId) return res.status(400).json({ error: 'To Hub is required' });
    if (!transferBy?.trim()) return res.status(400).json({ error: 'Transfer by is required' });

    const [fromHub, toHub] = await Promise.all([
      prisma.hub.findUnique({ where: { id: fromHubId } }),
      prisma.hub.findUnique({ where: { id: toHubId } }),
    ]);
    if (!fromHub) return res.status(400).json({ error: 'From Hub not found' });
    if (!toHub) return res.status(400).json({ error: 'To Hub not found' });

    const loadSheetNumber = await generateLoadSheetNumber();
    const loadSheet = await prisma.$transaction(async (tx) => {
      const created = await tx.loadSheet.create({
        data: {
          loadSheetNumber,
          barcodeValue: loadSheetNumber,
          fromHubId,
          toHubId,
          transferBy: transferBy.trim(),
          reference: reference?.trim() || null,
          contactName: contactName?.trim() || null,
          contactMobile: contactMobile?.trim() || null,
          createdById: req.user.id,
        },
      });
      const claimed = await tx.order.updateMany({
        where: { id: { in: orderIds }, loadSheetId: null },
        data: { loadSheetId: created.id },
      });
      if (claimed.count === 0) {
        throw Object.assign(new Error('None of the selected orders are eligible — they may already be on another load sheet.'), { status: 409 });
      }
      return created;
    });

    const actorLabel = req.user.role.charAt(0) + req.user.role.slice(1).toLowerCase();
    const claimedOrders = await prisma.order.findMany({ where: { loadSheetId: loadSheet.id }, select: { id: true } });
    await prisma.orderComment.createMany({
      data: claimedOrders.map((o) => ({
        orderId: o.id,
        authorId: req.user.id,
        body: `Load sheet created by ${actorLabel} - ${loadSheetNumber}`,
      })),
    });

    // Same "saved batch" record Manifest creation produces — lets staff
    // re-apply a status to every order on this load sheet from the Scan
    // page's Saved batches list without re-scanning. 'Transferred' is a
    // descriptive placeholder, same reasoning as Manifest's 'Manifested'.
    const labels = claimedOrders.length
      ? await prisma.label.findMany({ where: { orderId: { in: claimedOrders.map((o) => o.id) } }, select: { orderId: true, barcodeValue: true } })
      : [];
    const labelByOrder = new Map(labels.map((l) => [l.orderId, l.barcodeValue]));
    const ordersWithNumber = await prisma.order.findMany({ where: { loadSheetId: loadSheet.id }, select: { id: true, orderNumber: true, trackingNumber: true } });
    await prisma.scanBatch.create({
      data: {
        name: `Load Sheet ${loadSheetNumber}`,
        status: 'Transferred',
        createdById: req.user.id,
        items: {
          create: ordersWithNumber.map((o) => ({
            barcodeValue: labelByOrder.get(o.id) || o.trackingNumber || o.orderNumber,
            matched: true,
            orderId: o.id,
            orderNumber: o.orderNumber,
          })),
        },
      },
    });

    const full = await recomputeAndRegenerate(loadSheet.id);
    res.status(201).json({ loadSheet: { ...full, orders: full.orders.map(withQty) } });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

/** GET /api/admin/loadsheets — hub-scoped for STAFF, everyone else sees all. */
async function listLoadSheets(req, res, next) {
  try {
    const hubScope = await staffHubScope(req);
    const where = hubScope ? { OR: [{ fromHubId: hubScope }, { toHubId: hubScope }] } : {};
    const loadSheets = await prisma.loadSheet.findMany({
      where,
      include: { fromHub: true, toHub: true, createdBy: { select: { fullName: true } }, _count: { select: { orders: true, comments: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ loadSheets });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/loadsheets/:id */
async function getLoadSheet(req, res, next) {
  try {
    const hubScope = await staffHubScope(req);
    const loadSheet = await prisma.loadSheet.findUnique({
      where: { id: req.params.id },
      include: { fromHub: true, toHub: true, createdBy: { select: { fullName: true } }, orders: { include: ORDER_INCLUDE } },
    });
    if (!loadSheet) return res.status(404).json({ error: 'Load sheet not found' });
    if (hubScope && loadSheet.fromHubId !== hubScope && loadSheet.toHubId !== hubScope) {
      return res.status(404).json({ error: 'Load sheet not found' });
    }
    res.json({ loadSheet: { ...loadSheet, orders: loadSheet.orders.map(withQty) } });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/loadsheets/by-barcode/:code — Batch Scan's "Scan a Load
 * Sheet" verification mode: scanning the load sheet's own barcode first
 * loads its full order list (shown greyed-out/pending in the UI until each
 * order's own label is individually scanned). Includes each order's label
 * barcode/tracking number so the frontend can match a subsequent scan
 * locally without another round trip.
 */
async function getLoadSheetByBarcode(req, res, next) {
  try {
    const code = req.params.code;
    const hubScope = await staffHubScope(req);
    const loadSheet = await prisma.loadSheet.findFirst({
      where: { OR: [{ barcodeValue: code }, { loadSheetNumber: code }] },
      include: {
        fromHub: true,
        toHub: true,
        orders: {
          include: {
            receiverAddress: { select: { contactName: true, city: true, countryCode: true } },
            items: true,
            labels: { select: { barcodeValue: true } },
          },
        },
      },
    });
    if (!loadSheet) return res.status(404).json({ error: 'No load sheet matches that barcode.' });
    if (hubScope && loadSheet.fromHubId !== hubScope && loadSheet.toHubId !== hubScope) {
      return res.status(404).json({ error: 'No load sheet matches that barcode.' });
    }
    res.json({
      loadSheet: {
        id: loadSheet.id,
        loadSheetNumber: loadSheet.loadSheetNumber,
        fromHub: loadSheet.fromHub,
        toHub: loadSheet.toHub,
        orders: loadSheet.orders.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          trackingNumber: o.trackingNumber,
          status: o.status,
          qty: (o.items || []).reduce((sum, it) => sum + it.quantity, 0),
          receiver: o.receiverAddress ? `${o.receiverAddress.contactName || ''} — ${o.receiverAddress.city || ''}, ${o.receiverAddress.countryCode || ''}` : '',
          matchCodes: [...new Set([o.orderNumber, o.trackingNumber, ...(o.labels || []).map((l) => l.barcodeValue)].filter(Boolean))],
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/loadsheets/:id — { fromHubId, toHubId, transferBy,
 * reference, contactName, contactMobile }, all optional/independent.
 */
async function updateLoadSheet(req, res, next) {
  try {
    const loadSheet = await prisma.loadSheet.findUnique({ where: { id: req.params.id } });
    if (!loadSheet) return res.status(404).json({ error: 'Load sheet not found' });

    const { fromHubId, toHubId, transferBy, reference, contactName, contactMobile } = req.body;
    const data = {};
    if (fromHubId !== undefined) {
      if (!fromHubId) return res.status(400).json({ error: 'From Hub is required' });
      const hub = await prisma.hub.findUnique({ where: { id: fromHubId } });
      if (!hub) return res.status(400).json({ error: 'From Hub not found' });
      data.fromHubId = fromHubId;
    }
    if (toHubId !== undefined) {
      if (!toHubId) return res.status(400).json({ error: 'To Hub is required' });
      const hub = await prisma.hub.findUnique({ where: { id: toHubId } });
      if (!hub) return res.status(400).json({ error: 'To Hub not found' });
      data.toHubId = toHubId;
    }
    if (transferBy !== undefined) {
      if (!transferBy.trim()) return res.status(400).json({ error: 'Transfer by is required' });
      data.transferBy = transferBy.trim();
    }
    if (reference !== undefined) data.reference = reference?.trim() || null;
    if (contactName !== undefined) data.contactName = contactName?.trim() || null;
    if (contactMobile !== undefined) data.contactMobile = contactMobile?.trim() || null;

    await prisma.loadSheet.update({ where: { id: loadSheet.id }, data });
    const full = await recomputeAndRegenerate(loadSheet.id);
    res.json({ loadSheet: { ...full, orders: full.orders.map(withQty) } });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/admin/loadsheets/:id — releases every order back to unassigned, deletes the mirrored ScanBatch, then the load sheet itself (comments cascade). */
async function deleteLoadSheet(req, res, next) {
  try {
    const loadSheet = await prisma.loadSheet.findUnique({ where: { id: req.params.id } });
    if (!loadSheet) return res.status(404).json({ error: 'Load sheet not found' });

    await prisma.order.updateMany({ where: { loadSheetId: loadSheet.id }, data: { loadSheetId: null } });
    await prisma.scanBatch.deleteMany({ where: { name: `Load Sheet ${loadSheet.loadSheetNumber}` } });
    await prisma.loadSheet.delete({ where: { id: loadSheet.id } });

    if (loadSheet.pdfFileUrl) {
      const filePath = path.join(STORAGE_DIR, loadSheet.pdfFileUrl);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/loadsheets/:id/orders — add more orders (edit flow). */
async function addOrdersToLoadSheet(req, res, next) {
  try {
    const { orderIds } = req.body;
    if (!Array.isArray(orderIds) || orderIds.length === 0) return res.status(400).json({ error: 'orderIds is required' });

    const loadSheet = await prisma.loadSheet.findUnique({ where: { id: req.params.id } });
    if (!loadSheet) return res.status(404).json({ error: 'Load sheet not found' });

    const claimed = await prisma.order.updateMany({
      where: { id: { in: orderIds }, loadSheetId: null },
      data: { loadSheetId: req.params.id },
    });
    if (claimed.count === 0) return res.status(409).json({ error: 'None of the selected orders are eligible.' });

    const full = await recomputeAndRegenerate(req.params.id);
    res.json({ loadSheet: { ...full, orders: full.orders.map(withQty) } });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/admin/loadsheets/:id/orders/:orderId — remove a single order. */
async function removeOrderFromLoadSheet(req, res, next) {
  try {
    const { count } = await prisma.order.updateMany({
      where: { id: req.params.orderId, loadSheetId: req.params.id },
      data: { loadSheetId: null },
    });
    if (count === 0) return res.status(404).json({ error: 'Order not found on this load sheet' });

    const full = await recomputeAndRegenerate(req.params.id);
    res.json({ loadSheet: { ...full, orders: full.orders.map(withQty) } });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/loadsheets/eligible-orders?q= — unassigned orders (not on
 * any load sheet) for the "Add orders" picker in the edit modal. Reuses
 * buildOrdersWhere so STAFF still only see orders in their assigned pickup
 * regions. q matches order #/city the same way the Orders search box does.
 */
async function listEligibleOrdersForLoadSheet(req, res, next) {
  try {
    const where = await buildOrdersWhere(req);
    where.loadSheetId = null;
    const orders = await prisma.order.findMany({
      where,
      include: { senderAddress: true, receiverAddress: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ orders });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/loadsheets/:id/download */
async function downloadLoadSheet(req, res, next) {
  try {
    const loadSheet = await prisma.loadSheet.findUnique({
      where: { id: req.params.id },
      include: { fromHub: true, toHub: true, orders: { include: ORDER_INCLUDE } },
    });
    if (!loadSheet) return res.status(404).json({ error: 'Load sheet not found' });

    const filePath = path.resolve(path.join(STORAGE_DIR, loadSheet.pdfFileUrl || `${loadSheet.loadSheetNumber}.pdf`));
    if (!fs.existsSync(filePath)) await generateHubLoadSheetPdf(loadSheet);
    if (req.query.inline) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
      return res.sendFile(filePath);
    }
    res.download(filePath);
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/loadsheets/:id/comments */
async function listLoadSheetComments(req, res, next) {
  try {
    const comments = await prisma.loadSheetComment.findMany({
      where: { loadSheetId: req.params.id },
      include: { author: { select: { fullName: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ comments });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/loadsheets/:id/comments */
async function addLoadSheetComment(req, res, next) {
  try {
    const { body } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: 'body is required' });
    const comment = await prisma.loadSheetComment.create({
      data: { loadSheetId: req.params.id, authorId: req.user.id, body: body.trim() },
      include: { author: { select: { fullName: true, email: true } } },
    });
    res.status(201).json({ comment });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/loadsheets/:id/apply-status — { status, orderIds }. The
 * final step of Batch Scan's "Scan a Load Sheet" verification flow: applies
 * `status` to exactly the orders staff individually scanned/confirmed off
 * this load sheet (orderIds), not necessarily every order on it. Also logs
 * a comment on each so the load sheet it came through is traceable from the
 * order's own Comments, same as Manifest's own scan-applied status changes.
 */
async function applyLoadSheetScanStatus(req, res, next) {
  try {
    const { status, orderIds } = req.body;
    if (!status) return res.status(400).json({ error: 'status is required' });
    if (!Array.isArray(orderIds) || orderIds.length === 0) return res.status(400).json({ error: 'orderIds is required' });

    const loadSheet = await prisma.loadSheet.findUnique({ where: { id: req.params.id }, select: { id: true, loadSheetNumber: true } });
    if (!loadSheet) return res.status(404).json({ error: 'Load sheet not found' });

    const validOrders = await prisma.order.findMany({ where: { id: { in: orderIds }, loadSheetId: loadSheet.id }, select: { id: true } });
    if (validOrders.length === 0) return res.status(400).json({ error: 'None of these orders are on this load sheet.' });

    const items = validOrders.map((o) => ({ matched: true, orderId: o.id }));
    const updatedCount = await applyStatusToItems(items, status);

    const actorLabel = req.user.role.charAt(0) + req.user.role.slice(1).toLowerCase();
    await prisma.orderComment.createMany({
      data: validOrders.map((o) => ({
        orderId: o.id,
        authorId: req.user.id,
        body: `Status set to ${status} via Load Sheet scan by ${actorLabel} - ${loadSheet.loadSheetNumber}`,
      })),
    });

    res.json({ updatedCount });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createLoadSheet,
  listLoadSheets,
  getLoadSheet,
  getLoadSheetByBarcode,
  updateLoadSheet,
  deleteLoadSheet,
  addOrdersToLoadSheet,
  removeOrderFromLoadSheet,
  listEligibleOrdersForLoadSheet,
  downloadLoadSheet,
  listLoadSheetComments,
  addLoadSheetComment,
  applyLoadSheetScanStatus,
};
