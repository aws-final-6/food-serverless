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

exports.delIngredient = async (event) => {
  infoLog("REFRIG_03", event.body);
  const { user_id, refrigerator_ing_ids } = JSON.parse(event.body);

  // 1. 입력 데이터 체크
  if (
    !user_id ||
    !Array.isArray(refrigerator_ing_ids) ||
    refrigerator_ing_ids.length === 0
  ) {
    errLog("REFRIG_03", 400, "Bad Request", {
      user_id: user_id,
      refrigerator_ing_ids: refrigerator_ing_ids,
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

  let connection;

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

    // 2. 데이터베이스 연결 및 트랜잭션 시작
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 3. 재료 삭제
    const [deleteResult] = await connection.query(
      "DELETE FROM RefrigeratorIngredients WHERE refrigerator_ing_id IN (?)",
      [refrigerator_ing_ids]
    );

    if (deleteResult.affectedRows === 0) {
      await connection.rollback();
      errLog("REFRIG_03", 404, "Not Found", {
        user_id: user_id,
        refrigerator_ing_ids: refrigerator_ing_ids,
        message: "해당 재료를 찾을 수 없습니다.",
      });
      return {
        statusCode: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({ message: "해당 재료를 찾을 수 없습니다." }),
      };
    }

    // 4. 트랜잭션 커밋
    await connection.commit();

    // 5. 유저의 모든 냉장고 정보 다시 가져오기
    const result = await getRefrigeratorData(user_id);

    // 6. 결과가 없는 경우 처리
    if (result.refrigerators.length === 0) {
      errLog("REFRIG_03", 404, "Not Found", {
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

    successLog("REFRIG_03");
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify(result),
    };
  } catch (err) {
    // 7. 트랜잭션 롤백
    if (connection) await connection.rollback();

    errLog("REFRIG_03", 500, "Internal Server Error", {
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
        message: "재료 삭제에 실패했습니다. 다시 시도해주세요.",
      }),
    };
  } finally {
    if (connection) connection.release();
  }
};
