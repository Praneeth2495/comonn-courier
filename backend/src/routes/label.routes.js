const router = require('express').Router();
const { optionalAuth } = require('../middleware/auth');
const { generateLabel, downloadLabel } = require('../controllers/label.controller');

router.post('/:orderId/generate', optionalAuth, generateLabel);
router.get('/download/:labelId', optionalAuth, downloadLabel);

module.exports = router;
