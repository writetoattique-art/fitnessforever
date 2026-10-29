const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

// ==========================================
// 1. CONFIGURATION & MONGODB CONNECTION
// ==========================================
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'fitnest_db';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const isProd = process.env.NODE_ENV === 'production';

if (!MONGODB_URI) {
  console.error("FATAL ERROR: MONGODB_URI environment variable is missing.");
  process.exit(1);
}

// Vercel Serverless MongoDB Connection Caching
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}
async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      dbName: MONGODB_DB_NAME,
      serverSelectionTimeoutMS: 5000,
    }).then((mongoose) => mongoose);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

// ==========================================
// 2. MONGOOSE SCHEMAS
// ==========================================
const programSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  category: String,
  durationMinutes: Number,
  price: Number,
  difficulty: String,
  imageUrl: String,
  active: { type: Boolean, default: true }
}, { timestamps: true });

const trainerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  specialty: String,
  biography: String,
  imageUrl: String,
  experienceYears: Number,
  active: { type: Boolean, default: true }
}, { timestamps: true });

const classSessionSchema = new mongoose.Schema({
  program: { type: mongoose.Schema.Types.ObjectId, ref: 'Program', required: true },
  trainer: { type: mongoose.Schema.Types.ObjectId, ref: 'Trainer' },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  capacity: { type: Number, required: true },
  booked: { type: Number, default: 0 },
  status: { type: String, enum: ['scheduled', 'canceled', 'completed'], default: 'scheduled' }
}, { timestamps: true });
classSessionSchema.index({ startTime: 1 });

const bookingSchema = new mongoose.Schema({
  bookingRef: { type: String, unique: true },
  customerName: { type: String, required: true },
  customerEmail: { type: String, required: true },
  customerPhone: { type: String, required: true },
  program: { type: mongoose.Schema.Types.ObjectId, ref: 'Program' },
  trainer: { type: mongoose.Schema.Types.ObjectId, ref: 'Trainer' },
  classSession: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassSession' },
  membershipType: String,
  fitnessLevel: String,
  message: String,
  status: { type: String, enum: ['pending', 'confirmed', 'canceled', 'completed'], default: 'pending' }
}, { timestamps: true });
bookingSchema.index({ bookingRef: 1 });
bookingSchema.index({ customerEmail: 1 });

const membershipInquirySchema = new mongoose.Schema({
  customerName: String,
  customerEmail: String,
  customerPhone: String,
  selectedPlan: String,
  message: String,
  status: { type: String, enum: ['new', 'contacted', 'closed'], default: 'new' }
}, { timestamps: true });

const adminUserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'admin' },
  active: { type: Boolean, default: true }
}, { timestamps: true });

const Program = mongoose.models.Program || mongoose.model('Program', programSchema);
const Trainer = mongoose.models.Trainer || mongoose.model('Trainer', trainerSchema);
const ClassSession = mongoose.models.ClassSession || mongoose.model('ClassSession', classSessionSchema);
const Booking = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);
const MembershipInquiry = mongoose.models.MembershipInquiry || mongoose.model('MembershipInquiry', membershipInquirySchema);
const AdminUser = mongoose.models.AdminUser || mongoose.model('AdminUser', adminUserSchema);

// ==========================================
// 3. MIDDLEWARE & SECURITY
// ==========================================
app.use(helmet({ contentSecurityPolicy: false })); // Disabled to allow embedded client-side code
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Ensure DB is connected before requests
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("DB Connection Error:", err);
    res.status(500).json({ error: 'Database connection failed.' });
  }
});

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGODB_URI, dbName: MONGODB_DB_NAME }),
  cookie: {
    secure: isProd,
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  }
}));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
app.use('/api/', apiLimiter);

// Auth Middleware
const requireAdmin = (req, res, next) => {
  if (req.session && req.session.adminId) return next();
  res.status(401).json({ error: 'Unauthorized' });
};
// CSRF Middleware for state-changing admin ops
const requireCSRF = (req, res, next) => {
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') return next();
  res.status(403).json({ error: 'CSRF validation failed' });
};

// ==========================================
// 4. DEMO DATA SEEDING (Optional)
// ==========================================
async function initializeAdmin() {
  const count = await AdminUser.countDocuments();
  if (count === 0 && process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD_HASH) {
    await AdminUser.create({
      username: process.env.ADMIN_USERNAME,
      passwordHash: process.env.ADMIN_PASSWORD_HASH
    });
  }
}
initializeAdmin();

// ==========================================
// 5. PUBLIC API ROUTES
// ==========================================
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

app.get('/api/programs', async (req, res) => {
  try {
    const programs = await Program.find({ active: true }).sort({ createdAt: -1 });
    res.json(programs);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/trainers', async (req, res) => {
  try {
    const trainers = await Trainer.find({ active: true }).sort({ createdAt: -1 });
    res.json(trainers);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/sessions', async (req, res) => {
  try {
    const now = new Date();
    const sessions = await ClassSession.find({ status: 'scheduled', startTime: { $gt: now } })
      .populate('program').populate('trainer').sort({ startTime: 1 });
    res.json(sessions);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Atomic Booking
app.post('/api/bookings', async (req, res) => {
  try {
    const { customerName, customerEmail, customerPhone, classSessionId, fitnessLevel } = req.body;
    if (!customerName || !customerEmail || !customerPhone || !classSessionId) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }
    // Concurrency control: Atomic update of available capacity
    const session = await ClassSession.findOneAndUpdate(
      { _id: classSessionId, status: 'scheduled', $expr: { $lt: ["$booked", "$capacity"] } },
      { $inc: { booked: 1 } },
      { new: true }
    ).populate('program');

    if (!session) {
      return res.status(400).json({ error: 'Session is full, unavailable, or already started.' });
    }
    const bookingRef = 'FN-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const booking = new Booking({
      bookingRef, customerName, customerEmail, customerPhone,
      program: session.program._id, trainer: session.trainer,
      classSession: session._id, fitnessLevel, status: 'pending'
    });
    await booking.save();
    res.status(201).json({ success: true, bookingRef, message: 'Booking request received.' });
  } catch (err) { res.status(500).json({ error: 'Booking failed.' }); }
});

app.get('/api/bookings/lookup', async (req, res) => {
  try {
    const { ref, email } = req.query;
    if (!ref || !email) return res.status(400).json({ error: 'Missing ref or email' });
    const booking = await Booking.findOne({ bookingRef: ref, customerEmail: email })
      .populate('program').populate('classSession');
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    res.json({ ref: booking.bookingRef, status: booking.status, program: booking.program?.name, session: booking.classSession?.startTime });
  } catch (err) { res.status(500).json({ error: 'Lookup failed' }); }
});

// ==========================================
// 6. ADMIN API ROUTES
// ==========================================
app.post('/api/admin/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await AdminUser.findOne({ username, active: true });
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
    const match = await bcrypt.compare(password, admin.passwordHash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    req.session.adminId = admin._id;
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Login failed' }); }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/admin/me', requireAdmin, async (req, res) => {
  const admin = await AdminUser.findById(req.session.adminId).select('-passwordHash');
  res.json(admin);
});

app.get('/api/admin/dashboard', requireAdmin, async (req, res) => {
  const [totalBookings, pendingBookings, activePrograms, activeTrainers] = await Promise.all([
    Booking.countDocuments(), Booking.countDocuments({ status: 'pending' }),
    Program.countDocuments({ active: true }), Trainer.countDocuments({ active: true })
  ]);
  res.json({ totalBookings, pendingBookings, activePrograms, activeTrainers });
});

app.get('/api/admin/bookings', requireAdmin, async (req, res) => {
  const bookings = await Booking.find().populate('program').populate('classSession').sort({ createdAt: -1 }).limit(50);
  res.json(bookings);
});

app.patch('/api/admin/bookings/:id/status', requireAdmin, requireCSRF, async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'confirmed', 'canceled', 'completed'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    const b = await Booking.findById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Not found' });
    // If canceling, release capacity
    if (b.status !== 'canceled' && status === 'canceled' && b.classSession) {
      await ClassSession.findByIdAndUpdate(b.classSession, { $inc: { booked: -1 } });
    }
    b.status = status;
    await b.save();
    res.json(b);
  } catch (err) { res.status(500).json({ error: 'Update failed' }); }
});

// Admin Programs CRUD
app.get('/api/admin/programs', requireAdmin, async (req, res) => res.json(await Program.find().sort({ createdAt: -1 })));
app.post('/api/admin/programs', requireAdmin, requireCSRF, async (req, res) => res.json(await Program.create(req.body)));
app.patch('/api/admin/programs/:id', requireAdmin, requireCSRF, async (req, res) => res.json(await Program.findByIdAndUpdate(req.params.id, req.body, { new: true })));

// Admin Trainers CRUD
app.get('/api/admin/trainers', requireAdmin, async (req, res) => res.json(await Trainer.find().sort({ createdAt: -1 })));
app.post('/api/admin/trainers', requireAdmin, requireCSRF, async (req, res) => res.json(await Trainer.create(req.body)));
app.patch('/api/admin/trainers/:id', requireAdmin, requireCSRF, async (req, res) => res.json(await Trainer.findByIdAndUpdate(req.params.id, req.body, { new: true })));

// Admin Sessions CRUD
app.get('/api/admin/sessions', requireAdmin, async (req, res) => res.json(await ClassSession.find().populate('program trainer').sort({ startTime: -1 })));
app.post('/api/admin/sessions', requireAdmin, requireCSRF, async (req, res) => res.json(await ClassSession.create(req.body)));
app.patch('/api/admin/sessions/:id', requireAdmin, requireCSRF, async (req, res) => res.json(await ClassSession.findByIdAndUpdate(req.params.id, req.body, { new: true })));

// ==========================================
// 7. FRONTEND (CUSTOMER FACING)
// ==========================================
const getClientHTML = () => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FitNest Fitness Studio</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/feather-icons"></script>
  <style>
    :root {
      --primary: #7957F5; --secondary: #FF795B; --accent: #70E1B1; --highlight: #FFD76A;
      --bg: #F7F5FF; --surface: #FFFFFF; --text-main: #20203A; --text-muted: #77758D;
      --success: #159D70; --error: #E94B64;
      --clay-radius: 28px;
      --clay-shadow: inset 4px 4px 8px rgba(255,255,255,0.8), inset -4px -4px 8px rgba(200,200,220,0.4), 8px 8px 16px rgba(200,200,220,0.5), -8px -8px 16px rgba(255,255,255,0.9);
      --clay-btn-shadow: inset 2px 2px 4px rgba(255,255,255,0.3), inset -2px -2px 4px rgba(0,0,0,0.1), 4px 4px 8px rgba(121, 87, 245, 0.4), -4px -4px 8px rgba(255,255,255,0.8);
      --clay-btn-pressed: inset 6px 6px 10px rgba(0,0,0,0.2), inset -6px -6px 10px rgba(255,255,255,0.2);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; background-color: var(--bg); color: var(--text-main); line-height: 1.6; overflow-x: hidden; scroll-behavior: smooth; }
    a { text-decoration: none; color: inherit; }
    
    /* Claymorphism Utilities */
    .clay-card { background: var(--surface); border-radius: var(--clay-radius); box-shadow: var(--clay-shadow); padding: 32px; transition: transform 0.3s ease; }
    .clay-card:hover { transform: translateY(-5px); }
    .clay-btn { background: var(--primary); color: white; border: none; border-radius: 20px; padding: 14px 28px; font-size: 1rem; font-weight: 600; cursor: pointer; box-shadow: var(--clay-btn-shadow); transition: all 0.2s; display: inline-flex; align-items: center; gap: 8px; justify-content: center; }
    .clay-btn:active { box-shadow: var(--clay-btn-pressed); transform: scale(0.98); }
    .clay-btn.secondary { background: var(--surface); color: var(--primary); box-shadow: var(--clay-shadow); }
    .clay-input { width: 100%; padding: 14px 20px; border-radius: 16px; border: none; background: var(--bg); box-shadow: inset 4px 4px 8px rgba(200,200,220,0.4), inset -4px -4px 8px rgba(255,255,255,0.9); font-size: 1rem; color: var(--text-main); outline: none; margin-bottom: 16px; }
    .clay-input:focus { box-shadow: inset 6px 6px 10px rgba(200,200,220,0.6), inset -6px -6px 10px rgba(255,255,255,0.9); }
    
    /* Navigation */
    nav { position: fixed; top: 0; width: 100%; padding: 20px 5%; display: flex; justify-content: space-between; align-items: center; z-index: 1000; background: rgba(247, 245, 255, 0.85); backdrop-filter: blur(10px); }
    .logo { font-size: 1.5rem; font-weight: 800; color: var(--primary); display: flex; align-items: center; gap: 8px; }
    .nav-links { display: flex; gap: 24px; align-items: center; }
    @media(max-width: 768px) { .nav-links { display: none; } }
    
    /* Layout Sections */
    section { padding: 100px 5%; max-width: 1400px; margin: 0 auto; }
    .hero { display: flex; align-items: center; justify-content: space-between; min-height: 100vh; padding-top: 120px; gap: 40px; }
    .hero-content { flex: 1; z-index: 2; }
    .hero h1 { font-size: clamp(2.5rem, 5vw, 4.5rem); line-height: 1.1; margin-bottom: 24px; color: var(--text-main); }
    .hero p { font-size: 1.2rem; color: var(--text-muted); margin-bottom: 32px; }
    .hero-img-wrapper { flex: 1; position: relative; }
    .hero-img { width: 100%; border-radius: var(--clay-radius); box-shadow: var(--clay-shadow); object-fit: cover; height: 600px; }
    
    .section-title { text-align: center; font-size: 2.5rem; margin-bottom: 48px; }
    .grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 40px; }
    
    /* Stats */
    .stats-container { display: flex; justify-content: space-around; flex-wrap: wrap; gap: 24px; margin-top: -50px; position: relative; z-index: 10; padding: 0 5%; }
    .stat-card { text-align: center; width: 200px; }
    .stat-number { font-size: 2.5rem; font-weight: 800; color: var(--primary); }
    
    /* Generic Badges */
    .badge { padding: 6px 12px; border-radius: 12px; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; }
    .badge.violet { background: rgba(121,87,245,0.1); color: var(--primary); }
    
    /* Footer */
    footer { background: var(--surface); padding: 60px 5%; text-align: center; box-shadow: 0 -10px 20px rgba(200,200,220,0.2); }
    
    /* Decorative Background */
    .blob { position: absolute; filter: blur(60px); opacity: 0.4; z-index: 0; border-radius: 50%; }
    .blob-1 { top: -10%; left: -10%; width: 400px; height: 400px; background: var(--primary); }
    .blob-2 { top: 40%; right: -5%; width: 300px; height: 300px; background: var(--secondary); }
  </style>
</head>
<body>
  <div class="blob blob-1"></div>
  <div class="blob blob-2"></div>

  <nav>
    <div class="logo"><i data-feather="activity"></i> FitNest</div>
    <div class="nav-links">
      <a href="#programs">Programs</a>
      <a href="#trainers">Trainers</a>
      <a href="#schedule">Schedule</a>
      <a href="#booking" class="clay-btn">Book a Session</a>
    </div>
  </nav>

  <section class="hero">
    <div class="hero-content">
      <h1>Your Strongest Self Starts Here.</h1>
      <p>Train smarter, move better, and build a healthier lifestyle with expert coaches and flexible fitness programs in Blue Area, Islamabad.</p>
      <div style="display: flex; gap: 16px; flex-wrap: wrap;">
        <a href="#booking" class="clay-btn">Book Your First Session</a>
        <a href="#programs" class="clay-btn secondary">Explore Programs</a>
      </div>
    </div>
    <div class="hero-img-wrapper">
      <img src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1470&auto=format&fit=crop" alt="Gym Workout" class="hero-img">
    </div>
  </section>

  <div class="stats-container">
    <div class="clay-card stat-card"><div class="stat-number">12+</div><div>Expert Trainers</div></div>
    <div class="clay-card stat-card"><div class="stat-number">30+</div><div>Weekly Classes</div></div>
    <div class="clay-card stat-card"><div class="stat-number">5K+</div><div>Happy Members</div></div>
  </div>

  <section id="programs">
    <h2 class="section-title">Fitness Programs</h2>
    <div class="grid-3" id="programsGrid">
      <p>Loading programs...</p>
    </div>
  </section>

  <section id="booking">
    <h2 class="section-title">Book a Session</h2>
    <div class="clay-card" style="max-width: 800px; margin: 0 auto;">
      <form id="bookingForm">
        <div class="grid-3" style="grid-template-columns: 1fr 1fr; gap: 20px;">
          <input type="text" id="b_name" class="clay-input" placeholder="Full Name" required>
          <input type="email" id="b_email" class="clay-input" placeholder="Email Address" required>
          <input type="tel" id="b_phone" class="clay-input" placeholder="Phone (+92 300...)" required>
          <select id="b_level" class="clay-input" required>
            <option value="" disabled selected>Fitness Level</option>
            <option value="Beginner">Beginner</option>
            <option value="Intermediate">Intermediate</option>
            <option value="Advanced">Advanced</option>
          </select>
        </div>
        <select id="b_session" class="clay-input" required style="margin-top: 16px;">
          <option value="" disabled selected>Loading available sessions...</option>
        </select>
        <button type="submit" class="clay-btn" style="width: 100%; margin-top: 16px;" id="submitBtn">Confirm Booking</button>
        <div id="bookingResult" style="margin-top: 16px; text-align: center; font-weight: bold;"></div>
      </form>
    </div>
  </section>
  
  <section id="lookup">
    <h2 class="section-title">Lookup Your Booking</h2>
    <div class="clay-card" style="max-width: 500px; margin: 0 auto; text-align: center;">
      <input type="text" id="l_ref" class="clay-input" placeholder="Booking Ref (e.g. FN-XXXX)" required>
      <input type="email" id="l_email" class="clay-input" placeholder="Email used for booking" required>
      <button onclick="lookupBooking()" class="clay-btn" style="width: 100%;">Check Status</button>
      <div id="lookupResult" style="margin-top: 16px;"></div>
    </div>
  </section>

  <footer>
    <div style="margin-bottom: 24px;">
      <h3 style="color: var(--primary);">FitNest Fitness Studio</h3>
      <p>Blue Area, Islamabad, Pakistan | WhatsApp: +92 300 1234567</p>
      <p>Mon-Sat 6:00 AM–11:00 PM | Sun 8:00 AM–8:00 PM</p>
    </div>
    <p style="font-size: 0.9rem; color: var(--text-muted);">&copy; 2026 FitNest Fitness Studio. Demo Application. <a href="/admin" style="text-decoration: underline;">Admin Login</a></p>
  </footer>

  <script>
    feather.replace();

    // Fetch and render programs
    async function loadPrograms() {
      try {
        const res = await fetch('/api/programs');
        const programs = await res.json();
        const grid = document.getElementById('programsGrid');
        grid.innerHTML = programs.map(p => \`
          <div class="clay-card">
            <h3 style="margin-bottom:8px;">\${p.name}</h3>
            <span class="badge violet">\${p.difficulty}</span>
            <p style="margin: 16px 0; color: var(--text-muted);">\${p.description || 'Join our expert-led sessions.'}</p>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong>Rs. \${p.price || 3000}</strong>
              <a href="#booking" class="clay-btn" style="padding: 8px 16px; font-size: 0.9rem;">Book</a>
            </div>
          </div>
        \`).join('');
      } catch (e) { document.getElementById('programsGrid').innerHTML = 'Failed to load programs.'; }
    }

    // Fetch sessions for booking form
    async function loadSessions() {
      try {
        const res = await fetch('/api/sessions');
        const sessions = await res.json();
        const sel = document.getElementById('b_session');
        sel.innerHTML = '<option value="" disabled selected>Select an upcoming class...</option>';
        sessions.forEach(s => {
          const avail = s.capacity - s.booked;
          if (avail > 0) {
            const dateStr = new Date(s.startTime).toLocaleString('en-US', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' });
            sel.innerHTML += \`<option value="\${s._id}">\${s.program.name} - \${dateStr} (\${avail} seats left)</option>\`;
          }
        });
      } catch(e) {}
    }

    document.getElementById('bookingForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('submitBtn');
      btn.innerText = 'Processing...'; btn.disabled = true;
      const payload = {
        customerName: document.getElementById('b_name').value,
        customerEmail: document.getElementById('b_email').value,
        customerPhone: document.getElementById('b_phone').value,
        fitnessLevel: document.getElementById('b_level').value,
        classSessionId: document.getElementById('b_session').value
      };
      
      try {
        const res = await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        const resDiv = document.getElementById('bookingResult');
        if (data.success) {
          resDiv.style.color = 'var(--success)';
          resDiv.innerText = \`Success! Ref: \${data.bookingRef}. Status: Pending.\`;
          e.target.reset();
          loadSessions();
        } else {
          resDiv.style.color = 'var(--error)';
          resDiv.innerText = data.error || 'Booking failed.';
        }
      } catch(err) {
        document.getElementById('bookingResult').innerText = 'Network error.';
      }
      btn.innerText = 'Confirm Booking'; btn.disabled = false;
    });

    async function lookupBooking() {
      const ref = document.getElementById('l_ref').value;
      const email = document.getElementById('l_email').value;
      const resDiv = document.getElementById('lookupResult');
      if(!ref || !email) return alert('Enter ref and email');
      resDiv.innerText = 'Looking up...';
      try {
        const res = await fetch(\`/api/bookings/lookup?ref=\${ref}&email=\${email}\`);
        const data = await res.json();
        if(res.ok) {
          resDiv.innerHTML = \`<div class="clay-card" style="padding:16px; margin-top:16px;">
            <strong>Ref:</strong> \${data.ref} <br>
            <strong>Status:</strong> <span class="badge violet">\${data.status}</span><br>
            <strong>Program:</strong> \${data.program}
          </div>\`;
        } else {
          resDiv.innerHTML = \`<span style="color:var(--error)">\${data.error}</span>\`;
        }
      } catch(e) { resDiv.innerText = 'Error connecting to server.'; }
    }

    loadPrograms();
    loadSessions();
  </script>
</body>
</html>`;

// Serve Frontend
app.get('/', (req, res) => res.send(getClientHTML()));

// Serve Admin Dashboard (from admin.js)
const adminApp = require('./admin.js');
app.get('/admin*', (req, res) => res.send(adminApp()));

// Handle 404s
app.use('/api/*', (req, res) => res.status(404).json({ error: 'API endpoint not found' }));
app.use('*', (req, res) => res.status(404).send('<h2>404 - Page Not Found</h2><a href="/">Go Home</a>'));

// Vercel Serverless Export
module.exports = app;
