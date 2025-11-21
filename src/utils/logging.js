const apiLogs = require('../models/api_logs');

const logAPICall = async (data) => {
  try {
    await apiLogs.create({ data: data });
  } catch (error) {
    console.error("Error logging API call:", error);
  }
}

module.exports = { logAPICall };