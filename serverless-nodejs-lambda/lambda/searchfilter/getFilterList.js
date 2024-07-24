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

exports.getFilterList = async (event) => {
  const body = JSON.parse(event.body);
  infoLog("FILTER_01", body);
  const { user_id, access_token } = body;

  // 0. Session 테이블에서 user_id와 access_token이 올바르게 짝지어져 있는지 확인
  const isValidSession = await validateSession(user_id, access_token);
  if (!isValidSession) {
    errLog("FILTER_01", 401, "Unauthorized", {
      user_id: user_id,
      message: "user_id와 access_token이 일치하지 않습니다.",
    });
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

  try {
    // 1. 데이터베이스 풀 생성
    if (!pool) {
      await createPool();
    }

    // 2. SearchFilter에서 user_id로 SELECT
    const [rows] = await pool.query(
      "SELECT ingredient_id FROM SearchFilter WHERE user_id = ?",
      [user_id]
    );

    // 3. 클라이언트로 반환
    const filter_list = rows.map((row) => row.ingredient_id);

    successLog("FILTER_01");
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({ filter_list }),
    };
  } catch (err) {
    errLog("FILTER_01", 500, "Internal Server Error", {
      user_id: user_id,
      error: err.message,
    });
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        message: "검색 필터 목록을 불러오기에 실패했습니다. 다시 시도해주세요.",
      }),
    };
  }
};
