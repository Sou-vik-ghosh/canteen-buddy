const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database(path.join(__dirname, 'canteen_v3.db'), (err) => {
  if (err) {
    console.error('Database error:', err.message);
  } else {
    console.log('Connected to SQLite database (canteen_v3.db).');
    initDb();
  }
});

function initDb() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      discount_percent INTEGER DEFAULT 0,
      prepared_qty INTEGER DEFAULT 25,
      available INTEGER DEFAULT 1
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL UNIQUE,
      subtitle TEXT,
      capacity INTEGER NOT NULL DEFAULT 5,
      off_peak_discount INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      student_email TEXT NOT NULL,
      items_json TEXT NOT NULL,
      subtotal REAL NOT NULL,
      discount_amount REAL DEFAULT 0,
      total REAL NOT NULL,
      slot TEXT NOT NULL,
      status TEXT DEFAULT 'New',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS feedbacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_name TEXT NOT NULL,
      rating INTEGER NOT NULL,
      category TEXT DEFAULT 'Food Quality',
      comment TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`);

    // Seed Menu Items with prepared batch quantities for food wastage tracking
    db.get('SELECT COUNT(*) AS count FROM menu_items', (err, row) => {
      if (!err && row.count === 0) {
        const stmt = db.prepare('INSERT INTO menu_items (name, price, discount_percent, prepared_qty, available) VALUES (?, ?, ?, ?, ?)');
        const items = [
          ['Masala Dosa & Sambar', 60, 15, 30, 1],
          ['Paneer Tikka Roll', 90, 20, 25, 1],
          ['Veg Hakka Noodles', 75, 0, 20, 1],
          ['Chole Bhature (2 pcs)', 80, 10, 25, 1],
          ['Cold Coffee with Ice Cream', 60, 25, 35, 1],
          ['Aloo Paratha with Curd', 50, 30, 15, 1]
        ];
        items.forEach((i) => stmt.run(i));
        stmt.finalize();
      }
    });

    // Seed Limited Pickup Slots
    db.get('SELECT COUNT(*) AS count FROM slots', (err, row) => {
      if (!err && row.count === 0) {
        const stmt = db.prepare('INSERT INTO slots (label, subtitle, capacity, off_peak_discount) VALUES (?, ?, ?, ?)');
        const slots = [
          ['10:00 AM - 11:00 AM', 'Early Bird Off-Peak (+5% Extra Off)', 5, 5],
          ['11:00 AM - 12:00 PM', 'Pre-Lunch Window (+5% Extra Off)', 5, 5],
          ['12:00 PM - 01:00 PM', 'Peak Lunch Rush (Limited to 5)', 5, 0],
          ['01:00 PM - 02:00 PM', 'Afternoon Slot (Limited to 5)', 5, 0]
        ];
        slots.forEach((s) => stmt.run(s));
        stmt.finalize();
      }
    });

    // Seed Initial Order History so Top-Selling Rankings & Wastage Metrics show immediately
    db.get('SELECT COUNT(*) AS count FROM orders', (err, row) => {
      if (!err && row.count === 0) {
        const stmt = db.prepare(
          'INSERT INTO orders (token, student_email, items_json, subtotal, discount_amount, total, slot, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        const sampleOrders = [
          [
            '#CB-101',
            'aarav@college.edu',
            JSON.stringify([
              { id: 1, name: 'Masala Dosa & Sambar', price: 51, qty: 4 },
              { id: 5, name: 'Cold Coffee with Ice Cream', price: 45, qty: 3 }
            ]),
            339,
            17,
            322,
            '10:00 AM - 11:00 AM',
            'Completed'
          ],
          [
            '#CB-102',
            'priya@college.edu',
            JSON.stringify([
              { id: 1, name: 'Masala Dosa & Sambar', price: 51, qty: 3 },
              { id: 2, name: 'Paneer Tikka Roll', price: 72, qty: 4 }
            ]),
            441,
            22,
            419,
            '11:00 AM - 12:00 PM',
            'Completed'
          ],
          [
            '#CB-103',
            'rohan@college.edu',
            JSON.stringify([
              { id: 2, name: 'Paneer Tikka Roll', price: 72, qty: 2 },
              { id: 4, name: 'Chole Bhature (2 pcs)', price: 72, qty: 3 }
            ]),
            360,
            0,
            360,
            '12:00 PM - 01:00 PM',
            'Preparing'
          ],
          [
            '#CB-104',
            'sneha@college.edu',
            JSON.stringify([
              { id: 1, name: 'Masala Dosa & Sambar', price: 51, qty: 2 },
              { id: 3, name: 'Veg Hakka Noodles', price: 75, qty: 1 }
            ]),
            177,
            0,
            177,
            '12:00 PM - 01:00 PM',
            'New'
          ]
        ];
        sampleOrders.forEach((o) => stmt.run(o));
        stmt.finalize();
      }
    });

    // Seed Default Google Form URL
    db.get("SELECT value FROM settings WHERE key = 'google_form_url'", (err, row) => {
      if (!err && !row) {
        db.run("INSERT INTO settings (key, value) VALUES ('google_form_url', 'https://docs.google.com/forms/d/e/1FAIpQLSf_DEMO_CANTEEN_FEEDBACK/viewform')");
      }
    });

    // Seed Sample Feedback
    db.get('SELECT COUNT(*) AS count FROM feedbacks', (err, row) => {
      if (!err && row.count === 0) {
        db.run(
          'INSERT INTO feedbacks (student_name, rating, category, comment) VALUES (?, ?, ?, ?)',
          ['Rohan Das', 5, 'Zero Food Wastage', 'Pre-ordering made sure my Masala Dosa was cooked fresh on demand with zero leftover waste!']
        );
      }
    });
  });
}

// --- AUTH ---
app.post('/api/login', (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });

  if (role === 'staff') {
    if (email === 'staff@canteen.edu' && password === 'staff123') {
      return res.json({ success: true, user: { email, role: 'staff', name: 'Kitchen Admin' } });
    }
    return res.status(401).json({ error: 'Invalid staff credentials (staff@canteen.edu / staff123)' });
  } else {
    if (email === 'student@college.edu' && password === 'student123') {
      return res.json({ success: true, user: { email, role: 'student', name: 'Student' } });
    }
    return res.status(401).json({ error: 'Invalid student credentials (student@college.edu / student123)' });
  }
});

// --- MENU ---
app.get('/api/menu', (req, res) => {
  db.all('SELECT * FROM menu_items ORDER BY discount_percent DESC, id ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(
      rows.map((r) => {
        const finalPrice = Math.round(r.price * (1 - (r.discount_percent || 0) / 100));
        return {
          ...r,
          available: Boolean(r.available),
          final_price: finalPrice
        };
      })
    );
  });
});

app.post('/api/menu', (req, res) => {
  const { name, price, discount_percent, prepared_qty, available } = req.body;
  if (!name || Number(price) <= 0) return res.status(400).json({ error: 'Valid name and price required.' });
  const disc = Math.min(90, Math.max(0, Number(discount_percent) || 0));
  const prep = Math.max(1, Number(prepared_qty) || 20);
  const avail = available ? 1 : 0;

  db.run(
    'INSERT INTO menu_items (name, price, discount_percent, prepared_qty, available) VALUES (?, ?, ?, ?, ?)',
    [name.trim(), Number(price), disc, prep, avail],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, name: name.trim(), price: Number(price), discount_percent: disc, prepared_qty: prep, available: Boolean(avail) });
    }
  );
});

app.put('/api/menu/:id', (req, res) => {
  const { id } = req.params;
  const { price, discount_percent, prepared_qty, available } = req.body;
  db.get('SELECT * FROM menu_items WHERE id = ?', [id], (err, existing) => {
    if (err || !existing) return res.status(404).json({ error: 'Item not found.' });

    const newPrice = price !== undefined ? Number(price) : existing.price;
    const newDisc = discount_percent !== undefined ? Math.min(90, Math.max(0, Number(discount_percent))) : existing.discount_percent;
    const newPrep = prepared_qty !== undefined ? Math.max(1, Number(prepared_qty)) : existing.prepared_qty;
    const newAvail = available !== undefined ? (available ? 1 : 0) : existing.available;

    db.run(
      'UPDATE menu_items SET price = ?, discount_percent = ?, prepared_qty = ?, available = ? WHERE id = ?',
      [newPrice, newDisc, newPrep, newAvail, id],
      (uErr) => {
        if (uErr) return res.status(500).json({ error: uErr.message });
        res.json({ id: Number(id), price: newPrice, discount_percent: newDisc, prepared_qty: newPrep, available: Boolean(newAvail) });
      }
    );
  });
});

app.delete('/api/menu/:id', (req, res) => {
  db.run('DELETE FROM menu_items WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes > 0 });
  });
});

// --- ANALYTICS: TOP-SELLING RANKINGS & FOOD WASTAGE PREVENTION ---
app.get('/api/analytics', (req, res) => {
  db.all('SELECT * FROM menu_items', [], (mErr, menuRows) => {
    if (mErr) return res.status(500).json({ error: mErr.message });
    db.all("SELECT * FROM orders WHERE status != 'Cancelled' ORDER BY id DESC", [], (oErr, orderRows) => {
      if (oErr) return res.status(500).json({ error: oErr.message });

      const salesMap = {};
      let totalRevenue = 0;
      let totalPortionsSold = 0;

      orderRows.forEach((order) => {
        totalRevenue += Number(order.total || 0);
        let parsed = [];
        try {
          parsed = JSON.parse(order.items_json);
        } catch (_) {}
        parsed.forEach((item) => {
          const key = item.name;
          if (!salesMap[key]) {
            salesMap[key] = { name: key, qty_sold: 0, revenue: 0 };
          }
          salesMap[key].qty_sold += Number(item.qty || 0);
          salesMap[key].revenue += Number(item.price || 0) * Number(item.qty || 0);
          totalPortionsSold += Number(item.qty || 0);
        });
      });

      // Rank Top-Selling Items (Top 1, Top 2, Top 3...)
      const rankedItems = Object.values(salesMap)
        .sort((a, b) => b.qty_sold - a.qty_sold)
        .map((item, idx) => ({
          rank: idx + 1,
          ...item
        }));

      // Food Wastage & Demand Forecasting Report per Dish
      let totalPrepared = 0;
      let totalUnsoldSurplus = 0;

      const wastageReport = menuRows.map((m) => {
        const sold = salesMap[m.name] ? salesMap[m.name].qty_sold : 0;
        const prepared = Number(m.prepared_qty || 20);
        const unsold = Math.max(0, prepared - sold);
        const utilizationPct = Math.min(100, Math.round((sold / prepared) * 100));

        totalPrepared += prepared;
        totalUnsoldSurplus += unsold;

        let recommendation = 'Balanced Demand';
        let riskLevel = 'low';
        if (unsold >= Math.ceil(prepared * 0.5) && m.discount_percent < 20) {
          recommendation = 'High Surplus Risk → Apply 25% Flash Discount';
          riskLevel = 'high';
        } else if (sold >= prepared) {
          recommendation = 'Sold Out / High Demand → Prep +5 Next Batch';
          riskLevel = 'optimal';
        } else if (unsold > 0) {
          recommendation = 'Moderate Surplus → Offer Flash Deal';
          riskLevel = 'medium';
        }

        return {
          id: m.id,
          name: m.name,
          prepared,
          sold,
          unsold,
          utilization_pct: utilizationPct,
          discount_percent: m.discount_percent,
          risk_level: riskLevel,
          recommendation
        };
      });

      // Estimate food saved via pre-ordering (approx 0.35 kg saved per pre-booked meal vs blind cooking)
      const foodSavedKg = Number((totalPortionsSold * 0.35).toFixed(1));
      const wasteReductionRate = totalPrepared > 0
        ? Math.min(100, Math.round((totalPortionsSold / totalPrepared) * 100))
        : 0;

      res.json({
        total_orders: orderRows.length,
        total_revenue: totalRevenue,
        total_portions_sold: totalPortionsSold,
        top_sellers: rankedItems,
        wastage_summary: {
          total_prepared: totalPrepared,
          total_sold: totalPortionsSold,
          total_unsold_surplus: totalUnsoldSurplus,
          food_saved_kg: foodSavedKg,
          efficiency_pct: wasteReductionRate
        },
        wastage_report: wastageReport
      });
    });
  });
});

// --- SLOTS ---
app.get('/api/slots', (req, res) => {
  db.all('SELECT * FROM slots ORDER BY id ASC', [], (err, slots) => {
    if (err) return res.status(500).json({ error: err.message });
    db.all("SELECT slot, COUNT(*) AS booked FROM orders WHERE status != 'Cancelled' GROUP BY slot", [], (oErr, counts) => {
      if (oErr) return res.status(500).json({ error: oErr.message });
      const countMap = {};
      counts.forEach((c) => (countMap[c.slot] = c.booked));

      const enriched = slots.map((s) => {
        const booked = countMap[s.label] || 0;
        const remaining = Math.max(0, s.capacity - booked);
        return {
          ...s,
          booked,
          remaining,
          is_full: booked >= s.capacity
        };
      });
      res.json(enriched);
    });
  });
});

app.put('/api/slots/:id', (req, res) => {
  const { capacity } = req.body;
  const cap = Math.max(1, Number(capacity) || 5);
  db.run('UPDATE slots SET capacity = ? WHERE id = ?', [cap, req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: Number(req.params.id), capacity: cap });
  });
});

// --- ORDERS ---
app.get('/api/orders', (req, res) => {
  db.all('SELECT * FROM orders ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(
      rows.map((r) => ({
        ...r,
        items: JSON.parse(r.items_json)
      }))
    );
  });
});

app.post('/api/orders', (req, res) => {
  const { student_email, items, subtotal, discount_amount, total, slot } = req.body;
  if (!items || !items.length || !slot) {
    return res.status(400).json({ error: 'Items and pickup slot are required.' });
  }

  db.get('SELECT * FROM slots WHERE label = ?', [slot], (sErr, slotRow) => {
    if (sErr || !slotRow) return res.status(400).json({ error: 'Invalid time slot selected.' });

    db.get("SELECT COUNT(*) AS booked FROM orders WHERE slot = ? AND status != 'Cancelled'", [slot], (cErr, countRow) => {
      const booked = countRow ? countRow.booked : 0;
      if (booked >= slotRow.capacity) {
        return res.status(409).json({
          error: `Look, ${slotRow.capacity} people have already booked the ${slot} slot, so it is FULL. Please select the next available slot!`
        });
      }

      db.get('SELECT MAX(id) AS maxId FROM orders', [], (mErr, maxRow) => {
        const nextNum = 101 + (maxRow && maxRow.maxId ? maxRow.maxId : 0);
        const token = `#CB-${nextNum}`;
        const email = student_email || 'student@college.edu';

        db.run(
          'INSERT INTO orders (token, student_email, items_json, subtotal, discount_amount, total, slot, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [token, email, JSON.stringify(items), Number(subtotal), Number(discount_amount || 0), Number(total), slot, 'New'],
          function (insErr) {
            if (insErr) return res.status(500).json({ error: insErr.message });
            res.status(201).json({
              id: this.lastID,
              token,
              student_email: email,
              items,
              subtotal: Number(subtotal),
              discount_amount: Number(discount_amount || 0),
              total: Number(total),
              slot,
              status: 'New'
            });
          }
        );
      });
    });
  });
});

app.put('/api/orders/:id/status', (req, res) => {
  const { status } = req.body;
  db.run('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: Number(req.params.id), status });
  });
});

// --- FEEDBACK & GOOGLE FORM ---
app.get('/api/feedback', (req, res) => {
  db.all('SELECT * FROM feedbacks ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/feedback', (req, res) => {
  const { student_name, rating, category, comment } = req.body;
  if (!student_name || !comment) return res.status(400).json({ error: 'Name and comment required.' });
  const safeRating = Math.min(5, Math.max(1, Number(rating) || 5));

  db.run(
    'INSERT INTO feedbacks (student_name, rating, category, comment) VALUES (?, ?, ?, ?)',
    [student_name.trim(), safeRating, category || 'Food Quality', comment.trim()],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID });
    }
  );
});

app.get('/api/settings/google-form', (req, res) => {
  db.get("SELECT value FROM settings WHERE key = 'google_form_url'", [], (err, row) => {
    res.json({ url: row ? row.value : '' });
  });
});

app.put('/api/settings/google-form', (req, res) => {
  const { url } = req.body;
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('google_form_url', ?)", [url.trim()], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ url: url.trim() });
  });
});

app.listen(PORT, () => {
  console.log(`Canteen Buddy v3 running at http://localhost:${PORT}`);
});
