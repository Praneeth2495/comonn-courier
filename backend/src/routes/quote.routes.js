const router = require('express').Router();
const { getInstantQuote, listCountries, listServices, postcodeSuggestions, emailQuote } = require('../controllers/quote.controller');

router.post('/', getInstantQuote);
router.post('/email', emailQuote);
router.get('/countries', listCountries);
router.get('/services', listServices);
router.get('/postcode-suggestions', postcodeSuggestions);

module.exports = router;
