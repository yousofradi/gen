# eCommerce API Documentation: Order Management (App Integration)

This documentation covers the essential endpoints and actions for the mobile application to manage orders.

## Authentication
All admin endpoints require the following header:
- **Header Name**: `x-admin-key`
- **Header Value**: Your `ADMIN_API_KEY`.

---

## 1. View Orders (List)
Fetch all active orders.

**Endpoint**: `GET /api/products`
**Query Params**:
- `admin=true`: (Required)
- `search`: Filter by name or ID.

**Endpoint**: `GET /api/orders`
**Query Params**:
- `archived=true`: To view archived orders.

---

## 2. Update Customer Info (Including Notes)
Update any customer detail, including their specific delivery notes.

**Endpoint**: `PUT /api/orders/:orderId`

### Request Body
```json
{
  "customer": {
    "name": "John Doe",
    "phone": "201012345678",
    "address": "123 Street Name",
    "government": "القاهرة",
    "notes": "Please deliver after 5 PM - Ring the bell twice"
  }
}
```

---

## 3. Update Payment Status
You can record a partial payment (Custom pay) or mark an order as Fully Paid.

**Endpoint**: `PUT /api/orders/:orderId`

### Custom Pay (Partial)
```json
{
  "paidAmount": 200
}
```

### Full Paid
Set `paidAmount` to the value of `totalPrice`.
```json
{
  "paidAmount": 750 
}
```

---

## 4. Make Order Ready (تم التجهيز)
Mark an order as prepared. This will move it out of the "Waiting for Ready" tab in the dashboard.

**Endpoint**: `PUT /api/orders/:orderId`

### Request Body
```json
{
  "status": "ready"
}
```

---

## 5. Cancel Order
Cancel the order and notify the customer via webhook.

**Endpoint**: `POST /api/orders/:orderId/cancel`

---

## 6. Create New Order
**Endpoint**: `POST /api/orders`
(Refer to previous sections for the full order structure including items and payment methods).

---

## Field Reference (Commonly Used)

| Field | Description |
| :--- | :--- |
| `orderId` | The custom ID (e.g., `Order-1005`). |
| `customer.notes` | Delivery instructions. |
| `status` | `pending` (Waiting for Ready), `ready` (Prepared), `cancelled`. |
| `paidAmount` | Total amount received from the customer. |
| `paymentMethod` | `instapay`, `vodafone_cash`, `cash_on_delivery`, `bank_transfer`. |
