const mysql = require("mysql2/promise");
const AWS = require("aws-sdk");
const moment = require("moment-timezone");
const { errLog, infoLog, successLog } = require("../utils/logUtils");

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

exports.getSeasonalList = async (event) => {
  infoLog("RECIPE_02", event.body);

  try {
    const dbPassword = await getDatabaseCredentials();
    const pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: dbPassword,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    // 1. 현재 날짜 기준 월 1~12로 가져오기, timezone 고려
    const currentMonth = moment().tz("Asia/Seoul").month() + 1;

    // 2. 현재 월에 해당하는 제철 농산물 이름 배열로 받아오기
    const [findSeasonalFoodName] = await pool.query(
      "SELECT seasonal_name, seasonal_image FROM Seasonal WHERE seasonal_month = ? ORDER BY RAND()",
      [currentMonth]
    );

    // 3. 결과를 클라이언트에게 응답으로 보내기
    successLog("RECIPE_02");
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({ seasonal_list: findSeasonalFoodName }),
    };
  } catch (err) {
    errLog("RECIPE_02", 500, "Internal Server Error", {
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
          "제철 농산물 레시피 목록을 불러오는데에 실패했습니다. 다시 시도해주세요.",
      }),
    };
  }
};
