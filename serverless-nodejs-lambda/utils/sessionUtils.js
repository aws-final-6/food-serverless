const mysql = require("mysql2/promise");
const AWS = require("aws-sdk");

const secretsManager = new AWS.SecretsManager();
let dbPassword;

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

  return mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: password,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
}

async function checkSession(user_id) {
  const pool = await createPool();
  const [sessionRows] = await pool.query(
    "SELECT * FROM Session WHERE user_id = ?",
    [user_id]
  );
  return sessionRows.length;
}

async function validateSession(user_id, access_token) {
  const pool = await createPool();
  const [sessionRows] = await pool.query(
    "SELECT * FROM Session WHERE user_id = ? AND access_token = ?",
    [user_id, access_token]
  );
  return sessionRows.length > 0;
}

async function deleteSession(user_id) {
  const pool = await createPool();
  await pool.query("DELETE FROM Session WHERE user_id = ?", [user_id]);
}

module.exports = {
  validateSession,
  deleteSession,
  checkSession,
};
