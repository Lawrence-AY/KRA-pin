const express = require('express');
const kraController = require('../controllers/kraController');
const { requireBearerToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');
const {
  validatePinByIdPayload,
  validatePinPayload,
  validateTccPayload
} = require('../middleware/validatePayload');
const { validateSession } = require('../middleware/validateSession');

const router = express.Router();

router.post('/session', validateSession, asyncHandler(kraController.createKraSession));

router.use(requireBearerToken);

router.post(['/pin', '/pin-by-pin'], validatePinPayload, asyncHandler(kraController.checkPinByPin));
router.post('/pin-by-id', validatePinByIdPayload, asyncHandler(kraController.checkPinById));
router.post('/tcc', validateTccPayload, asyncHandler(kraController.checkTcc));

module.exports = router;
