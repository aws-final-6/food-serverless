const mysql = require("mysql2/promise");
const AWS = require("aws-sdk");
const { getRefrigeratorData } = require("/opt/nodejs/utils/refrigUtils");
const { errLog, infoLog, successLog } = require("/opt/nodejs/utils/logUtils");

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

exports.updateRefrig = async (event) => {
  infoLog("REFRIG_04", event.body);
  const { user_id, refrigerator_id, new_name, new_type } = JSON.parse(
    event.body
  );

  // 1. 입력 데이터 체크
  if (!user_id || !refrigerator_id || !new_name || !new_type) {
    errLog("REFRIG_04", 400, "Bad Request", {
      user_id: user_id,
      refrigerator_id: refrigerator_id,
      new_name: new_name,
      new_type: new_type,
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

  let pool;
  let connection;

  try {
    pool = await createPool();
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 2. 냉장고 업데이트
    const [updateResult] = await connection.execute(
      "UPDATE Refrigerator SET refrigerator_name = ?, refrigerator_type = ? WHERE refrigerator_id = ? AND user_id = ?",
      [new_name, new_type, refrigerator_id, user_id]
    );

    if (updateResult.affectedRows === 0) {
      errLog("REFRIG_04", 404, "Not Found", {
        user_id: user_id,
        refrigerator_id: refrigerator_id,
        message: "해당 냉장고를 찾을 수 없습니다.",
      });
      await connection.rollback();
      return {
        statusCode: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({ message: "해당 냉장고를 찾을 수 없습니다." }),
      };
    }

    await connection.commit();

    // 3. 유저의 모든 냉장고 정보 다시 가져오기
    const result = await getRefrigeratorData(user_id);

    // 4. 결과가 없는 경우 처리
    if (result.refrigerators.length === 0) {
      errLog("REFRIG_04", 404, "Not Found", {
        user_id: user_id,
        refrigerator_id: refrigerator_id,
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

    successLog("REFRIG_04");
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify(result),
    };
  } catch (err) {
    if (connection) await connection.rollback();

    errLog("REFRIG_04", 500, "Internal Server Error", {
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
        message: "냉장고 업데이트에 실패했습니다. 다시 시도해주세요.",
      }),
    };
  } finally {
    if (connection) connection.release();
  }
};
