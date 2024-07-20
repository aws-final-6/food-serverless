function errLog(apiId, statusCode, statusMessage, additionalInfo = {}) {
  const logMessage = {
    type: "ERROR",
    apiId: apiId, // AUTH_01
    statusCode: statusCode, // 404
    statusMessage: statusMessage, // Not Found
    ...additionalInfo, // 추가정보
  };

  console.log("Backend: ", JSON.stringify(logMessage));
}

function infoLog(apiId, reqBody = {}) {
  const logMessage = {
    type: "INFO",
    apiId: apiId,
    reqBody: reqBody,
  };

  console.log("Backend: ", JSON.stringify(logMessage));
}

function successLog(apiId) {
  const logMessage = {
    type: "SUCCESS",
    apiId: apiId, // AUTH_01
    statusCode: 200,
    statusMessage: "OK",
  };

  console.log("Backend: ", JSON.stringify(logMessage));
}

module.exports = { errLog, infoLog, successLog };
