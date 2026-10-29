const $ = selector => document.querySelector(selector);
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
let products = [], activeCategory = 'All', cart = JSON.parse(localStorage.getItem('nova-market-cart') || '[]'), currentUser = null, authMode = 'login', toastTimer, checkoutItemIds = [];
cart = cart.map(item => ({ ...item, selected: item.selected !== false }));

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}
function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}
function saveCart() { localStorage.setItem('nova-market-cart', JSON.stringify(cart)); renderCart(); }
function openLayer(selector) { closeLayers(); $('#overlay').classList.add('show'); $(selector).classList.add(selector === '#cartDrawer' ? 'open' : 'open'); document.body.style.overflow = 'hidden'; }
function closeLayers() {
  $('#overlay').classList.remove('show');
  document.querySelectorAll('.drawer.open,.modal.open').forEach(el => el.classList.remove('open'));
  document.body.style.overflow = '';
}
document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', closeLayers));
$('#overlay').addEventListener('click', closeLayers);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLayers(); });

async function loadProducts() {
  const params = new URLSearchParams();
  if ($('#searchInput').value.trim()) params.set('search', $('#searchInput').value.trim());
  if (activeCategory !== 'All') params.set('category', activeCategory);
  try {
    products = await api('/api/products?' + params.toString());
    renderProducts();
  } catch (err) { $('#productGrid').innerHTML = `<div class="empty-state glass">${escapeHtml(err.message)}</div>`; }
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function renderProducts() {
  const grid = $('#productGrid');
  if (!products.length) { grid.innerHTML = '<div class="empty-state glass">No matches yet. Try another search.</div>'; return; }
  grid.innerHTML = products.map((p, i) => `
    <article class="product-card" style="animation-delay:${Math.min(i * 55, 300)}ms">
      <div class="product-photo" data-details="${p.id}" role="button" tabindex="0" aria-label="View ${escapeHtml(p.name)}">
        <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" onerror="this.src='https://placehold.co/700x800/e7ebe2/53604f?text=EcoVana'">
        <span class="category-pill">${escapeHtml(p.category)}</span>
        <button class="quick-add" data-add="${p.id}" aria-label="Add ${escapeHtml(p.name)} to bag">+</button>
      </div>
      <div class="product-meta"><div class="product-meta-top"><h3>${escapeHtml(p.name)}</h3><span class="price">${money(p.price)}</span></div><p>${p.stock > 0 ? 'A thoughtful everyday choice' : 'Currently sold out'}</p></div>
    </article>`).join('');
  grid.querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); addToCart(Number(btn.dataset.add)); }));
  grid.querySelectorAll('[data-details]').forEach(el => {
    el.addEventListener('click', e => { if (!e.target.closest('[data-add]')) showProduct(Number(el.dataset.details)); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter') showProduct(Number(el.dataset.details)); });
  });
}
document.querySelectorAll('.filter').forEach(btn => btn.addEventListener('click', () => {
  activeCategory = btn.dataset.category;
  document.querySelectorAll('.filter').forEach(item => item.classList.toggle('active', item === btn));
  loadProducts();
}));
let searchTimer;
$('#searchInput').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadProducts, 220); });

function addToCart(id) {
  const p = products.find(item => item.id === id) || allKnownProducts.get(id);
  if (!p) return;
  const existing = cart.find(item => item.id === id);
  if (existing) {
    if (existing.quantity >= Math.min(20, p.stock)) return showToast('That is the available quantity for this item.');
    existing.quantity++;
  } else {
    if (p.stock < 1) return showToast('This item is sold out.');
    cart.push({ id, quantity: 1, name: p.name, price: p.price, image: p.image, stock: p.stock, selected: true });
  }
  saveCart(); showToast(`${p.name} added to your bag.`);
}
const allKnownProducts = new Map();
function selectedCartItems() { return cart.filter(item => item.selected !== false); }
function renderCart() {
  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  const selected = selectedCartItems();
  const selectedQuantity = selected.reduce((sum, item) => sum + item.quantity, 0);
  const selectedTotal = selected.reduce((sum, item) => sum + item.price * item.quantity, 0);
  $('#cartCount').textContent = totalQuantity;
  $('#drawerItemCount').textContent = `(${totalQuantity})`;
  $('#subtotal').textContent = money(selectedTotal);
  $('#checkoutTotal').textContent = money(selectedTotal);
  $('#selectedSummary').textContent = selected.length ? `${selected.length} product${selected.length === 1 ? '' : 's'} selected · ${selectedQuantity} item${selectedQuantity === 1 ? '' : 's'}` : 'Select at least one product to continue.';
  $('#selectAllCart').checked = cart.length > 0 && cart.every(item => item.selected !== false);
  $('#selectAllCart').indeterminate = selected.length > 0 && selected.length < cart.length;
  $('#checkoutBtn').disabled = !selected.length;
  $('#checkoutBtn').classList.toggle('button-disabled', !selected.length);
  const holder = $('#cartItems');
  if (!cart.length) { holder.innerHTML = '<div class="empty-cart">Your bag is ready for a greener choice.<br>Add something thoughtful from the collection.</div>'; return; }
  holder.innerHTML = cart.map(item => `<div class="cart-row ${item.selected === false ? 'cart-row-unselected' : ''}">
    <label class="cart-item-check" aria-label="Select ${escapeHtml(item.name)} for checkout"><input type="checkbox" data-select-item="${item.id}" ${item.selected !== false ? 'checked' : ''}></label>
    <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">
    <div class="cart-item-info"><h4>${escapeHtml(item.name)}</h4><div class="cart-price">${money(item.price)}</div>
      <div class="quantity-control"><button data-qty="${item.id}" data-delta="-1" aria-label="Decrease quantity">−</button><span>${item.quantity}</span><button data-qty="${item.id}" data-delta="1" aria-label="Increase quantity">+</button></div>
      <button class="remove-item" data-remove="${item.id}">Remove</button>
    </div><strong class="cart-row-total">${money(item.price * item.quantity)}</strong></div>`).join('');
  holder.querySelectorAll('[data-select-item]').forEach(input => input.addEventListener('change', () => {
    const item = cart.find(row => row.id === Number(input.dataset.selectItem));
    if (item) item.selected = input.checked;
    saveCart();
  }));
  holder.querySelectorAll('[data-qty]').forEach(btn => btn.addEventListener('click', () => {
    const item = cart.find(row => row.id === Number(btn.dataset.qty));
    if (!item) return;
    item.quantity += Number(btn.dataset.delta);
    if (item.quantity < 1) cart = cart.filter(row => row.id !== item.id);
    else if (item.quantity > Math.min(20, item.stock)) { item.quantity = Math.min(20, item.stock); showToast('Maximum available quantity reached.'); }
    saveCart();
  }));
  holder.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', () => { cart = cart.filter(row => row.id !== Number(btn.dataset.remove)); saveCart(); }));
}
$('#selectAllCart').addEventListener('change', () => { cart = cart.map(item => ({ ...item, selected: $('#selectAllCart').checked })); saveCart(); });
$('#clearCartSelection').addEventListener('click', () => { cart = cart.map(item => ({ ...item, selected: false })); saveCart(); });
$('#cartBtn').addEventListener('click', () => { renderCart(); openLayer('#cartDrawer'); });
$('#checkoutBtn').addEventListener('click', async () => {
  const selected = selectedCartItems();
  if (!selected.length) return showToast('Select at least one item to checkout.');
  checkoutItemIds = selected.map(item => item.id);
  if (!currentUser) { closeLayers(); authMode = 'login'; updateAuthForm(); openLayer('#authModal'); showToast('Sign in to continue to checkout.'); return; }
  closeLayers(); $('#checkoutTotal').textContent = money(selected.reduce((sum, item) => sum + item.price * item.quantity, 0)); $('#shippingAddress').value = currentUser.address || ''; openLayer('#checkoutModal');
});
$('#paymentMethod').addEventListener('change', () => {
  $('#paymentNote').textContent = $('#paymentMethod').value === 'Cash on Delivery' ? 'Pay when your order arrives.' : 'Demo only: no real UPI payment will be collected.';
});

function updateAuthForm() {
  const register = authMode === 'register';
  $('#authTitle').textContent = register ? 'Make it yours.' : 'Welcome back.';
  $('#authSubtitle').textContent = register ? 'Create an account for a smoother checkout.' : 'Sign in to pick up where you left off.';
  $('#nameField').hidden = !register; $('#authName').required = register;
  $('#authPassword').autocomplete = register ? 'new-password' : 'current-password';
  $('#authSubmit').innerHTML = `${register ? 'Create account' : 'Sign in'} <span>↗</span>`;
  $('#authSwitch').innerHTML = register ? 'Already have an account? <button type="button" id="toggleAuth">Sign in</button>' : 'New here? <button type="button" id="toggleAuth">Create an account</button>';
  $('#toggleAuth').addEventListener('click', () => { authMode = register ? 'login' : 'register'; updateAuthForm(); });
}
$('#accountBtn').addEventListener('click', () => {
  if (currentUser) { openAccountMenu(); return; }
  authMode = 'login'; updateAuthForm(); openLayer('#authModal');
});
function openAccountMenu() {
  const choice = confirm(`Signed in as ${currentUser.name} (${currentUser.email}).\n\nPress OK to view your orders, or Cancel to sign out.`);
  if (choice) showOrders();
  else if (confirm('Would you like to update your saved delivery address?')) { $('#profileAddress').value = currentUser.address || ''; openLayer('#addressModal'); }
  else api('/api/auth/logout', { method: 'POST' }).then(() => { currentUser = null; updateAccount(); showToast('You are signed out.'); }).catch(err => showToast(err.message));
}
function updateAccount() { $('#accountLabel').textContent = currentUser ? currentUser.name.split(' ')[0] : 'Sign in'; }
$('#authForm').addEventListener('submit', async e => {
  e.preventDefault();
  const body = { email: $('#authEmail').value, password: $('#authPassword').value };
  if (authMode === 'register') body.name = $('#authName').value;
  try {
    const data = await api(`/api/auth/${authMode === 'register' ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify(body) });
    currentUser = data.user; updateAccount(); $('#authForm').reset();
    if (!currentUser.address) { $('#profileAddress').value = ''; openLayer('#addressModal'); showToast('Please save your delivery address to continue.'); }
    else { closeLayers(); showToast(`Welcome${currentUser.name ? ', ' + currentUser.name.split(' ')[0] : ''}!`); if (checkoutItemIds.length) { $('#checkoutTotal').textContent = money(selectedCartItems().reduce((sum, item) => sum + item.price * item.quantity, 0)); $('#shippingAddress').value = currentUser.address; openLayer('#checkoutModal'); } }
  } catch (err) { showToast(err.message); }
});
async function showOrders() {
  if (!currentUser) { authMode = 'login'; updateAuthForm(); openLayer('#authModal'); return; }
  try {
    const orders = await api('/api/orders');
    $('#ordersList').innerHTML = orders.length ? orders.map(order => `
      <article class="order-card">
        <div class="order-card-head"><div><span class="order-number">ORDER #${order.id}</span><h3>${money(order.total)}</h3></div><span class="order-status">${escapeHtml(order.status)}</span></div>
        <p class="order-date">${escapeHtml(order.created_at)} · ${escapeHtml(order.payment_method || 'Cash on Delivery')}</p>
        <div class="order-items-list">${order.items.map(item => `<div><span>${escapeHtml(item.product_name)} × ${item.quantity}</span><strong>${money(item.price * item.quantity)}</strong></div>`).join('')}</div>
        <p class="order-address"><strong>Ship to:</strong> ${escapeHtml(order.address)}</p>
      </article>`).join('') : '<div class="orders-empty">No orders yet. Your next favourite might be waiting in the collection.</div>';
    closeLayers(); openLayer('#ordersModal');
  } catch (err) { showToast(err.message); }
}
$('#addressForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!currentUser) { showToast('Please sign in before saving your address.'); return; }
  const button = $('#addressForm button[type="submit"]'); button.disabled = true; button.textContent = 'Saving address…';
  try {
    const data = await api('/api/profile/address', { method: 'PUT', body: JSON.stringify({ address: $('#profileAddress').value }) });
    currentUser = data.user; $('#shippingAddress').value = currentUser.address; closeLayers(); showToast('Delivery address saved to your account.');
    if (checkoutItemIds.length) { $('#checkoutTotal').textContent = money(selectedCartItems().reduce((sum, item) => sum + item.price * item.quantity, 0)); openLayer('#checkoutModal'); }
  } catch (err) { showToast(err.message); }
  finally { button.disabled = false; button.innerHTML = 'Save address <span>↗</span>'; }
});

$('#checkoutForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!currentUser) { closeLayers(); authMode = 'login'; updateAuthForm(); openLayer('#authModal'); return; }
  const button = $('#checkoutForm button[type="submit"]'); button.disabled = true; button.textContent = 'Placing your order…';
  try {
    const data = await api('/api/orders', { method: 'POST', body: JSON.stringify({ address: $('#shippingAddress').value, paymentMethod: $('#paymentMethod').value, items: cart.filter(item => checkoutItemIds.includes(item.id)).map(item => ({ id: item.id, quantity: item.quantity })) }) });
    const purchasedIds = new Set(checkoutItemIds); cart = cart.filter(item => !purchasedIds.has(item.id)); checkoutItemIds = []; saveCart(); closeLayers(); $('#checkoutForm').reset();
    showToast(`Order #${data.order.id} confirmed · ${money(data.order.total)}. ${data.order.payment_method === 'UPI (demo)' ? 'Demo payment only.' : 'Thank you!'}`);
    await loadProducts();
  } catch (err) { showToast(err.message); }
  finally { button.disabled = false; button.innerHTML = 'Place order <span>↗</span>'; }
});
async function showProduct(id) {
  try {
    const p = await api(`/api/products/${id}`); allKnownProducts.set(p.id, p);
    $('#productDetail').innerHTML = `<div class="product-detail-layout"><img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}"><div class="product-detail-copy"><div class="eyebrow">${escapeHtml(p.category)} · THE EVERYDAY EDIT</div><h2>${escapeHtml(p.name)}</h2><p>${escapeHtml(p.description)}</p><div class="detail-price">${money(p.price)}</div><div class="stock-note">${p.stock > 0 ? `${p.stock} available · Ready to ship` : 'Currently sold out'}</div><button class="primary-button full-button" id="detailAdd" ${p.stock < 1 ? 'disabled' : ''}>Add to bag <span>↗</span></button></div></div>`;
    $('#detailAdd').addEventListener('click', () => { allKnownProducts.set(p.id, p); addToCart(p.id); closeLayers(); });
    openLayer('#productModal');
  } catch (err) { showToast(err.message); }
}
async function init() {
  renderCart();
  try { const data = await api('/api/auth/me'); currentUser = data.user; updateAccount(); } catch (_) {}
  await loadProducts();
}
init();
