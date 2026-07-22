const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { prisma } = require('../config/db');
const { signUserToken } = require('../utils/jwt');
const { sendEmail } = require('../services/emailService');
const { issuePasswordSetToken, passwordSetUrl } = require('../services/accountProvisioning');

async function register(req, res, next) {
  try {
    const { email, password, fullName, phone, company } = req.body;
    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'email, password and fullName are required' });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        fullName,
        phone,
        company,
        role: 'CUSTOMER',
      },
    });

    const token = signUserToken(user);
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.isActive) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signUserToken(user);
    res.json({
      token,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
    });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, fullName: true, phone: true, company: true, role: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/auth/me — update the logged-in user's own profile details.
 * Email is deliberately not editable here — it's the login identifier and
 * is also used to match guest orders, so changing it needs its own
 * verification flow rather than a plain field edit.
 */
async function updateProfile(req, res, next) {
  try {
    const { fullName, phone, company } = req.body;
    if (fullName !== undefined && !fullName.trim()) {
      return res.status(400).json({ error: 'fullName cannot be empty' });
    }

    const data = {};
    if (fullName !== undefined) data.fullName = fullName.trim();
    if (phone !== undefined) data.phone = phone.trim() || null;
    if (company !== undefined) data.company = company.trim() || null;

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: { id: true, email: true, fullName: true, phone: true, company: true, role: true, createdAt: true },
    });
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'newPassword must be at least 8 characters' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/forgot-password — always responds { ok: true } regardless
 * of whether the email matches an account, so this can't be used to probe
 * for registered emails. If it does match, emails a fresh 24h set-password
 * link (same mechanism used for the initial auto-created-account email).
 */
async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (user && user.isActive) {
      const rawToken = await issuePasswordSetToken(user.id);
      await sendEmail({
        to: user.email,
        from: process.env.EMAIL_FROM_NOREPLY || 'Comonn <noreply@comonn.in>',
        subject: 'Reset your Comonn password',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#171C2C;">
            <h2 style="color:#0E1B3D;margin-bottom:8px;">Reset your password</h2>
            <p style="font-size:13.5px;color:#5B6478;line-height:1.6;">Hi ${user.fullName || ''},</p>
            <p style="font-size:13.5px;color:#5B6478;line-height:1.6;">Click the link below to set a new password for your Comonn account.</p>
            <p style="margin:22px 0;"><a href="${passwordSetUrl(rawToken)}" style="background:#FF5A36;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Reset password →</a></p>
            <p style="font-size:12px;color:#8A93A6;">This link expires in 24 hours. If you didn't request this, you can safely ignore this email.</p>
          </div>
        `,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/set-password — consumes a token from either the
 * auto-created-account welcome email or a forgot-password request, sets
 * the password, and logs the customer straight in.
 */
async function setPassword(req, res, next) {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'token and password are required' });
    if (password.length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const record = await prisma.passwordSetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'This link is invalid or has expired. Request a new one from the login page.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await prisma.passwordSetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });

    const jwtToken = signUserToken(user);
    res.json({
      token: jwtToken,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, me, updateProfile, changePassword, forgotPassword, setPassword };
