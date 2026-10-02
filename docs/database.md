# Database

PostgreSQL 17, managed with Prisma 6. Schema: [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma).
Migrations: `backend/prisma/migrations`.

## Models

| Model | Purpose | Notes |
|---|---|---|
| `User` | Staff and admin accounts | `role` enum (`ADMIN`, `STAFF`), bcrypt `passwordHash`, `active`, `sessionVersion` (token revocation) |
| `Category` | Menu categories | `sortOrder`, `active` (inactive = hidden from kiosk) |
| `Product` | Menu items | `price NUMERIC(10,2)`, `available`, `featured`, FK to category (`RESTRICT`) |
| `ProductOptionGroup` | Reusable group (Size, Milk…) | `selectionType` SINGLE/MULTIPLE, `required`, `minSelect`, `maxSelect` |
| `ProductOptionGroupLink` | Product ↔ group (many-to-many) | composite PK, per-product `sortOrder` |
| `ProductOption` | Choice inside a group | `priceDelta`, `isDefault`, `available`; unique `(groupId, name)` |
| `Order` | Customer order | human `orderNumber` (unique), `status`, `subtotal/tax/total/taxRate` |
| `OrderItem` | Line in an order | **snapshots** `productName`, `basePrice`, `unitPrice`, `lineTotal`; `productId` nullable (`SET NULL`) |
| `OrderItemOption` | Selected option | **snapshots** `groupName`, `optionName`, `priceDelta` |
| `OrderStatusHistory` | Audit trail | status, timestamp, `changedBy` (null = kiosk) |
| `InventoryItem` | Stock levels | `quantity`, `lowStockThreshold`, optional product link |
| `Kiosk` | Kiosk devices | `code`, `inputMode`, `sessionTimeoutSeconds`, `successResetSeconds`, `hoverDelayMs`, `lastSeenAt` |
| `Setting` | Key/value shop settings | `shopName`, `currency`, `taxRate`, `orderNumberPrefix`, `timezone` |

"Role" is implemented as a Prisma enum rather than a table: there are exactly two fixed
roles and authorization is code, so a table would add joins without flexibility.

### Why snapshots are not duplication

Order lines store the name and price *at the time of the order*. Menu prices change,
products get deleted — historical orders, receipts and revenue reports must not change
with them. Live catalog data is never copied anywhere else.

## Constraints (beyond Prisma's)

Added in the initial migration with raw SQL:

- `Product.price >= 0`, `ProductOption.priceDelta >= 0`
- `ProductOptionGroup`: `0 <= minSelect <= maxSelect`, `maxSelect >= 1`
- `Order` amounts non-negative; `OrderItem.quantity` between 1 and 50; line prices non-negative
- `InventoryItem` quantities non-negative
- `Kiosk` timeouts within sane ranges

The API validates the same rules first (friendlier errors); the database is the backstop.

## Order numbers

`CREATE SEQUENCE order_number_seq START WITH 1001` → `A1001, A1002, …` (prefix from
settings). A sequence is concurrency-safe: two kiosks can never receive the same number.
Numbers consumed by a rolled-back transaction are skipped (gaps are normal).

## Indexes

Status + createdAt on orders (kitchen board, reports), createdAt (date ranges), foreign
keys on items/options/history, category + sortOrder on products, groupId on options.

## Seed data

`npm run db:seed` (idempotent — safe to re-run): 6 categories, 17 products with SVG
artwork, 8 option groups / 25 options, admin + staff users, `KIOSK-01`, 12 inventory items
and (outside production) ~a week of demo orders so the dashboard has data.
Disable demo orders with `SEED_DEMO_ORDERS=false`.

## Common commands

```bash
npm run db:up        # start PostgreSQL (docker)
npm run db:migrate   # create/apply a migration after editing schema.prisma (dev)
npm run db:deploy    # apply migrations (CI/production)
npm run db:seed      # seed
npm run db:reset     # DROP everything, re-migrate, re-seed (dev only!)
npm run db:backup    # pg_dump to ./backups (keeps the newest 14)
npm run db:studio -w backend   # Prisma Studio
```
