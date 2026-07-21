require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { errorHandler, notFound } = require('./middleware/errorHandler');
const { handleWebhook } = require('./controllers/payment.controller');

const authRoutes = require('./routes/auth.routes');
const quoteRoutes = require('./routes/quote.routes');
const orderRoutes = require('./routes/order.routes');
const paymentRoutes = require('./routes/payment.routes');
const labelRoutes = require('./routes/label.routes');
const trackingRoutes = require('./routes/tracking.routes');
const adminRoutes = require('./routes/admin.routes');
const addressRoutes = require('./routes/address.routes');
const driverRoutes = require('./routes/driver.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const batchRoutes = require('./routes/batch.routes');
const locationRoutes = require('./routes/location.routes');
const { startDriverAutoUnassignJob } = require('./services/driverAutoUnassign');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') || '*', credentials: true }));
app.use(morgan('dev'));

// Razorpay webhook needs the RAW body for signature verification, so it must
// be mounted BEFORE express.json() and must not be JSON-parsed.
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), handleWebhook);

app.use(express.json({ limit: '2mb' }));

// Basic rate limiting on the public quote endpoint to prevent scraping/abuse
const quoteLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
app.use('/api/quote', quoteLimiter);

app.get('/health', (req, res) => res.json({ ok: true, service: 'comonn-backend' }));

app.use('/api/auth', authRoutes);
app.use('/api/quote', quoteRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/labels', labelRoutes);
app.use('/api/track', trackingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/locations', locationRoutes);

// Static download of generated label PDFs (also served explicitly via
// /api/labels/:orderId/download for access-controlled downloads)
app.use('/labels', express.static(path.join(__dirname, '../storage/labels')));

app.use(notFound);
app.use(errorHandler);

startDriverAutoUnassignJob();

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Comonn backend listening on http://localhost:${PORT}`);
});

module.exports = app;
