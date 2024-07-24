const mysql = require("mysql2/promise");
const AWS = require("aws-sdk");
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

exports.getRecentList = async (event) => {
  infoLog("RECIPE_01", event.body);

  try {
    if (!pool) await createPool();

    // 1. recipe_id 기준 20개 SELECT
    const [recentRecipes] = await pool.query(
      "SELECT recipe_id, recipe_title, recipe_thumbnail FROM Recipe ORDER BY recipe_id DESC LIMIT 20"
    );

    // 2. 클라이언트 전달
    successLog("RECIPE_01");
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({ recipes: recentRecipes }),
    };
  } catch (err) {
    errLog("RECIPE_01", 500, "Internal Server Error", {
      error: err.message,
    });
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        message:
          "최신 레시피 목록을 불러오는데에 실패했습니다. 다시 시도해주세요.",
      }),
    };
  }
};
