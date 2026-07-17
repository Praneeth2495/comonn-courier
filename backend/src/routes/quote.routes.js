const router = require('express').Router();
const { getInstantQuote, listCountries, listServices, emailQuote } = require('../controllers/quote.controller');

router.post('/', getInstantQuote);
router.post('/email', emailQuote);
router.get('/countries', listCountries);
router.get('/services', listServices);

module.exports = router;
