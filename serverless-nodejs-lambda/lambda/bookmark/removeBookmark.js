const mysql = require("mysql2/promise");
const AWS = require("aws-sdk");
const { validateSession } = require("/opt/nodejs/utils/sessionUtils");
const { errLog, infoLog, successLog } = require("/opt/nodejs/utils/logUtils");

const secretsManager = new AWS.SecretsManager();

let dbPassword;
let pool;

async function getDatabaseCredentials() {
  if (dbPassword) {
    return dbPassword;
  }

  const secretName = process.env.SECRET_NAME;
  const data = await secretsManager
    .getSecretValue({ SecretId: secretName })
    .promise();
  if ("SecretString" in data) {
    const secret = JSON.parse(data.SecretString);
    dbPassword = secret.password;
    return dbPassword;
  } else {
    throw new Error("SecretString not found in Secrets Manager response");
  }
}

async function createPool() {
  const password = await getDatabaseCredentials();
  pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: password,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
}

exports.removeBookmark = async (event) => {
  const body = JSON.parse(event.body);
  infoLog("BOOKMK_03", body);
  const { user_id, access_token, recipe_id } = body;

  // 0. Session 테이블에서 user_id와 access_token이 올바르게 짝지어져 있는지 확인
  const isValidSession = await validateSession(user_id, access_token);
  if (!isValidSession) {
    errLog("BOOKMK_03", 401, "Unauthorized", { user_id: user_id });
    return {
      statusCode: 401,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        message: "user_id와 access_token이 일치하지 않습니다.",
      }),
    };
  }

  // 1. 입력 데이터 체크
  if (!user_id || !recipe_id) {
    errLog("BOOKMK_03", 400, "Bad Request", {
      user_id: user_id,
      recipe_id: recipe_id,
      message: "잘못된 입력 데이터입니다.",
    });
    return {
      statusCode: 400,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({ message: "잘못된 입력 데이터입니다." }),
    };
  }

  try {
    if (!pool) {
      await createPool();
    }

    // 2. 북마크 삭제
    const [result] = await pool.query(
      "DELETE FROM Bookmark WHERE user_id = ? AND recipe_id = ?",
      [user_id, recipe_id]
    );
    successLog("BOOKMK_03");
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({ message: "북마크가 성공적으로 삭제되었습니다." }),
    };
  } catch (err) {
    errLog("BOOKMK_03", 500, "Internal Server Error", {
      user_id: user_id,
      recipe_id: recipe_id,
      error: err.message,
    });
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        message: "북마크 삭제에 실패했습니다. 다시 시도해주세요.",
      }),
    };
  }
};
