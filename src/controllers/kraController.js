const {
  validatePinByPin,
  validatePinById,
  validateTcc
} = require('../services/kraClient');

const { createGatewaySession } = require('../services/gatewaySession');
async function createKraSession(req, res) {
  return res.json(createGatewaySession());
}

async function checkPinByPin(req, res) {
  const result = await validatePinByPin(req.body.KRAPIN);
  return res.json(result);
}

async function checkPinById(req, res) {
  const result = await validatePinById(
    req.body.TaxpayerType,
    req.body.TaxpayerID
  );
  return res.json(result);
}

async function checkTcc(req, res) {
  const result = await validateTcc(
    req.body.kraPIN,
    req.body.tccNumber
  );
  return res.json(result);
}

module.exports = {
  createKraSession,
  checkPinByPin,
  checkPinById,
  checkTcc
};
