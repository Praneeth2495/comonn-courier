# Comonn — International Courier Platform

Full-stack source for the Comonn booking flow: instant zone/weight/volume
quotation → sender/receiver details → payment (Razorpay + PayPal) → label generation,
plus a customer dashboard and an admin dashboard for managing zones, rate
cards, orders and users.

```
comonn/
├── backend/     Node.js + Express + Prisma (PostgreSQL) API
└── frontend/    React (Vite) single-page app
```

## Stack

| Layer      | Choice |
|------------|--------|
| Backend    | Node.js, Express, Prisma ORM |
| Database   | PostgreSQL |
| Auth       | JWT (email + password, bcrypt hashing) |
| Payments   | Razorpay (Orders API + webhooks), PayPal via Razorpay's International Payments |
| Labels     | pdfkit (PDF) + bwip-js (Code128 barcode) |
| Frontend   | React 18, React Router, Vite, Razorpay Checkout.js |

This was scaffolded in an offline sandbox (no package registry access), so
`node_modules` were **not** installed or run here — the code has been
syntax-checked (`node --check` for the backend, `esbuild` for all JSX) but
not executed end-to-end. Run the smoke test steps below after `npm install`.

## 1. Backend setup

```bash
cd backend
cp .env.example .env      # fill in DATABASE_URL, JWT_SECRET, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
npm install
npm run prisma:migrate    # creates tables from prisma/schema.prisma
npm run seed               # loads example zones/services/rate cards + an admin user
npm run dev                 # http://localhost:4000
```

Seeded admin login: `admin@comonn.com` / `ChangeMe123!` — **change this
immediately** in a real deployment (Users tab in the admin dashboard, or
directly in the database).

### Razorpay webhook (local dev)

Use the Razorpay Dashboard (Settings → Webhooks) or a tunnel like `ngrok
http 4000` to forward `https://<tunnel>/api/payments/webhook` to your local
server. Set the same secret you configure there as `RAZORPAY_WEBHOOK_SECRET`
in `.env`, and subscribe to the `payment.captured` and `payment.failed`
events.

## 2. Frontend setup

```bash
cd frontend
cp .env.example .env      # set VITE_API_BASE_URL
npm install
npm run dev                 # http://localhost:5173, proxies /api to :4000
```

## 3. Plugging in your real zone/rate table

Pricing lives entirely in the database, not in code, so you don't need to
touch the pricing engine to update rates:

- **Zones**: `Zone` model — one row per pricing zone (e.g. Zone A, B, C…).
- **Country → zone mapping**: `CountryZone` — every destination country
  points at exactly one zone.
- **Rate cards**: `RateCard` — one row per (service, zone, weight bracket).
  `basePrice` covers the whole bracket; `perKgOverage` is the $/kg rate
  used once a shipment is heavier than the top bracket for that zone.
- **Surcharges**: `Surcharge` — flat or percentage fees (fuel, remote area,
  etc.) layered on top of every quote.

`backend/prisma/seed.js` currently loads **placeholder example rates** —
replace the `ZONES`, `SERVICES`, `bracketsFor()` multipliers and
`SURCHARGES` arrays with your real numbers (or write a one-off CSV import
script that calls the same Prisma models) and re-run `npm run seed`.
Admins can also manage zones and rate cards live from **Admin → Zones &
Rates** once the app is running.

The actual calculation (`backend/src/services/pricingEngine.js`) is:

1. Resolve the destination country to a `Zone`.
2. `volumetricWeight = (L × W × H in cm) ÷ divisor` (default 5000 cm³/kg,
   configurable per service).
3. `chargeableWeight = max(actualWeight, volumetricWeight)`.
4. Look up the `RateCard` bracket covering that weight for (service, zone).
   If the shipment is heavier than every bracket, extrapolate using
   `perKgOverage`.
5. Add surcharges, then tax, for the `grandTotal`.

Every order stores a full JSON pricing breakdown (`Order.pricingBreakdown`)
and the raw inputs, so historical orders are never affected by later rate
changes.

## 4. Booking flow (maps 1:1 to the original screens)

| Screen | Route | What happens |
|---|---|---|
| Quote | `/quote` | `POST /api/quote` — public, no auth, no order created |
| Add Details | `/details` | `POST /api/orders` — re-prices server-side, creates `PENDING_PAYMENT` order |
| Payment | `/payment` | `POST /api/payments/:orderId/order` + Razorpay Checkout, confirmed via `POST /api/payments/:orderId/confirm` |
| Print Labels | `/labels` | `POST /api/labels/:orderId/generate` — only once order is `PAID` |
| Track | `/track` | `GET /api/track/:trackingNumber` — public |

Guest checkout is supported (no login required to get a quote or book);
logging in just attaches the order to a user account for the dashboard.

## 5. Dashboards

- **Customer dashboard** (`/dashboard`, role `CUSTOMER`): own orders,
  order detail, cancel while still cancellable.
- **Admin dashboard** (`/admin`, roles `ADMIN`/`STAFF`): revenue/status
  overview, all-orders management with status updates (feeds the public
  tracking timeline), zones & rate card CRUD, user role management.

## 6. Security notes for production

- Rotate `JWT_SECRET` and the seeded admin password before going live.
- All pricing is recomputed server-side on order creation — the frontend
  quote is never trusted directly for the charge amount.
- Payment status is only ever changed by the Razorpay **webhook** (the
  client-side `/confirm` call is a fast-path UX nicety, not trusted alone),
  to avoid spoofed payment confirmations.
- Add HTTPS, a reverse proxy (e.g. Nginx), and environment-specific CORS
  (`CLIENT_ORIGIN`) before deploying.
- Move `storage/labels` to S3/GCS (or similar) for a multi-instance deploy
  instead of local disk.
