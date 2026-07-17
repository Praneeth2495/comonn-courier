const { PrismaClient } = require('@prisma/client');

// Reuse a single PrismaClient instance across the app (recommended pattern
// to avoid exhausting DB connections, especially under nodemon/hot-reload).
const prisma = global.__comonn_prisma__ || new PrismaClient();
if (process.env.NODE_ENV !== 'production') {
  global.__comonn_prisma__ = prisma;
}

module.exports = { prisma };
