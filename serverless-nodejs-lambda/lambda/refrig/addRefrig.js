const mysql = require("mysql2/promise");
const AWS = require("aws-sdk");
const { getRefrigeratorData } = require("/opt/nodejs/utils/refrigUtils");
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

exports.addRefrig = async (event) => {
  infoLog("REFRIG_05", event.body);
  const { user_id, refrigerator_name, refrigerator_type } = JSON.parse(
    event.body
  );

  // 1. 입력 데이터 체크
  if (!user_id || !refrigerator_name || !refrigerator_type) {
    errLog("REFRIG_05", 400, "Bad Request", {
      user_id: user_id,
      refrigerator_name: refrigerator_name,
      refrigerator_type: refrigerator_type,
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
    if (!pool) await createPool();

    // 2. 유저의 냉장고 칸 수 체크
    const [existingFridges] = await pool.query(
      "SELECT COUNT(*) as count FROM Refrigerator WHERE user_id = ?",
      [user_id]
    );

    if (existingFridges[0].count >= 10) {
      errLog("REFRIG_05", 409, "Conflict", {
        user_id: user_id,
        message: "냉장고 칸은 최대 10칸까지 추가할 수 있습니다.",
      });
      return {
        statusCode: 409,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({
          message: "냉장고 칸은 최대 10칸까지 추가할 수 있습니다.",
        }),
      };
    }

    // 3. 냉장고 칸 추가
    const [addResult] = await pool.execute(
      "INSERT INTO Refrigerator (user_id, refrigerator_name, refrigerator_type) VALUES (?, ?, ?)",
      [user_id, refrigerator_name, refrigerator_type]
    );

    if (addResult.affectedRows === 0) {
      errLog("REFRIG_05", 500, "Internal Server Error", {
        user_id: user_id,
        message: "냉장고 칸 추가에 실패했습니다. 다시 시도해주세요.",
      });
      return {
        statusCode: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({
          message: "냉장고 칸 추가에 실패했습니다. 다시 시도해주세요.",
        }),
      };
    }

    // 4. 유저의 모든 냉장고 정보 다시 가져오기
    const result = await getRefrigeratorData(user_id);

    // 5. 결과가 없는 경우 처리
    if (result.length === 0) {
      errLog("REFRIG_05", 404, "Not Found", {
        user_id: user_id,
        message: "냉장고 정보를 찾을 수 없습니다.",
      });
      return {
        statusCode: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({ message: "냉장고 정보를 찾을 수 없습니다." }),
      };
    }
    successLog("REFRIG_05");
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify(result),
    };
  } catch (err) {
    errLog("REFRIG_05", 500, "Internal Server Error", {
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
        message: "냉장고 칸 추가에 실패했습니다. 다시 시도해주세요.",
      }),
    };
  }
};
