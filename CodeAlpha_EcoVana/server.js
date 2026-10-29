const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'store.db');
let db;
function saveDatabase() { fs.writeFileSync(DB_PATH, Buffer.from(db.export())); }
function run(sql, params = []) { db.run(sql, params); saveDatabase(); }
function get(sql, params = []) { const s = db.prepare(sql); try { s.bind(params); return s.step() ? s.getAsObject() : undefined; } finally { s.free(); } }
function all(sql, params = []) { const s = db.prepare(sql); const rows = []; try { s.bind(params); while (s.step()) rows.push(s.getAsObject()); return rows; } finally { s.free(); } }
function cleanString(v, max = 200) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
const safeUser = u => u ? ({ id: u.id, name: u.name, email: u.email, role: u.role || 'customer', address: u.address || '' }) : null;
function requireAuth(req, res, next) { if (!req.session.userId) return res.status(401).json({ error: 'Please log in to continue.' }); next(); }
function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Please sign in first.' });
  const user = get('SELECT id,role FROM users WHERE id = ?', [req.session.userId]);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Administrator access required.' });
  next();
}

async function start() {
  const SQL = await initSqlJs();
  db = fs.existsSync(DB_PATH) ? new SQL.Database(fs.readFileSync(DB_PATH)) : new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  db.run(`
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer', address TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, price REAL NOT NULL CHECK(price >= 0), image TEXT NOT NULL, stock INTEGER NOT NULL DEFAULT 20);
    CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), total REAL NOT NULL, address TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Confirmed', payment_method TEXT NOT NULL DEFAULT 'Cash on Delivery', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, product_id INTEGER NOT NULL REFERENCES products(id), product_name TEXT NOT NULL, price REAL NOT NULL, quantity INTEGER NOT NULL);
  `);
  // Migrate an existing database created by the previous project version.
  const columns = all('PRAGMA table_info(users)');
  if (!columns.some(c => c.name === 'role')) { db.run("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'customer'"); saveDatabase(); }
  if (!columns.some(c => c.name === 'address')) { db.run("ALTER TABLE users ADD COLUMN address TEXT NOT NULL DEFAULT ''"); saveDatabase(); }
  const orderColumns = all('PRAGMA table_info(orders)');
  if (!orderColumns.some(c => c.name === 'payment_method')) { db.run("ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'Cash on Delivery'"); saveDatabase(); }

  const seed = [
    ['Everyday Reusable Bottle','A durable stainless-steel bottle designed to replace single-use plastic.','Reusables',699,'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=85',35],
    ['Bamboo Toothbrush Set','A simple everyday swap with a bamboo handle and soft bristles.','Personal Care',249,'https://images.unsplash.com/photo-1609840114035-3c981b782dfe?auto=format&fit=crop&w=900&q=85',40],
    ['Organic Cotton Tote','A sturdy reusable tote for market trips, books, and daily errands.','Reusables',399,'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?auto=format&fit=crop&w=900&q=85',30],
    ['Natural Soy Candle','A warm, calming candle for slower evenings and mindful moments.','Home',599,'https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=900&q=85',15],
    ['Reusable Produce Bags','Lightweight washable bags for fruit, vegetables, and bulk shopping.','Reusables',349,'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=900&q=85',40],
    ['Bamboo Kitchen Brush','A practical plant-based alternative for everyday dish washing.','Home',299,'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=900&q=85',22],
    ['Solid Shampoo Bar','A compact, low-packaging hair-care essential for daily routines.','Personal Care',449,'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=900&q=85',16],
    ['Recycled Paper Notebook','A clean, practical notebook made for ideas, plans, and lists.','Lifestyle',279,'https://images.unsplash.com/photo-1531346878377-a5be20888e57?auto=format&fit=crop&w=900&q=85',28]
  ];
  if (!get('SELECT id FROM products LIMIT 1')) {
    for (const p of seed) db.run('INSERT INTO products (name,description,category,price,image,stock) VALUES (?,?,?,?,?,?)', p);
    saveDatabase();
  }
  // Demo admin account. Change these credentials before any public deployment.
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@ecovana.local').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'NovaAdmin123!';
  if (!get('SELECT id FROM users WHERE email = ?', [adminEmail])) {
    const hash = await bcrypt.hash(adminPassword, 10);
    run('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)', ['EcoVana Administrator', adminEmail, hash, 'admin']);
  } else {
    run("UPDATE users SET role = 'admin' WHERE email = ?", [adminEmail]);
  }

  app.use(express.json({ limit: '100kb' }));
  app.use(session({ secret: process.env.SESSION_SECRET || 'change-this-development-secret-before-deploying', resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 86400000 } }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/products', (req, res) => {
    const search = cleanString(req.query.search, 80), category = cleanString(req.query.category, 50);
    let sql = 'SELECT id,name,description,category,price,image,stock FROM products WHERE 1=1'; const params = [];
    if (search) { sql += ' AND (name LIKE ? OR description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (category && category !== 'All') { sql += ' AND category = ?'; params.push(category); }
    res.json(all(sql + ' ORDER BY id DESC', params));
  });
  app.get('/api/products/:id', (req, res) => { const p = get('SELECT id,name,description,category,price,image,stock FROM products WHERE id = ?', [Number(req.params.id)]); if (!p) return res.status(404).json({error:'Product not found.'}); res.json(p); });
  app.post('/api/auth/register', async (req, res) => {
    const name = cleanString(req.body.name,80), email = cleanString(req.body.email,160).toLowerCase(), password = typeof req.body.password === 'string' ? req.body.password : '';
    if (name.length < 2) return res.status(400).json({error:'Name must contain at least 2 characters.'});
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:'Enter a valid email address.'});
    if (password.length < 8) return res.status(400).json({error:'Password must be at least 8 characters.'});
    try { const hash = await bcrypt.hash(password, 10); run('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)',[name,email,hash,'customer']); const u = get('SELECT id,name,email,role FROM users WHERE email = ?',[email]); req.session.userId = u.id; res.status(201).json({user:safeUser(u)}); }
    catch(e) { if (String(e.message).toLowerCase().includes('unique')) return res.status(409).json({error:'An account with this email already exists.'}); console.error(e); res.status(500).json({error:'Could not create account.'}); }
  });
  app.post('/api/auth/login', async (req, res) => {
    const email = cleanString(req.body.email,160).toLowerCase(), password = typeof req.body.password === 'string' ? req.body.password : '';
    const u = get('SELECT * FROM users WHERE email = ?',[email]);
    if (!u || !(await bcrypt.compare(password,u.password_hash))) return res.status(401).json({error:'Incorrect email or password.'});
    req.session.regenerate(err => { if(err) return res.status(500).json({error:'Could not start session.'}); req.session.userId=u.id; res.json({user:safeUser(u)}); });
  });
  app.get('/api/auth/me',(req,res)=>{const u=req.session.userId?get('SELECT id,name,email,role,address FROM users WHERE id=?',[req.session.userId]):null;res.json({user:safeUser(u)});});
  app.put('/api/profile/address', requireAuth, (req,res)=>{
    const address=cleanString(req.body.address,500);
    if(address.length<8) return res.status(400).json({error:'Please enter a complete address (at least 8 characters).'});
    run('UPDATE users SET address=? WHERE id=?',[address,req.session.userId]);
    const user=get('SELECT id,name,email,role,address FROM users WHERE id=?',[req.session.userId]);
    res.json({user:safeUser(user),message:'Your address has been saved.'});
  });
  app.post('/api/auth/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));

  // Admin-only product management endpoints.
  app.get('/api/admin/products', requireAdmin, (req,res)=>res.json(all('SELECT * FROM products ORDER BY id DESC')));
  app.post('/api/admin/products', requireAdmin, (req,res)=>{
    const name=cleanString(req.body.name,120), description=cleanString(req.body.description,600), category=cleanString(req.body.category,40), image=cleanString(req.body.image,1000);
    const price=Number(req.body.price), stock=Number(req.body.stock);
    if(name.length<2||!description||!['Reusables','Personal Care','Home','Lifestyle','Tech'].includes(category)||!Number.isFinite(price)||price<0||!Number.isInteger(stock)||stock<0||!image) return res.status(400).json({error:'Please enter valid product details.'});
    run('INSERT INTO products (name,description,category,price,image,stock) VALUES (?,?,?,?,?,?)',[name,description,category,price,image,stock]);
    res.status(201).json({product:get('SELECT * FROM products WHERE id=last_insert_rowid()')});
  });
  app.put('/api/admin/products/:id', requireAdmin, (req,res)=>{
    const id=Number(req.params.id), name=cleanString(req.body.name,120), description=cleanString(req.body.description,600), category=cleanString(req.body.category,40), image=cleanString(req.body.image,1000), price=Number(req.body.price), stock=Number(req.body.stock);
    if(!get('SELECT id FROM products WHERE id=?',[id])) return res.status(404).json({error:'Product not found.'});
    if(name.length<2||!description||!['Reusables','Personal Care','Home','Lifestyle','Tech'].includes(category)||!Number.isFinite(price)||price<0||!Number.isInteger(stock)||stock<0||!image) return res.status(400).json({error:'Please enter valid product details.'});
    run('UPDATE products SET name=?,description=?,category=?,price=?,image=?,stock=? WHERE id=?',[name,description,category,price,image,stock,id]); res.json({product:get('SELECT * FROM products WHERE id=?',[id])});
  });
  app.delete('/api/admin/products/:id', requireAdmin, (req,res)=>{
    const id=Number(req.params.id); if(!get('SELECT id FROM products WHERE id=?',[id])) return res.status(404).json({error:'Product not found.'});
    try { run('DELETE FROM products WHERE id=?',[id]); res.json({ok:true}); } catch(e) { res.status(409).json({error:'This product appears in an order and cannot be deleted. Set its stock to zero instead.'}); }
  });

  app.post('/api/orders', requireAuth, (req,res)=>{
    const items=Array.isArray(req.body.items)?req.body.items:[], submittedAddress=cleanString(req.body.address,500), paymentMethod=cleanString(req.body.paymentMethod,40);
    const savedUser=get('SELECT address FROM users WHERE id=?',[req.session.userId]);
    const address=submittedAddress || cleanString(savedUser?.address,500);
    if (!['Cash on Delivery','UPI (demo)'].includes(paymentMethod)) return res.status(400).json({error:'Please choose a valid payment method.'});
    if(!items.length||items.length>40) return res.status(400).json({error:'Your cart is empty or contains too many items.'});
    if(address.length<8) return res.status(400).json({error:'Please save a complete address before placing your order.'});
    const quantities=new Map(); for(const item of items){const id=Number(item.id),q=Number(item.quantity);if(!Number.isInteger(id)||!Number.isInteger(q)||q<1||q>20)return res.status(400).json({error:'One or more cart items are invalid.'});quantities.set(id,(quantities.get(id)||0)+q);}
    try { const rows=[]; let total=0; for(const [id,q] of quantities){const p=get('SELECT id,name,price,stock FROM products WHERE id=?',[id]);if(!p)return res.status(409).json({error:'A product in your cart no longer exists.'});if(p.stock<q)return res.status(409).json({error:`${p.name} does not have enough stock.`});total+=p.price*q;rows.push({...p,quantity:q});}
      db.run('BEGIN TRANSACTION');db.run('UPDATE users SET address=? WHERE id=?',[address,req.session.userId]);db.run('INSERT INTO orders (user_id,total,address,payment_method) VALUES (?,?,?,?)',[req.session.userId,Number(total.toFixed(2)),address,paymentMethod]);const orderId=get('SELECT last_insert_rowid() AS id').id;
      for(const p of rows){db.run('INSERT INTO order_items (order_id,product_id,product_name,price,quantity) VALUES (?,?,?,?,?)',[orderId,p.id,p.name,p.price,p.quantity]);db.run('UPDATE products SET stock=stock-? WHERE id=?',[p.quantity,p.id]);}db.run('COMMIT');saveDatabase();res.status(201).json({order:{id:orderId,total:Number(total.toFixed(2)),status:'Confirmed',payment_method:paymentMethod}});
    } catch(e){try{db.run('ROLLBACK')}catch(_){}console.error(e);res.status(500).json({error:'Could not process your order.'});}
  });
  app.get('/api/orders',requireAuth,(req,res)=>{const orders=all('SELECT id,total,address,status,payment_method,created_at FROM orders WHERE user_id=? ORDER BY id DESC',[req.session.userId]);res.json(orders.map(o=>({...o,items:all('SELECT product_name,price,quantity FROM order_items WHERE order_id=?',[o.id])})));});
  app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
  app.listen(PORT,()=>console.log(`EcoVana is running at http://localhost:${PORT}`));
}
start().catch(e=>{console.error('Could not start EcoVana:',e);process.exit(1)});
