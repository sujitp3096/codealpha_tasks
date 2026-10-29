# EcoVana — Sustainable eCommerce Website

EcoVana is a nature-inspired, responsive eCommerce demo for thoughtful, eco-friendly everyday essentials. The visual identity uses forest green, sage, mint, natural cream, subtle glassmorphism, product photography, and accessible motion.

## Features
- Sustainable storefront with product search, category filters, product details, and product photography.
- Shopping bag with individual item selection, select all/deselect all, quantity controls, and selected-only checkout.
- Checkout with shipping address and Cash on Delivery or UPI demo mode.
- Order history with order items, total, status, payment method, date, and address.
- Dedicated login and registration pages.
- Administrator dashboard to add, edit, and delete products.
- Server-side role checks protect administrator APIs.
- Persistent SQLite database through `sql.js`.
- Responsive layouts, smooth interactions, glassmorphism, and reduced-motion accessibility support.

## Run locally
1. Install Node.js (LTS recommended).
2. Extract the ZIP and open the `EcoVana_Ecommerce_Project` folder in Cursor.
3. In the terminal run:
   ```bash
   npm install
   npm start
   ```
4. Open `http://localhost:3000`. If port 3000 is already in use, stop the other server with `Ctrl+C` or identify its PID using `netstat -ano | findstr :3000`.

## Demo administrator
- Email: `admin@ecovana.local`
- Password: `NovaAdmin123!`

The admin account is created automatically on first start. Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `SESSION_SECRET` environment variables before deployment.

## Important notes
- UPI/online payment is a demo option and does not charge real money. Real payments require a payment gateway and server-side verification.
- If you already have an older `store.db`, existing products remain in that database. The EcoVana seed products are inserted automatically only when the products table is empty. For a fresh demo catalogue, stop the server and back up/rename the old `store.db` before restarting. Do not delete a database you need to preserve.
- This is a local internship demo, not a production-hardened deployment. Use a production session store, HTTPS, secure secrets, and payment gateway integration before going live.

### Saved delivery address

After a customer signs in or registers, EcoVana asks for a delivery address if their account does not have one saved. The address is stored in the `users.address` database column and is pre-filled at checkout. Customers can update the saved address from the account menu. The address entered at checkout is also saved to the account for future orders. Existing databases are migrated automatically when the server starts.
