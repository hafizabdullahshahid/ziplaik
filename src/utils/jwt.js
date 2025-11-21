const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'please_change_this';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

//Diff between verify and decode: verify checks signature and expiration, decode just reads the payload without verification
function decodeToken(token) {
    return jwt.decode(token);
}

function checkIfExpiryInLessThan2Days(token) {
    try {
        const decoded = decodeToken(token)  // This will not throw if token is expired or invalid
        if (!decoded || !decoded.exp) return true; // Invalid token structure
        const currentTime = Math.floor(Date.now() / 1000);
        const twoDaysInSeconds = 2 * 24 * 60 * 60; // 2 days in seconds

        return (decoded.exp - currentTime) < twoDaysInSeconds; // true if expiring in less than 2 days
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return true; // Token is expired
        }
        return true; // Token is invalid for other reasons
    }
}

module.exports = { signToken, verifyToken, checkIfExpiryInLessThan2Days, decodeToken };