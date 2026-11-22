const API_BASE = '/api';
let currentUser = null;
let loginRole = 'student';
let menuCache = [];
let slotsCache = [];
let ordersCache = [];
let cart = {};
let selectedSlotObj = null;
let menuFilter = 'all';
let orderStatusFilter = 'ALL';

document.addEventListener('DOMContentLoaded', () => {
  loadLandingData();
  loadGoogleFormUrl();
});

// --- NAVIGATION & MODALS ---
function toggleSidebar() {
  const drawer = document.getElementById('sidebarDrawer');
  const overlay = document.getElementById('sidebarOverlay');
  const isClosed = drawer.classList.contains('translate-x-full');
  drawer.classList.toggle('translate-x-full', !isClosed);
  overlay.classList.toggle('hidden', !isClosed);
}

function navigateHome() {
  if (!currentUser) showView('viewLanding');
  else if (currentUser.role === 'student') showView('viewStudent');
  else showView('viewStaff');
}

function showView(viewId) {
  ['viewLanding', 'viewStudent', 'viewStaff'].forEach((id) => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById(viewId).classList.remove('hidden');
}

function openDealsShortcut() {
  if (currentUser && currentUser.role === 'student') {
    showView('viewStudent');
    setStudentStep(1);
    setMenuFilter('discounted');
  } else {
    openLoginModal('student');
  }
}

// --- AUTH ---
function openLoginModal(role) {
  loginRole = role;
  document.getElementById('loginRoleTag').textContent = role === 'staff' ? 'Kitchen Staff Portal' : 'Student Portal';
  document.getElementById('loginModalTitle').textContent = role === 'staff' ? 'Staff Login' : 'Student Login';
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginError').classList.add('hidden');
  document.getElementById('loginModal').classList.remove('hidden');
}

function closeLoginModal() {
  document.getElementById('loginModal').classList.add('hidden');
}

function fillDemoCredentials() {
  if (loginRole === 'staff') {
    document.getElementById('loginEmail').value = 'staff@canteen.edu';
    document.getElementById('loginPassword').value = 'staff123';
  } else {
    document.getElementById('loginEmail').value = 'student@college.edu';
    document.getElementById('loginPassword').value = 'student123';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.classList.add('hidden');

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role: loginRole })
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || 'Login failed.';
      errEl.classList.remove('hidden');
      return;
    }
    currentUser = data.user;
    closeLoginModal();
    updateHeaderUser();
    if (currentUser.role === 'student') {
      showView('viewStudent');
      resetStudentOrder();
      loadStudentMyOrders();
    } else {
      showView('viewStaff');
      refreshStaffDashboard();
    }
  } catch (err) {
    errEl.textContent = 'Backend unreachable. Run "npm start" in VS Code terminal.';
    errEl.classList.remove('hidden');
  }
}

function updateHeaderUser() {
  const badge = document.getElementById('userBadge');
  const logoutBtn = document.getElementById('logoutBtn');
  if (currentUser) {
    badge.textContent = `${currentUser.role === 'staff' ? '👨‍🍳' : '🎓'} ${currentUser.email}`;
    badge.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
    logoutBtn.classList.add('hidden');
  }
}

function logout() {
  currentUser = null;
  cart = {};
  selectedSlotObj = null;
  updateHeaderUser();
  showView('viewLanding');
  loadLandingData();
}

// --- LANDING SHOWCASE (TOP SELLERS, DEALS & FOOD SAVED) ---
async function loadLandingData() {
  try {
    const [menuRes, analyticsRes] = await Promise.all([
      fetch(`${API_BASE}/menu`),
      fetch(`${API_BASE}/analytics`)
    ]);
    const items = await menuRes.json();
    const analytics = await analyticsRes.json();

    // Food saved badge
    const savedBadge = document.getElementById('landingFoodSavedBadge');
    if (savedBadge && analytics.wastage_summary) {
      savedBadge.textContent = `${analytics.wastage_summary.food_saved_kg} kg Food Saved`;
    }

    // Top 3 Sellers
    const topContainer = document.getElementById('landingTopSellersList');
    const top3 = (analytics.top_sellers || []).slice(0, 3);
    if (!top3.length) {
      topContainer.innerHTML = '<p class="text-sm text-slate-400">No orders recorded yet.</p>';
    } else {
      topContainer.innerHTML = top3.map((item) => {
        const medal = item.rank === 1 ? '🥇 Top 1' : item.rank === 2 ? '🥈 Top 2' : '🥉 Top 3';
        const rankClass = item.rank === 1 ? 'rank-1' : item.rank === 2 ? 'rank-2' : 'rank-3';
        return `
          <div class="p-3.5 rounded-2xl border ${rankClass} flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-extrabold">${medal}</span>
              <div>
                <div class="font-bold text-slate-900 text-sm">${escapeHtml(item.name)}</div>
                <div class="text-xs text-slate-600">${item.qty_sold} plates ordered</div>
              </div>
            </div>
            <span class="font-extrabold text-slate-900 text-sm">₹${item.revenue}</span>
          </div>
        `;
      }).join('');
    }

    // Discounted Deals
    const deals = items.filter((i) => i.available && i.discount_percent > 0).slice(0, 4);
    const grid = document.getElementById('landingDealsGrid');
    if (!deals.length) {
      grid.innerHTML = '<p class="text-sm text-slate-400">No active discounts right now.</p>';
    } else {
      grid.innerHTML = deals.map((d) => `
        <div class="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 flex flex-col justify-between">
          <div>
            <span class="inline-block px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-extrabold">${d.discount_percent}% OFF</span>
            <h3 class="font-bold text-slate-900 text-sm mt-1.5">${escapeHtml(d.name)}</h3>
          </div>
          <div class="mt-2 flex items-baseline gap-2">
            <span class="text-lg font-extrabold text-orange-600">₹${d.final_price}</span>
            <span class="text-xs line-through text-slate-400">₹${d.price}</span>
          </div>
        </div>
      `).join('');
    }
  } catch (_) {}
}

// --- STUDENT PORTAL ---
async function loadStudentMenu() {
  const res = await fetch(`${API_BASE}/menu`);
  menuCache = await res.json();
  renderStudentMenu();
}

function setMenuFilter(filter) {
  menuFilter = filter;
  const allBtn = document.getElementById('filterAllBtn');
  const discBtn = document.getElementById('filterDiscountBtn');
  if (filter === 'discounted') {
    discBtn.className = 'px-3.5 py-2 rounded-lg bg-orange-500 text-white shadow-xs flex items-center gap-1';
    allBtn.className = 'px-3.5 py-2 rounded-lg text-slate-600 hover:text-slate-900';
  } else {
    allBtn.className = 'px-3.5 py-2 rounded-lg bg-white text-slate-900 shadow-xs';
    discBtn.className = 'px-3.5 py-2 rounded-lg text-slate-600 hover:text-slate-900 flex items-center gap-1';
  }
  renderStudentMenu();
}

function renderStudentMenu() {
  const grid = document.getElementById('studentMenuGrid');
  const filtered = menuFilter === 'discounted'
    ? menuCache.filter((i) => i.discount_percent > 0)
    : menuCache;

  if (!filtered.length) {
    grid.innerHTML = '<p class="text-sm text-slate-500 col-span-full">No items match this filter.</p>';
    return;
  }

  grid.innerHTML = filtered.map((item) => {
    const qty = cart[item.id] || 0;
    const hasDiscount = item.discount_percent > 0;
    return `
      <div class="bg-white rounded-2xl border ${hasDiscount ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200'} ${item.available ? '' : 'opacity-60'} p-5 shadow-xs flex flex-col justify-between">
        <div>
          <div class="flex items-start justify-between gap-2">
            <h3 class="font-bold text-lg text-slate-900">${escapeHtml(item.name)}</h3>
            <span class="px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${item.available ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}">
              ${item.available ? 'Available' : 'Sold Out'}
            </span>
          </div>

          <div class="mt-3 flex items-center gap-2.5">
            <span class="text-2xl font-extrabold text-orange-500">₹${item.final_price}</span>
            ${hasDiscount ? `
              <span class="text-sm line-through text-slate-400">₹${item.price}</span>
              <span class="px-2 py-0.5 rounded-full bg-red-500 text-white text-[11px] font-extrabold">${item.discount_percent}% OFF</span>
            ` : ''}
          </div>
          ${hasDiscount ? `<p class="text-[11px] text-emerald-700 font-semibold mt-1.5">🌱 Zero-Waste Deal: Save food & money</p>` : ''}
        </div>

        <div class="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-400">Quantity</span>
          ${item.available ? `
            <div class="flex items-center gap-3">
              <button onclick="updateQty(${item.id}, -1)" class="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-700">−</button>
              <span class="font-bold w-5 text-center">${qty}</span>
              <button onclick="updateQty(${item.id}, 1)" class="w-8 h-8 rounded-lg bg-orange-500 hover:bg-orange-600 font-bold text-white">+</button>
            </div>
          ` : `<span class="text-xs text-slate-400 italic">Unavailable</span>`}
        </div>
      </div>
    `;
  }).join('');
  updateCartTotal();
}

function updateQty(itemId, delta) {
  const next = (cart[itemId] || 0) + delta;
  if (next <= 0) delete cart[itemId];
  else cart[itemId] = next;
  renderStudentMenu();
}

function getCartDetails() {
  const items = [];
  let subtotal = 0;
  for (const [idStr, qty] of Object.entries(cart)) {
    const item = menuCache.find((m) => m.id === Number(idStr));
    if (item && item.available) {
      items.push({ id: item.id, name: item.name, price: item.final_price, qty });
      subtotal += item.final_price * qty;
    }
  }
  return { items, subtotal };
}

function updateCartTotal() {
  const { subtotal } = getCartDetails();
  document.getElementById('cartTotalDisplay').textContent = `₹${subtotal}`;
}

function setStudentStep(step) {
  ['studentStepMenu', 'studentStepSlot', 'studentStepPayment'].forEach((id) => {
    document.getElementById(id).classList.add('hidden');
  });
  [1, 2, 3].forEach((n) => {
    const badge = document.getElementById(`stepBadge${n}`);
    badge.className = n === step
      ? 'px-3 py-1 rounded-full bg-orange-500 text-white'
      : 'px-3 py-1 rounded-full bg-slate-100 text-slate-500';
  });
  if (step === 1) document.getElementById('studentStepMenu').classList.remove('hidden');
  if (step === 2) document.getElementById('studentStepSlot').classList.remove('hidden');
  if (step === 3) document.getElementById('studentStepPayment').classList.remove('hidden');
}

async function goToSlotSelection() {
  const { items } = getCartDetails();
  if (!items.length) {
    alert('Please select at least one food item first.');
    return;
  }
  setStudentStep(2);
  await loadSlots();
}

async function loadSlots() {
  const res = await fetch(`${API_BASE}/slots`);
  slotsCache = await res.json();
  renderSlots();
}

function renderSlots() {
  const grid = document.getElementById('slotGrid');
  const fullSlots = slotsCache.filter((s) => s.is_full);
  const nextAvailable = slotsCache.find((s) => !s.is_full);

  const alertBanner = document.getElementById('slotFullAlertBanner');
  const alertText = document.getElementById('slotFullAlertText');

  if (fullSlots.length > 0) {
    alertBanner.classList.remove('hidden');
    const names = fullSlots.map((f) => `${f.label} (${f.booked}/${f.capacity} booked)`).join(', ');
    alertText.textContent = `Look, ${names} is FULL! Orders automatically move to ${nextAvailable ? nextAvailable.label : 'the next available window'}.`;
  } else {
    alertBanner.classList.add('hidden');
  }

  if (selectedSlotObj) {
    const fresh = slotsCache.find((s) => s.id === selectedSlotObj.id);
    if (!fresh || fresh.is_full) selectedSlotObj = null;
  }

  grid.innerHTML = slotsCache.map((slot) => {
    const isSelected = selectedSlotObj && selectedSlotObj.id === slot.id;
    const pct = Math.min(100, Math.round((slot.booked / slot.capacity) * 100));

    if (slot.is_full) {
      return `
        <button type="button" disabled class="slot-card slot-full p-4 rounded-2xl border-2 text-left relative">
          <div class="flex items-center justify-between">
            <span class="font-bold text-red-900">${escapeHtml(slot.label)}</span>
            <span class="px-2.5 py-0.5 rounded-full bg-red-600 text-white text-[11px] font-extrabold">FULL (${slot.booked}/${slot.capacity})</span>
          </div>
          <p class="text-xs text-red-700 font-semibold mt-1.5">
            ${slot.capacity} people already booked. Moved to next slot →
          </p>
          <div class="w-full bg-red-200 h-1.5 rounded-full mt-3 overflow-hidden">
            <div class="bg-red-600 h-full" style="width: 100%"></div>
          </div>
        </button>
      `;
    }

    return `
      <button type="button" onclick="selectSlot(${slot.id})"
        class="slot-card p-4 rounded-2xl border-2 text-left ${isSelected ? 'border-orange-500 bg-orange-50 shadow-sm' : 'border-slate-200 hover:border-orange-400 bg-white'}">
        <div class="flex items-center justify-between gap-2">
          <span class="font-bold text-slate-900">${escapeHtml(slot.label)}</span>
          <span class="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
            ${slot.remaining} of ${slot.capacity} left
          </span>
        </div>
        <div class="text-xs text-slate-500 mt-1">${escapeHtml(slot.subtitle || '')}</div>
        <div class="w-full bg-slate-100 h-1.5 rounded-full mt-3 overflow-hidden">
          <div class="bg-orange-500 h-full" style="width: ${pct}%"></div>
        </div>
      </button>
    `;
  }).join('');
}

function selectSlot(slotId) {
  const found = slotsCache.find((s) => s.id === slotId);
  if (!found || found.is_full) return;
  selectedSlotObj = found;
  renderSlots();
}

function goToPayment() {
  if (!selectedSlotObj) {
    alert('Please select an available pickup slot.');
    return;
  }
  const { items, subtotal } = getCartDetails();
  const offPeakRate = selectedSlotObj.off_peak_discount || 0;
  const offPeakSavings = Math.round(subtotal * (offPeakRate / 100));
  const finalTotal = subtotal - offPeakSavings;

  document.getElementById('summarySlot').textContent = selectedSlotObj.label;
  document.getElementById('summaryItemsList').innerHTML = items.map((i) => `
    <div class="flex justify-between">
      <span>${escapeHtml(i.name)} × ${i.qty}</span>
      <span class="font-semibold">₹${i.price * i.qty}</span>
    </div>
  `).join('');

  const offPeakRow = document.getElementById('offPeakRow');
  if (offPeakSavings > 0) {
    offPeakRow.classList.remove('hidden');
    document.getElementById('summaryOffPeakDiscount').textContent = `-₹${offPeakSavings}`;
  } else {
    offPeakRow.classList.add('hidden');
  }

  document.getElementById('summaryTotal').textContent = `₹${finalTotal}`;
  document.getElementById('checkoutBox').classList.remove('hidden');
  document.getElementById('receiptBox').classList.add('hidden');
  document.getElementById('checkoutError').classList.add('hidden');
  setStudentStep(3);
}

async function confirmPayment() {
  const { items, subtotal } = getCartDetails();
  const offPeakRate = selectedSlotObj.off_peak_discount || 0;
  const offPeakSavings = Math.round(subtotal * (offPeakRate / 100));
  const finalTotal = subtotal - offPeakSavings;

  const payBtn = document.getElementById('payNowBtn');
  const errBox = document.getElementById('checkoutError');
  errBox.classList.add('hidden');
  payBtn.disabled = true;
  payBtn.textContent = 'Reserving Slot...';

  try {
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_email: currentUser ? currentUser.email : 'student@college.edu',
        items,
        subtotal,
        discount_amount: offPeakSavings,
        total: finalTotal,
        slot: selectedSlotObj.label
      })
    });
    const data = await res.json();

    if (!res.ok) {
      errBox.textContent = data.error || 'Slot full. Please choose another slot.';
      errBox.classList.remove('hidden');
      await loadSlots();
      return;
    }

    document.getElementById('checkoutBox').classList.add('hidden');
    document.getElementById('receiptBox').classList.remove('hidden');
    document.getElementById('generatedToken').textContent = data.token;
    document.getElementById('receiptDetails').innerHTML = `
      <div class="flex justify-between"><span class="text-slate-500">Reserved Slot:</span><span class="font-bold text-orange-600">${escapeHtml(data.slot)}</span></div>
      <div class="flex justify-between"><span class="text-slate-500">Paid Amount:</span><span class="font-bold text-emerald-600">₹${data.total}</span></div>
      <div class="pt-2 border-t border-slate-200 text-xs text-slate-600">
        Items: ${data.items.map((i) => `${i.name} (x${i.qty})`).join(', ')}
      </div>
    `;
    loadStudentMyOrders();
  } finally {
    payBtn.disabled = false;
    payBtn.textContent = 'Pay & Generate Token';
  }
}

function resetStudentOrder() {
  cart = {};
  selectedSlotObj = null;
  setStudentStep(1);
  loadStudentMenu();
}

function toggleStudentOrdersDrawer() {
  const panel = document.getElementById('studentMyOrdersPanel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) loadStudentMyOrders();
}

async function loadStudentMyOrders() {
  const res = await fetch(`${API_BASE}/orders`);
  const all = await res.json();
  const mine = currentUser ? all.filter((o) => o.student_email === currentUser.email) : all;
  document.getElementById('myOrdersCount').textContent = mine.length;

  const list = document.getElementById('studentMyOrdersList');
  if (!mine.length) {
    list.innerHTML = '<p class="text-xs text-slate-400">You have not placed any orders yet.</p>';
    return;
  }
  list.innerHTML = mine.map((o) => `
    <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
      <div>
        <div class="flex items-center gap-2">
          <span class="font-mono font-extrabold text-orange-600">${escapeHtml(o.token)}</span>
          <span class="text-[11px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800">${escapeHtml(o.status)}</span>
        </div>
        <div class="text-xs text-slate-600 mt-1">${escapeHtml(o.slot)} • ₹${o.total}</div>
      </div>
    </div>
  `).join('');
}

// --- STAFF PORTAL: ANALYTICS, TOP SELLERS & FOOD WASTAGE ---
async function refreshStaffDashboard() {
  await Promise.all([
    loadStaffAnalytics(),
    loadStaffOrders(),
    loadStaffSlots(),
    loadStaffMenu(),
    loadStaffFeedback(),
    loadGoogleFormUrl()
  ]);
}

async function loadStaffAnalytics() {
  const res = await fetch(`${API_BASE}/analytics`);
  const data = await res.json();

  document.getElementById('kpiTotalOrders').textContent = data.total_orders;
  document.getElementById('kpiTotalRevenue').textContent = `₹${data.total_revenue}`;
  document.getElementById('kpiFoodSaved').textContent = `${data.wastage_summary.food_saved_kg} kg`;
  document.getElementById('kpiEfficiency').textContent = `${data.wastage_summary.efficiency_pct}%`;

  // Top-Selling Items Leaderboard (Top 1, Top 2, Top 3...)
  const topBox = document.getElementById('topSellersContainer');
  if (!data.top_sellers || !data.top_sellers.length) {
    topBox.innerHTML = '<p class="text-sm text-slate-400">No sales recorded in order history yet.</p>';
  } else {
    topBox.innerHTML = data.top_sellers.map((item) => {
      let badge = `#${item.rank}`;
      let cardStyle = 'bg-slate-50 border-slate-200';
      if (item.rank === 1) {
        badge = '🥇 Top 1 Best Seller';
        cardStyle = 'rank-1';
      } else if (item.rank === 2) {
        badge = '🥈 Top 2';
        cardStyle = 'rank-2';
      } else if (item.rank === 3) {
        badge = '🥉 Top 3';
        cardStyle = 'rank-3';
      }

      return `
        <div class="p-3.5 rounded-2xl border ${cardStyle} flex items-center justify-between gap-3">
          <div>
            <span class="inline-block px-2.5 py-0.5 rounded-full bg-slate-900 text-white text-[11px] font-extrabold">${badge}</span>
            <h4 class="font-bold text-slate-900 text-sm mt-1.5">${escapeHtml(item.name)}</h4>
            <p class="text-xs text-slate-600">Total Sold: <strong>${item.qty_sold} units</strong></p>
          </div>
          <div class="text-right">
            <span class="text-xs text-slate-500 block">Sales</span>
            <span class="font-extrabold text-slate-900 text-base">₹${item.revenue}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // Food Wastage Prevention Table
  const wBody = document.getElementById('wastageTableBody');
  wBody.innerHTML = (data.wastage_report || []).map((row) => `
    <tr>
      <td class="py-2.5 px-2 font-semibold text-slate-900">${escapeHtml(row.name)}</td>
      <td class="py-2.5 px-2 text-slate-600">${row.prepared}</td>
      <td class="py-2.5 px-2 font-bold text-emerald-700">${row.sold}</td>
      <td class="py-2.5 px-2 font-bold ${row.unsold > 10 ? 'text-red-600' : 'text-slate-700'}">${row.unsold} left</td>
      <td class="py-2.5 px-2">
        ${row.unsold > 0 && row.discount_percent < 25 ? `
          <button onclick="applySurplusFlashDeal(${row.id})" class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition">
            ⚡ Apply 25% Surplus Deal
          </button>
        ` : `
          <span class="text-[11px] font-semibold ${row.risk_level === 'optimal' ? 'text-emerald-600' : 'text-amber-700'}">
            ${escapeHtml(row.recommendation)}
          </span>
        `}
      </td>
    </tr>
  `).join('');
}

async function applySurplusFlashDeal(menuId) {
  await fetch(`${API_BASE}/menu/${menuId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ discount_percent: 25 })
  });
  alert('25% Surplus Flash Discount activated on Student Menu to clear remaining portions before closing!');
  refreshStaffDashboard();
}

// --- ORDERS, SLOTS & MENU MANAGEMENT ---
function setOrderStatusFilter(status) {
  orderStatusFilter = status;
  document.querySelectorAll('.order-filter-btn').forEach((btn) => {
    const label = btn.textContent.trim();
    const active = (status === 'ALL' && label === 'All History') || label.toUpperCase() === status.toUpperCase();
    btn.className = active
      ? 'order-filter-btn px-3 py-1.5 rounded-lg bg-slate-900 text-white'
      : 'order-filter-btn px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700';
  });
  renderStaffOrders();
}

async function loadStaffOrders() {
  const res = await fetch(`${API_BASE}/orders`);
  ordersCache = await res.json();
  renderStaffOrders();
}

function renderStaffOrders() {
  const container = document.getElementById('staffOrdersList');
  const filtered = orderStatusFilter === 'ALL'
    ? ordersCache
    : ordersCache.filter((o) => o.status === orderStatusFilter);

  if (!filtered.length) {
    container.innerHTML = '<p class="text-sm text-slate-400 col-span-full">No orders found in this filter.</p>';
    return;
  }

  container.innerHTML = filtered.map((o) => `
    <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-3">
      <div>
        <div class="flex items-center justify-between">
          <span class="font-mono font-extrabold text-lg text-orange-600">${escapeHtml(o.token)}</span>
          <span class="text-xs font-bold px-2.5 py-0.5 rounded-full ${
            o.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' :
            o.status === 'Preparing' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
          }">${escapeHtml(o.status)}</span>
        </div>
        <div class="text-xs font-bold text-slate-700 mt-1">🕒 ${escapeHtml(o.slot)}</div>
        <div class="text-xs text-slate-500 mt-0.5">${escapeHtml(o.student_email)}</div>
        <div class="mt-2 pt-2 border-t border-slate-200 text-xs text-slate-700 space-y-1">
          ${o.items.map((i) => `<div>• ${escapeHtml(i.name)} × <strong>${i.qty}</strong></div>`).join('')}
        </div>
      </div>
      <div class="flex items-center justify-between pt-2 border-t border-slate-200">
        <span class="font-extrabold text-slate-900">₹${o.total}</span>
        <select onchange="updateOrderStatus(${o.id}, this.value)" class="text-xs font-bold px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white">
          <option value="New" ${o.status === 'New' ? 'selected' : ''}>New</option>
          <option value="Preparing" ${o.status === 'Preparing' ? 'selected' : ''}>Preparing</option>
          <option value="Completed" ${o.status === 'Completed' ? 'selected' : ''}>Completed</option>
        </select>
      </div>
    </div>
  `).join('');
}

async function updateOrderStatus(orderId, status) {
  await fetch(`${API_BASE}/orders/${orderId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  loadStaffOrders();
}

async function loadStaffSlots() {
  const res = await fetch(`${API_BASE}/slots`);
  const slots = await res.json();
  const grid = document.getElementById('staffSlotsGrid');
  grid.innerHTML = slots.map((s) => `
    <div class="p-4 rounded-2xl border ${s.is_full ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'} space-y-2">
      <div class="flex items-center justify-between">
        <span class="font-bold text-xs text-slate-900">${escapeHtml(s.label)}</span>
        <span class="text-[11px] font-extrabold px-2 py-0.5 rounded-full ${s.is_full ? 'bg-red-600 text-white' : 'bg-emerald-100 text-emerald-800'}">
          ${s.booked}/${s.capacity}
        </span>
      </div>
      <div class="flex items-center justify-between text-xs pt-2">
        <label class="text-slate-500 font-semibold">Max Limit:</label>
        <input type="number" min="1" max="50" value="${s.capacity}" onchange="updateSlotCapacity(${s.id}, this.value)"
          class="w-16 px-2 py-1 rounded-lg border border-slate-300 bg-white font-bold text-center" />
      </div>
    </div>
  `).join('');
}

async function updateSlotCapacity(slotId, capacity) {
  await fetch(`${API_BASE}/slots/${slotId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ capacity: Number(capacity) })
  });
  loadStaffSlots();
}

async function loadStaffMenu() {
  const res = await fetch(`${API_BASE}/menu`);
  const items = await res.json();
  const tbody = document.getElementById('staffMenuTableBody');
  tbody.innerHTML = items.map((item) => `
    <tr>
      <td class="py-3 px-2 font-semibold text-slate-900">${escapeHtml(item.name)}</td>
      <td class="py-3 px-2">
        <input type="number" value="${item.price}" min="1" onchange="updateMenuRow(${item.id}, this.value, null, null)"
          class="w-16 px-2 py-1 rounded-lg border border-slate-300 text-xs font-bold" />
      </td>
      <td class="py-3 px-2">
        <input type="number" value="${item.discount_percent}" min="0" max="90" onchange="updateMenuRow(${item.id}, null, this.value, null)"
          class="w-14 px-2 py-1 rounded-lg border border-amber-300 bg-amber-50 text-xs font-bold text-amber-800" />
      </td>
      <td class="py-3 px-2">
        <input type="number" value="${item.prepared_qty || 20}" min="1" onchange="updateMenuRow(${item.id}, null, null, this.value)"
          class="w-14 px-2 py-1 rounded-lg border border-emerald-300 bg-emerald-50 text-xs font-bold text-emerald-800" />
      </td>
      <td class="py-3 px-2 font-extrabold text-orange-600">₹${item.final_price}</td>
      <td class="py-3 px-2">
        <button onclick="toggleItemAvailability(${item.id}, ${!item.available})"
          class="px-2.5 py-1 rounded-full text-xs font-bold ${item.available ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}">
          ${item.available ? 'Active' : 'Hidden'}
        </button>
      </td>
      <td class="py-3 px-2 text-right">
        <button onclick="deleteMenuItem(${item.id})" class="text-xs font-bold text-red-600 hover:underline">Delete</button>
      </td>
    </tr>
  `).join('');
}

async function addMenuItem(e) {
  e.preventDefault();
  const name = document.getElementById('newFoodName').value.trim();
  const price = Number(document.getElementById('newFoodPrice').value);
  const discount_percent = Number(document.getElementById('newFoodDiscount').value) || 0;
  const prepared_qty = Number(document.getElementById('newFoodPrep').value) || 20;
  const available = document.getElementById('newFoodAvail').checked;

  await fetch(`${API_BASE}/menu`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, price, discount_percent, prepared_qty, available })
  });
  document.getElementById('newFoodName').value = '';
  document.getElementById('newFoodPrice').value = '';
  document.getElementById('newFoodDiscount').value = '0';
  refreshStaffDashboard();
}

async function updateMenuRow(id, price, discount_percent, prepared_qty) {
  const payload = {};
  if (price !== null) payload.price = Number(price);
  if (discount_percent !== null) payload.discount_percent = Number(discount_percent);
  if (prepared_qty !== null) payload.prepared_qty = Number(prepared_qty);
  await fetch(`${API_BASE}/menu/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  refreshStaffDashboard();
}

async function toggleItemAvailability(id, available) {
  await fetch(`${API_BASE}/menu/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ available })
  });
  loadStaffMenu();
}

async function deleteMenuItem(id) {
  if (!confirm('Delete this menu item?')) return;
  await fetch(`${API_BASE}/menu/${id}`, { method: 'DELETE' });
  refreshStaffDashboard();
}

// --- FEEDBACK & GOOGLE FORM ---
async function loadGoogleFormUrl() {
  try {
    const res = await fetch(`${API_BASE}/settings/google-form`);
    const data = await res.json();
    const linkEl = document.getElementById('googleFormExternalLink');
    const staffInput = document.getElementById('staffGoogleFormInput');
    if (linkEl && data.url) linkEl.href = data.url;
    if (staffInput && data.url) staffInput.value = data.url;
  } catch (_) {}
}

async function saveGoogleFormUrl() {
  const url = document.getElementById('staffGoogleFormInput').value.trim();
  if (!url) return;
  await fetch(`${API_BASE}/settings/google-form`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  await loadGoogleFormUrl();
  alert('Google Form link updated!');
}

function openFeedbackModal() {
  loadGoogleFormUrl();
  document.getElementById('feedbackModal').classList.remove('hidden');
}

function closeFeedbackModal() {
  document.getElementById('feedbackModal').classList.add('hidden');
}

async function submitFeedback(e) {
  e.preventDefault();
  const student_name = document.getElementById('fbName').value.trim();
  const category = document.getElementById('fbCategory').value;
  const rating = Number(document.getElementById('fbRating').value);
  const comment = document.getElementById('fbComment').value.trim();

  await fetch(`${API_BASE}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ student_name, category, rating, comment })
  });
  document.getElementById('fbComment').value = '';
  closeFeedbackModal();
  alert('Thank you! Your feedback has been submitted.');
  if (currentUser && currentUser.role === 'staff') loadStaffFeedback();
}

async function loadStaffFeedback() {
  const res = await fetch(`${API_BASE}/feedback`);
  const list = await res.json();
  const container = document.getElementById('staffFeedbackList');
  if (!list.length) {
    container.innerHTML = '<p class="text-sm text-slate-400">No feedback submitted yet.</p>';
    return;
  }
  container.innerHTML = list.map((f) => `
    <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
      <div class="flex items-center justify-between">
        <span class="font-bold text-sm text-slate-900">${escapeHtml(f.student_name)}</span>
        <span class="text-amber-500 text-xs font-bold">${'★'.repeat(f.rating)}</span>
      </div>
      <span class="inline-block text-[10px] font-bold uppercase tracking-wider text-orange-600 mt-0.5">${escapeHtml(f.category || '')}</span>
      <p class="text-xs text-slate-600 mt-1">${escapeHtml(f.comment)}</p>
    </div>
  `).join('');
}

// --- INFO & FOOD WASTAGE PROJECT MODAL ---
function openInfoModal(type) {
  const box = document.getElementById('infoModalContent');
  if (type === 'wastage') {
    box.innerHTML = `
      <span class="text-xs font-bold uppercase tracking-wider text-emerald-600">🌱 Project Architecture & Impact</span>
      <h3 class="text-2xl font-extrabold text-slate-900 mt-1">Food Wastage Problem & Solution</h3>
      <div class="mt-4 space-y-4 text-sm text-slate-600 leading-relaxed">
        <div class="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900">
          <strong class="block font-bold">The Problem: Blind Bulk Cooking & Noon Rush</strong>
          Campus canteens guess daily demand and cook large batches before 12:00 PM. Unpopular dishes remain unsold and get thrown away at closing time.
        </div>
        <div class="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-2">
          <strong class="block font-bold">How Canteen Buddy Solves It:</strong>
          <p><strong>1. Pre-Order Demand Locking:</strong> Students book time slots in advance so kitchen staff cook exact portions based on real orders.</p>
          <p><strong>2. Order History & Top-Selling Forecasting:</strong> Stored order history ranks Top 1, Top 2, and Top 3 best sellers so staff prepare higher batches only for proven favorites.</p>
          <p><strong>3. 1-Click Surplus Flash Deals:</strong> The Staff Wastage Monitor flags unsold portions and lets staff trigger a 25% flash discount on the Student Menu to clear leftover food before closing.</p>
        </div>
      </div>`;
  } else if (type === 'about') {
    box.innerHTML = `
      <h3 class="text-2xl font-extrabold text-slate-900">About Canteen Buddy</h3>
      <p class="mt-3 text-slate-600 text-sm leading-relaxed">
        Canteen Buddy is a full-stack campus dining and food-wastage reduction platform combining capped pickup slots, top-selling analytics, surplus flash discounts, and Google Form feedback.
      </p>`;
  } else if (type === 'service') {
    box.innerHTML = `
      <h3 class="text-2xl font-extrabold text-slate-900">How Limited Slots Work</h3>
      <p class="mt-3 text-slate-600 text-sm leading-relaxed">
        Each hourly pickup window holds up to 5 bookings. Once 5 students book a slot, it locks and automatically guides new orders to the next open slot—preventing lunchtime bottlenecks.
      </p>`;
  } else if (type === 'support') {
    box.innerHTML = `
      <h3 class="text-2xl font-extrabold text-slate-900">Help & Support</h3>
      <p class="mt-3 text-slate-600 text-sm">Need assistance with your pickup token or order history? Visit Window #2 at the Main Cafeteria or email <strong>helpdesk@canteenbuddy.edu</strong>.</p>`;
  }
  document.getElementById('infoModal').classList.remove('hidden');
}

function closeInfoModal() {
  document.getElementById('infoModal').classList.add('hidden');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
