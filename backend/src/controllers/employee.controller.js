const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { prisma } = require('../config/db');
const { issuePasswordSetToken, passwordSetUrl } = require('../services/accountProvisioning');
const { sendEmail } = require('../services/emailService');

const uploadIdProofs = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).fields([
  { name: 'idProofFile', maxCount: 1 },
  { name: 'idProofFile2', maxCount: 1 },
]);

const ONBOARDING_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // employee may need days to gather ID documents

async function issueOnboardingToken(userId) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await prisma.employeeOnboardingToken.create({
    data: { userId, tokenHash, expiresAt: new Date(Date.now() + ONBOARDING_TOKEN_TTL_MS) },
  });
  return rawToken;
}

function onboardingInviteUrl(rawToken) {
  const base = (process.env.CLIENT_ORIGIN || 'https://www.comonn.in').split(',')[0].trim();
  return `${base}/onboarding-details?token=${rawToken}`;
}

async function sendOnboardingInviteEmail(user, rawToken) {
  try {
    await sendEmail({
      to: user.email,
      subject: 'Complete your Comonn onboarding details',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#171C2C;">
          <h2 style="color:#0E1B3D;margin-bottom:8px;">Welcome to Comonn, ${user.fullName}!</h2>
          <p style="font-size:13.5px;color:#5B6478;line-height:1.6;">You've been invited to join as ${user.role === 'DRIVER' ? 'a rider' : 'a staff member'}. Please fill in your onboarding details — address, ID proof, and bank details — using the link below.</p>
          <p style="margin:22px 0;"><a href="${onboardingInviteUrl(rawToken)}" style="background:#FF5A36;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Fill my details →</a></p>
          <p style="font-size:12px;color:#8A93A6;">This link expires in 7 days. Once submitted, an admin will review and approve your account before you can log in.</p>
        </div>
      `,
    });
  } catch (emailErr) {
    // Invite creation itself already succeeded — a delivery failure here
    // shouldn't roll that back. Admin can use "Resend link" instead.
    console.error('Failed to send onboarding invite email:', emailErr);
  }
}

async function sendWelcomeEmail(user) {
  const rawToken = await issuePasswordSetToken(user.id);
  try {
    await sendEmail({
      to: user.email,
      subject: 'Welcome to Comonn — set up your account',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#171C2C;">
          <h2 style="color:#0E1B3D;margin-bottom:8px;">Welcome to Comonn, ${user.fullName}!</h2>
          <p style="font-size:13.5px;color:#5B6478;line-height:1.6;">Your account is approved and ready. Click below to set your password and get started.</p>
          <p style="margin:22px 0;"><a href="${passwordSetUrl(rawToken)}" style="background:#FF5A36;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Set up my password →</a></p>
          <p style="font-size:12px;color:#8A93A6;">This link expires in 24 hours.</p>
        </div>
      `,
    });
  } catch (emailErr) {
    console.error('Failed to send employee welcome email:', emailErr);
  }
}

// idProofFileData/idProofFileData2 are never included in list/detail JSON
// responses — same care as PartyInvoice's attachmentData omission — served
// separately via downloadIdProof/downloadIdProof2.
function toEmployeeResponse(user) {
  const profile = user.employeeProfile;
  const { idProofFileData, idProofFileData2, approvedBy, ...profileRest } = profile || {};
  const status = profile?.approvedAt ? 'APPROVED' : profile?.detailsSubmittedAt ? 'SUBMITTED' : profile ? 'INVITED' : null;
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    driverRegion: user.driverRegion,
    createdAt: user.createdAt,
    profile: profile ? {
      ...profileRest,
      hasIdProofFile: Boolean(idProofFileData),
      hasIdProofFile2: Boolean(idProofFileData2),
      approvedByName: approvedBy?.fullName || null,
      status,
    } : null,
  };
}

const EMPLOYEE_INCLUDE = { employeeProfile: { include: { approvedBy: { select: { fullName: true } } } } };

/** GET /api/admin/employees — ADMIN only: every STAFF/DRIVER account with its onboarding profile, if any. */
async function listEmployees(req, res, next) {
  try {
    const users = await prisma.user.findMany({
      where: { role: { in: ['STAFF', 'DRIVER'] } },
      include: EMPLOYEE_INCLUDE,
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
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: EMPLOYEE_INCLUDE });
    if (!user) return res.status(404).json({ error: 'Employee not found' });
    res.json({ employee: toEmployeeResponse(user) });
  } catch (err) {
    next(err);
  }
}

// Admin-settable fields, used by the full one-sitting createEmployee/
// updateEmployee forms. Deliberately separate from
// employeeFillableFieldsFromBody below — an employee's self-fill submission
// must never blank these out just because its own form doesn't include them.
function profileFieldsFromBody(body) {
  return {
    designation: body.designation?.trim() || null,
    department: body.department?.trim() || null,
    dateOfJoining: body.dateOfJoining ? new Date(body.dateOfJoining) : null,
    ...employeeFillableFieldsFromBody(body),
  };
}

// The subset of EmployeeProfile fields an employee fills in themselves via
// the emailed onboarding-details link — no designation/department/
// dateOfJoining, those are admin-decided.
function employeeFillableFieldsFromBody(body) {
  return {
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
    idProofType2: body.idProofType2?.trim() || null,
    idProofNumber2: body.idProofNumber2?.trim() || null,
    bankAccountName: body.bankAccountName?.trim() || null,
    bankAccountNumber: body.bankAccountNumber?.trim() || null,
    bankIfsc: body.bankIfsc?.trim() || null,
    bankName: body.bankName?.trim() || null,
  };
}

function applyIdProofFiles(profileData, files) {
  const file1 = files?.idProofFile?.[0];
  const file2 = files?.idProofFile2?.[0];
  if (file1) {
    profileData.idProofFileName = file1.originalname;
    profileData.idProofFileMime = file1.mimetype;
    profileData.idProofFileData = file1.buffer;
  }
  if (file2) {
    profileData.idProofFileName2 = file2.originalname;
    profileData.idProofFileMime2 = file2.mimetype;
    profileData.idProofFileData2 = file2.buffer;
  }
}

/**
 * POST /api/admin/employees (multipart/form-data, optional `idProofFile`/
 * `idProofFile2`)
 * Creates the login account itself — STAFF or DRIVER, chosen by the admin
 * filling this form — and the onboarding profile in one step, so a new
 * hire doesn't need to self-register first and get manually promoted.
 * Admin filled every field directly, so it's approved immediately (no
 * separate review step — that's only needed for the invite-link path where
 * the employee self-reports their own details).
 */
async function createEmployee(req, res, next) {
  uploadIdProofs(req, res, async (uploadErr) => {
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

      const profileData = profileFieldsFromBody(req.body);
      applyIdProofFiles(profileData, req.files);
      await prisma.employeeProfile.create({
        data: {
          userId: user.id,
          ...profileData,
          approvedAt: new Date(),
          approvedById: req.user.id,
        },
      });

      await sendWelcomeEmail(user);

      const full = await prisma.user.findUnique({ where: { id: user.id }, include: EMPLOYEE_INCLUDE });
      res.status(201).json({ employee: toEmployeeResponse(full) });
    } catch (err) {
      next(err);
    }
  });
}

/** PATCH /api/admin/employees/:id (multipart/form-data, optional new `idProofFile`/`idProofFile2`) */
async function updateEmployee(req, res, next) {
  uploadIdProofs(req, res, async (uploadErr) => {
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
      applyIdProofFiles(profileData, req.files);

      await prisma.employeeProfile.upsert({
        where: { userId: existing.id },
        update: profileData,
        create: { userId: existing.id, ...profileData, approvedAt: new Date(), approvedById: req.user.id },
      });

      const full = await prisma.user.findUnique({ where: { id: existing.id }, include: EMPLOYEE_INCLUDE });
      res.json({ employee: toEmployeeResponse(full) });
    } catch (err) {
      next(err);
    }
  });
}

/**
 * POST /api/admin/employees/invite — the Onboarding page's "Share to
 * employee" action. Admin enters only the basics (name, email, role,
 * optionally designation/department); the account is created right away
 * but with no usable password yet — the employee fills in the rest of
 * their own details via an emailed one-time link, and can't actually log
 * in until an admin reviews and approves (see approveEmployee).
 */
async function inviteEmployee(req, res, next) {
  try {
    const { fullName, email, phone, role, designation, department } = req.body;
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
        designation: designation?.trim() || null,
        department: department?.trim() || null,
      },
    });

    const rawToken = await issueOnboardingToken(user.id);
    await sendOnboardingInviteEmail(user, rawToken);

    const full = await prisma.user.findUnique({ where: { id: user.id }, include: EMPLOYEE_INCLUDE });
    res.status(201).json({ employee: toEmployeeResponse(full) });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/employees/:id/resend-invite — a fresh link, e.g. the first one expired or was lost. */
async function resendOnboardingInvite(req, res, next) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: { employeeProfile: true } });
    if (!user || !user.employeeProfile) return res.status(404).json({ error: 'Employee not found' });
    if (user.employeeProfile.approvedAt) return res.status(409).json({ error: 'This employee is already approved' });

    const rawToken = await issueOnboardingToken(user.id);
    await sendOnboardingInviteEmail(user, rawToken);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/employees/:id/approve — ADMIN reviews the details an
 * invited employee submitted and approves them. This is the moment the
 * account actually becomes usable: it's what triggers the password-set
 * welcome email, same as the one-sitting createEmployee flow gets
 * immediately at creation.
 */
async function approveEmployee(req, res, next) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: { employeeProfile: true } });
    if (!user || !user.employeeProfile) return res.status(404).json({ error: 'Employee not found' });
    if (user.employeeProfile.approvedAt) return res.status(409).json({ error: 'Already approved' });

    await prisma.employeeProfile.update({
      where: { userId: user.id },
      data: { approvedAt: new Date(), approvedById: req.user.id },
    });
    await sendWelcomeEmail(user);

    const full = await prisma.user.findUnique({ where: { id: user.id }, include: EMPLOYEE_INCLUDE });
    res.json({ employee: toEmployeeResponse(full) });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/employees/:id/id-proof — streams the first uploaded ID document. */
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

/** GET /api/admin/employees/:id/id-proof-2 — streams the second uploaded ID document. */
async function downloadIdProof2(req, res, next) {
  try {
    const profile = await prisma.employeeProfile.findUnique({ where: { userId: req.params.id } });
    if (!profile?.idProofFileData2) return res.status(404).json({ error: 'No second ID proof document on file' });
    res.setHeader('Content-Type', profile.idProofFileMime2 || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${profile.idProofFileName2 || 'id-proof-2'}"`);
    res.send(profile.idProofFileData2);
  } catch (err) {
    next(err);
  }
}

// --- Public, token-gated: the employee's own onboarding-details form ---
// No requireAuth — the employee has no usable password yet (see
// approveEmployee) — the unguessable token itself is the only gate, same
// trust model as /api/auth/set-password.

/** GET /api/onboarding-invite/:token */
async function getOnboardingInvite(req, res, next) {
  try {
    const tokenHash = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const record = await prisma.employeeOnboardingToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'This link is invalid or has expired. Contact your admin for a new one.' });
    }
    const user = await prisma.user.findUnique({ where: { id: record.userId }, include: { employeeProfile: true } });
    if (!user) return res.status(404).json({ error: 'Account not found' });
    res.json({
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      designation: user.employeeProfile?.designation || null,
      department: user.employeeProfile?.department || null,
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/onboarding-invite/:token (multipart/form-data, optional `idProofFile`/`idProofFile2`) */
async function submitOnboardingInvite(req, res, next) {
  uploadIdProofs(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ error: uploadErr.message });
    try {
      const tokenHash = crypto.createHash('sha256').update(req.params.token).digest('hex');
      const record = await prisma.employeeOnboardingToken.findUnique({ where: { tokenHash } });
      if (!record || record.usedAt || record.expiresAt < new Date()) {
        return res.status(400).json({ error: 'This link is invalid or has expired. Contact your admin for a new one.' });
      }

      const profileData = employeeFillableFieldsFromBody(req.body);
      applyIdProofFiles(profileData, req.files);
      profileData.detailsSubmittedAt = new Date();

      const { phone } = req.body;
      await prisma.$transaction([
        prisma.employeeProfile.update({ where: { userId: record.userId }, data: profileData }),
        ...(phone !== undefined ? [prisma.user.update({ where: { id: record.userId }, data: { phone: phone.trim() || null } })] : []),
        prisma.employeeOnboardingToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      ]);

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });
}

module.exports = {
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  inviteEmployee,
  resendOnboardingInvite,
  approveEmployee,
  downloadIdProof,
  downloadIdProof2,
  getOnboardingInvite,
  submitOnboardingInvite,
};
