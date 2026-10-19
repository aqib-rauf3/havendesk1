/**
 * HavenDesk Multi-Tenant SaaS Server
 * Core entry point for Client Portal (/app), Management Console (/admin), and API (/api/v1).
 */

import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

import { db } from './db/database.js';
import { seedDatabase } from './db/seed.js';

import authRoutes from './routes/auth.js';
import portalRoutes from './routes/portal.js';
import adminRoutes from './routes/admin.js';
import widgetRoutes from './routes/widget.js';
import webhookRoutes from './routes/webhooks.js';

import { applySecurityHeaders, sanitizeInput, csrfGuard } from './middleware/security.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 3000;

// Apply Security HTTP Headers
app.use(applySecurityHeaders);

// Enable CORS & JSON parsing
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply Input Sanitization (XSS mitigation) & CSRF Guard
app.use(sanitizeInput);
app.use(csrfGuard);

// Auto-seed database if tenants table is empty
const tenantCount = db.get("SELECT COUNT(*) as count FROM tenants").count;
if (tenantCount === 0) {
  seedDatabase();
}

// -------------------------------------------------------------
// Static Asset Serving (No-cache in development to ensure immediate asset updates)
const staticOptions = {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
};

// 1. Shared design system, brand config & icons
app.use('/shared', express.static(path.join(ROOT_DIR, 'shared'), staticOptions));

// 2. Client Portal (/app)
app.use('/app', express.static(path.join(ROOT_DIR, 'client-portal'), staticOptions));

// 3. Admin Management Console (/admin)
app.use('/admin', express.static(path.join(ROOT_DIR, 'admin-console'), staticOptions));

// 4. Standalone Public Widget (/widget.js)
app.use('/widget.js', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'widget', 'widget.js'));
});

// -------------------------------------------------------------
// Versioned API Routes (/api/v1)
// -------------------------------------------------------------
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/portal', portalRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/widget', widgetRoutes);
app.use('/api/v1/webhooks', webhookRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    brand: 'HavenDesk',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

// Root route: Redirect to /app or /admin
app.get('/', (req, res) => {
  res.redirect('/app');
});

// 404 handler for API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

const server = app.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`🏛️  HavenDesk Multi-Tenant SaaS Platform is LIVE on http://localhost:${PORT}`);
  console.log(`📱 Client Portal (/app):        http://localhost:${PORT}/app`);
  console.log(`⚙️  Management Console (/admin): http://localhost:${PORT}/admin`);
  console.log(`🔌 API Version 1:              http://localhost:${PORT}/api/v1`);
  console.log(`================================================================`);
});

export default app;
