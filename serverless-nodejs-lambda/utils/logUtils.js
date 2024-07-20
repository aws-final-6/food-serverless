// utils/logUtils.js

function errLog(apiId, statusCode, statusMessage, additionalInfo = {}) {
  const logMessage = {
    apiId: apiId, // AUTH_01
    statusCode: statusCode, // 404
    statusMessage: statusMessage, // Not Found
    ...additionalInfo, // 추가정보
  };

  console.log("Backend: ", JSON.stringify(logMessage));
}

module.exports = { errLog };
