# eCommerce Store

Full-stack eCommerce system — Node.js/Express backend, MongoDB, vanilla HTML/CSS/JS frontend.

## Quick Start (Local)

### 1. Backend

```bash
cd backend
npm install
```

Create `backend/.env`:
```
DB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/ecommerce
WEBHOOK_URL=https://your-webhook-url.com/hook
ADMIN_API_KEY=your-secret-admin-key
PORT=5000
```

```bash
npm run dev
```

### 2. Frontend

Open `frontend/index.html` in a browser, or serve it with any static server:

```bash
npx -y serve frontend
```

**Important:** Update `API_BASE` in `frontend/js/api.js` if your backend runs on a different URL.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/products` | Public | List products |
| GET | `/api/products/:id` | Public | Get product |
| POST | `/api/products` | Admin | Create product |
| PUT | `/api/products/:id` | Admin | Update product |
| DELETE | `/api/products/:id` | Admin | Delete product |
| POST | `/api/orders` | Public | Create order |
| GET | `/api/orders` | Admin | List orders |
| GET | `/api/orders/:orderId` | Admin | Get order |
| PUT | `/api/orders/:orderId` | Admin | Update order |
| POST | `/api/orders/:orderId/cancel` | Admin | Cancel order |
| DELETE | `/api/orders/:orderId` | Admin | Delete order |
| GET | `/api/shipping` | Public | Get shipping fees |
| GET | `/api/health` | Public | Health check |

Admin routes require `x-admin-key` header matching `ADMIN_API_KEY` env var.

## Deploy to Render

### Option A: Blueprint (Recommended)

1. Push this repo to GitHub/GitLab
2. Go to [Render Dashboard](https://dashboard.render.com)
3. Click **New** → **Blueprint**
4. Connect your repo — Render reads `render.yaml`
5. Set environment variables: `DB_URI`, `WEBHOOK_URL`, `ADMIN_API_KEY`

### Option B: Manual

**Backend (Web Service):**
- Runtime: Node
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- Env vars: `DB_URI`, `WEBHOOK_URL`, `ADMIN_API_KEY`, `NODE_ENV=production`

**Frontend (Static Site):**
- Root Directory: `frontend`
- Publish Directory: `./`
- Update `API_BASE` in `js/api.js` to your backend URL

## Webhooks

On order creation: `POST WEBHOOK_URL` with `{ event: "order.created", data: {order}, timestamp }`

On order update: `POST WEBHOOK_URL` with `{ event: "order.updated", data: {order}, timestamp }`

On order cancellation: `POST WEBHOOK_URL` with `{ event: "order.cancelled", data: {order}, timestamp }`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DB_URI` | Yes | MongoDB connection string |
| `WEBHOOK_URL` | No | Webhook endpoint for order events |
| `ADMIN_API_KEY` | Yes | Secret key for admin API access |
| `PORT` | No | Server port (default: 5000) |
"# ecommerce" 
