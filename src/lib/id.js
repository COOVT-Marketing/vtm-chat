const crypto = require('crypto');

function makeId(prefix = '') {
  const rand = crypto.randomBytes(9).toString('base64url');
  return prefix ? `${prefix}_${rand}` : rand;
}

module.exports = { makeId };
