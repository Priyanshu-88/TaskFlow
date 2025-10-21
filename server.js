const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const http = require('http');
const { Server } = require('socket.io');
const sanitizeHtml = require('sanitize-html');
const db = require('./db');

const app = express();

// Trust Render's proxy - CRITICAL FIX
app.set('trust proxy', 1);

const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'change_this_secret_in_production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
});

app.use(sessionMiddleware);

// Share session with socket.io
io.engine.use((req, res, next) => sessionMiddleware(req, res, next));

// Serve static files
app.use('/public', express.static(path.join(__dirname, 'public')));

// Helper: auth guard
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

// Auth routes
app.post('/signup', async (req, res) => {
  try {
    const firstName = String(req.body.first_name || '').trim();
    const lastName = String(req.body.last_name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirm_password || '');
    
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Password strength validation
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }
    
    const hash = await bcrypt.hash(password, 10);
    const insert = db.prepare('INSERT INTO users (first_name, last_name, email, password_hash) VALUES (?, ?, ?, ?)');
    try {
      const info = insert.run(firstName, lastName, email, hash);
      req.session.user = { id: info.lastInsertRowid, firstName, lastName, email };
      res.json({ ok: true });
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists' });
      throw e;
    }
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/signin', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
    req.session.user = { id: user.id, firstName: user.first_name, lastName: user.last_name, email: user.email };
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/signout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// Tasks CRUD
app.get('/api/tasks', requireAuth, (req, res) => {
  const { status, priority, sortBy, sortDir } = req.query;
  const clauses = [];
  const params = [];
  clauses.push('assigned_to = ?');
  params.push(req.session.user.id);
  if (status) {
    clauses.push('status = ?');
    params.push(status);
  }
  if (priority) {
    clauses.push('priority = ?');
    params.push(priority);
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const validSort = ['deadline', 'priority', 'status', 'created_at', 'updated_at'];
  const orderBy = validSort.includes(sortBy) ? sortBy : 'created_at';
  const dir = (String(sortDir || '').toUpperCase() === 'ASC') ? 'ASC' : 'DESC';
  const rows = db.prepare(`SELECT * FROM tasks ${where} ORDER BY ${orderBy} ${dir}`).all(...params);
  res.json(rows);
});

app.post('/api/tasks', requireAuth, (req, res) => {
  const body = req.body || {};
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const priority = ['Low','Medium','High'].includes(body.priority) ? body.priority : 'Low';
  const status = ['Pending','In-Progress','Completed'].includes(body.status) ? body.status : 'Pending';
  const deadline = body.deadline ? new Date(body.deadline).toISOString() : null;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const stmt = db.prepare(`INSERT INTO tasks (title, description, priority, status, deadline, assigned_to) VALUES (?, ?, ?, ?, ?, ?)`);
  const info = stmt.run(title, description, priority, status, deadline, req.session.user.id);
  const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(info.lastInsertRowid);
  io.emit('task:created', task);
  res.json(task);
});

app.put('/api/tasks/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const prev = db.prepare('SELECT * FROM tasks WHERE id=? AND assigned_to=?').get(id, req.session.user.id);
  if (!prev) return res.status(404).json({ error: 'Not found' });
  const body = req.body || {};
  const title = (body.title !== undefined) ? String(body.title).trim() : prev.title;
  const description = (body.description !== undefined) ? String(body.description).trim() : prev.description;
  const priority = (['Low','Medium','High'].includes(body.priority)) ? body.priority : prev.priority;
  const status = (['Pending','In-Progress','Completed'].includes(body.status)) ? body.status : prev.status;
  const deadline = body.deadline ? new Date(body.deadline).toISOString() : prev.deadline;
  const stmt = db.prepare('UPDATE tasks SET title=?, description=?, priority=?, status=?, deadline=? WHERE id=?');
  stmt.run(title, description, priority, status, deadline, id);
  const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(id);
  io.emit('task:updated', task);
  res.json(task);
});

app.delete('/api/tasks/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM tasks WHERE id=? AND assigned_to=?').get(id, req.session.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM tasks WHERE id=?').run(id);
  io.emit('task:deleted', { id });
  res.json({ ok: true });
});

// Messages API
app.get('/api/messages', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT m.*, u.first_name, u.last_name FROM messages m JOIN users u ON u.id = m.sender_id ORDER BY m.created_at ASC LIMIT 500').all();
  res.json(rows);
});

app.post('/api/messages', requireAuth, (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Text required' });
  // Optional room support: if a room is provided, the emitted message will
  // be scoped to that room (clients can join rooms via socket.io).
  const room = String(req.body.room || '').trim();
  const clean = sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} });
  const info = db.prepare('INSERT INTO messages (sender_id, text) VALUES (?, ?)').run(req.session.user.id, clean);
  const msg = db.prepare('SELECT m.*, u.first_name, u.last_name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id=?').get(info.lastInsertRowid);
  if (room) {
    // Emit only to sockets in the room
    io.to(room).emit('chat:message', msg);
  } else {
    io.emit('chat:message', msg);
  }
  res.json(msg);
});

// Views
app.get('/', (req, res) => {
  res.redirect('/signin');
});

app.get('/signin', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'signin.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'signup.html'));
});

app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/signin');
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Support legacy /index URL (and /index.html)
app.get(['/index', '/index.html'], (req, res) => {
  if (!req.session.user) return res.redirect('/signin');
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

io.on('connection', (socket) => {
  // Access user session if present
  const session = socket.request && socket.request.session;
  const user = session && session.user ? session.user : null;

  // Join a room. Client should emit {roomId} to join a specific room.
  socket.on('join', (room) => {
    try {
      if (!room) return;
      socket.join(room);
      socket.currentRoom = room;
      socket.to(room).emit('user:joined', { user, socketId: socket.id });
    } catch (e) {
      // ignore
    }
  });

  // Leave a room
  socket.on('leave', (room) => {
    try {
      if (!room) return;
      socket.leave(room);
      socket.to(room).emit('user:left', { user, socketId: socket.id });
      if (socket.currentRoom === room) socket.currentRoom = null;
    } catch (e) {}
  });

  // Basic signalling passthrough for optional WebRTC usage
  socket.on('signal', (payload) => {
    // payload: { to: socketId, data: ... }
    if (payload && payload.to) {
      socket.to(payload.to).emit('signal', { from: socket.id, data: payload.data });
    }
  });

  socket.on('disconnect', () => {
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('user:left', { user, socketId: socket.id });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Server listening on http://localhost:' + PORT);
});
