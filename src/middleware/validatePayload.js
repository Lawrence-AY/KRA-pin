function validateRequiredStrings(fields, message) {
  return function validatePayload(req, res, next) {
    const body = req.body || {};
    const missing = fields.filter((field) => (
      typeof body[field] !== 'string' || !body[field].trim()
    ));

    if (missing.length > 0) {
      return res.status(400).json({
        message: message || `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} required`
      });
    }

    return next();
  };
}

const validatePinPayload = validateRequiredStrings(['KRAPIN']);
const validatePinByIdPayload = validateRequiredStrings(
  ['TaxpayerType', 'TaxpayerID'],
  'TaxpayerType and TaxpayerID are required'
);
const validateTccPayload = validateRequiredStrings(
  ['kraPIN', 'tccNumber'],
  'kraPIN and tccNumber are required'
);

module.exports = {
  validatePinPayload,
  validatePinByIdPayload,
  validateTccPayload
};
