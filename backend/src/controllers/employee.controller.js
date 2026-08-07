const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { prisma } = require('../config/db');
const { issuePasswordSetToken, passwordSetUrl } = require('../services/accountProvisioning');
const { sendEmail } = require('../services/emailService');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single('idProofFile');

// idProofFileData is never included in list/detail JSON responses — same
// care as PartyInvoice's attachmentData omission — served separately via
// downloadIdProof.
function toEmployeeResponse(user) {
  const profile = user.employeeProfile;
  const { idProofFileData, ...profileRest } = profile || {};
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    driverRegion: user.driverRegion,
    createdAt: user.createdAt,
    profile: profile ? { ...profileRest, hasIdProofFile: Boolean(idProofFileData) } : null,
  };
}

/** GET /api/admin/employees — ADMIN only: every STAFF/DRIVER account with its onboarding profile, if any. */
async function listEmployees(req, res, next) {
  try {
    const users = await prisma.user.findMany({
      where: { role: { in: ['STAFF', 'DRIVER'] } },
      include: { employeeProfile: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ employees: users.map(toEmployeeResponse) });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/employees/:id */
async function getEmployee(req, res, next) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: { employeeProfile: true } });
    if (!user) return res.status(404).json({ error: 'Employee not found' });
    res.json({ employee: toEmployeeResponse(user) });
  } catch (err) {
    next(err);
  }
}

function profileFieldsFromBody(body) {
  return {
    designation: body.designation?.trim() || null,
    department: body.department?.trim() || null,
    dateOfJoining: body.dateOfJoining ? new Date(body.dateOfJoining) : null,
    addressLine1: body.addressLine1?.trim() || null,
    addressLine2: body.addressLine2?.trim() || null,
    city: body.city?.trim() || null,
    state: body.state?.trim() || null,
    postcode: body.postcode?.trim() || null,
    emergencyContactName: body.emergencyContactName?.trim() || null,
    emergencyContactRelation: body.emergencyContactRelation?.trim() || null,
    emergencyContactPhone: body.emergencyContactPhone?.trim() || null,
    idProofType: body.idProofType?.trim() || null,
    idProofNumber: body.idProofNumber?.trim() || null,
    bankAccountName: body.bankAccountName?.trim() || null,
    bankAccountNumber: body.bankAccountNumber?.trim() || null,
    bankIfsc: body.bankIfsc?.trim() || null,
    bankName: body.bankName?.trim() || null,
  };
}

/**
 * POST /api/admin/employees (multipart/form-data, optional `idProofFile`)
 * Creates the login account itself — STAFF or DRIVER, chosen by the admin
 * filling this form — and the onboarding profile in one step, so a new
 * hire doesn't need to self-register first and get manually promoted.
 * Same random-password + emailed set-password-link pattern as a
 * guest-checkout account (accountProvisioning.js) — the admin never
 * chooses or sees the employee's password.
 */
async function createEmployee(req, res, next) {
  upload(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ error: uploadErr.message });
    try {
      const { fullName, email, phone, role } = req.body;
      if (!fullName?.trim() || !email?.trim() || !['STAFF', 'DRIVER'].includes(role)) {
        return res.status(400).json({ error: 'fullName, email and a role of STAFF or DRIVER are required' });
      }
      const normalizedEmail = email.toLowerCase().trim();
      const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

      const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 12);
      const user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          fullName: fullName.trim(),
          phone: phone?.trim() || null,
          role,
        },
      });

      await prisma.employeeProfile.create({
        data: {
          userId: user.id,
          ...profileFieldsFromBody(req.body),
          idProofFileName: req.file?.originalname || null,
          idProofFileMime: req.file?.mimetype || null,
          idProofFileData: req.file?.buffer || null,
        },
      });

      const rawToken = await issuePasswordSetToken(user.id);
      try {
        await sendEmail({
          to: user.email,
          subject: 'Welcome to Comonn — set up your account',
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#171C2C;">
              <h2 style="color:#0E1B3D;margin-bottom:8px;">Welcome to Comonn, ${user.fullName}!</h2>
              <p style="font-size:13.5px;color:#5B6478;line-height:1.6;">An account has been created for you as ${role === 'DRIVER' ? 'a driver' : 'a staff member'}. Click below to set your password and get started.</p>
              <p style="margin:22px 0;"><a href="${passwordSetUrl(rawToken)}" style="background:#FF5A36;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Set up my password →</a></p>
              <p style="font-size:12px;color:#8A93A6;">This link expires in 24 hours.</p>
            </div>
          `,
        });
      } catch (emailErr) {
        // Account creation itself already succeeded — a delivery failure
        // here shouldn't roll that back. Admin can resend via the same
        // forgot-password flow the employee would use themselves.
        console.error('Failed to send employee welcome email:', emailErr);
      }

      const full = await prisma.user.findUnique({ where: { id: user.id }, include: { employeeProfile: true } });
      res.status(201).json({ employee: toEmployeeResponse(full) });
    } catch (err) {
      next(err);
    }
  });
}

/** PATCH /api/admin/employees/:id (multipart/form-data, optional new `idProofFile`) */
async function updateEmployee(req, res, next) {
  upload(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ error: uploadErr.message });
    try {
      const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (!existing) return res.status(404).json({ error: 'Employee not found' });

      const { fullName, phone } = req.body;
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          fullName: fullName !== undefined ? fullName.trim() : undefined,
          phone: phone !== undefined ? (phone.trim() || null) : undefined,
        },
      });

      const profileData = profileFieldsFromBody(req.body);
      if (req.file) {
        profileData.idProofFileName = req.file.originalname;
        profileData.idProofFileMime = req.file.mimetype;
        profileData.idProofFileData = req.file.buffer;
      }

      await prisma.employeeProfile.upsert({
        where: { userId: existing.id },
        update: profileData,
        create: { userId: existing.id, ...profileData },
      });

      const full = await prisma.user.findUnique({ where: { id: existing.id }, include: { employeeProfile: true } });
      res.json({ employee: toEmployeeResponse(full) });
    } catch (err) {
      next(err);
    }
  });
}

/** GET /api/admin/employees/:id/id-proof — streams the uploaded ID document. */
async function downloadIdProof(req, res, next) {
  try {
    const profile = await prisma.employeeProfile.findUnique({ where: { userId: req.params.id } });
    if (!profile?.idProofFileData) return res.status(404).json({ error: 'No ID proof document on file' });
    res.setHeader('Content-Type', profile.idProofFileMime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${profile.idProofFileName || 'id-proof'}"`);
    res.send(profile.idProofFileData);
  } catch (err) {
    next(err);
  }
}

module.exports = { listEmployees, getEmployee, createEmployee, updateEmployee, downloadIdProof };
