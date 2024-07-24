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

exports.searchIngredient = async (event) => {
  const body = JSON.parse(event.body);
  infoLog("FILTER_03", body);
  const { keyword } = body;

  // 1. keyword 없을 때 예외 처리
  if (!keyword) {
    errLog("FILTER_03", 400, "Bad Request", {
      keyword: keyword,
      message: "검색어를 입력해주세요.",
    });
    return {
      statusCode: 400,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({ message: "검색어를 입력해주세요." }),
    };
  }

  try {
    if (!pool) {
      await createPool();
    }

    // 2. 재료명으로 재료 ID를 검색
    const placeholders = `%${keyword}%`;
    const [ingredients] = await pool.query(
      `SELECT ingredient_id, ingredient_name FROM Ingredient WHERE ingredient_name LIKE ?`,
      [placeholders]
    );

    // 3. 재료 리스트 반환
    if (ingredients.length == 0) {
      errLog("FILTER_03", 404, "Not Found", {
        notFoundIngredients: ingredients,
        message: `이 재료는 재료 테이블에 저장되어있지 않습니다: ${keyword}`,
      });
      return {
        statusCode: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({
          message: `이 재료는 재료 테이블에 저장되어있지 않습니다: ${keyword}`,
        }),
      };
    }

    // 4. 모든 재료가 재료 테이블에 저장되어 있는 경우 성공 메시지 반환
    successLog("FILTER_03");
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({ ingredients }),
    };
  } catch (err) {
    errLog("FILTER_03", 500, "Internal Server Error", {
      keyword: keyword,
      error: err.message,
    });
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        message: "재료 검색에 실패했습니다. 다시 시도해주세요.",
      }),
    };
  }
};
