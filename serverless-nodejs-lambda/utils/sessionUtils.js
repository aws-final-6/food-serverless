const mysql = require("mysql2/promise");
const AWS = require("aws-sdk");

const secretsManager = new AWS.SecretsManager();

let dbPassword;

// 비밀번호 가져오기 함수
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

// 데이터베이스 연결 설정 (이 설정은 handler.js와 동일하게 해야 함)
async function getDatabasePool() {
  const dbPassword = await getDatabaseCredentials();

  return mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: dbPassword,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
}

// Session 테이블에서 user_id와 access_token이 일치하는지 검증
async function validateSession(user_id, access_token) {
  const pool = await getDatabasePool();

  const [sessionRows] = await pool.query(
    "SELECT * FROM Session WHERE user_id = ? AND access_token = ?",
    [user_id, access_token]
  );
  return sessionRows.length > 0;
}

async function deleteSession(user_id) {
  const pool = await getDatabasePool();

  await pool.query("DELETE FROM Session WHERE user_id = ?", [user_id]);
}

module.exports = {
  validateSession,
  deleteSession,
};
