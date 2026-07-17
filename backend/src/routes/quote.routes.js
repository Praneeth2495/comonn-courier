const router = require('express').Router();
const { getInstantQuote, listCountries, listServices } = require('../controllers/quote.controller');

router.post('/', getInstantQuote);
router.get('/countries', listCountries);
router.get('/services', listServices);

module.exports = router;
