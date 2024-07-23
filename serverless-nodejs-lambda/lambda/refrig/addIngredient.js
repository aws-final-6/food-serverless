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

exports.addIngredient = async (event) => {
  infoLog("REFRIG_02", event.body);
  const { user_id, refrigerators } = JSON.parse(event.body);

  // 1. 입력 데이터 체크
  if (!user_id || !Array.isArray(refrigerators) || refrigerators.length === 0) {
    errLog("REFRIG_02", 400, "Bad Request", {
      user_id: user_id,
      refrigerators: refrigerators,
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

    // 2. 트랜잭션 시작
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 3. 데이터 저장
    for (const ingredient of refrigerators) {
      const {
        refrigerator_ing_name,
        expired_date,
        enter_date,
        color,
        refrigerator_id,
      } = ingredient;

      if (
        !refrigerator_id ||
        !refrigerator_ing_name ||
        !expired_date ||
        !enter_date ||
        !color
      ) {
        errLog("REFRIG_02", 400, "Bad Request", {
          user_id: user_id,
          ingredient: ingredient,
          message: "잘못된 재료 정보입니다.",
        });
        return {
          statusCode: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": true,
          },
          body: JSON.stringify({ message: "잘못된 재료 정보입니다." }),
        };
      }

      await connection.execute(
        "INSERT INTO RefrigeratorIngredients (refrigerator_id, refrigerator_ing_name, expired_date, enter_date, color) VALUES (?, ?, ?, ?, ?)",
        [
          refrigerator_id,
          refrigerator_ing_name,
          expired_date,
          enter_date,
          color,
        ]
      );
    }

    // 4. 트랜잭션 커밋
    await connection.commit();

    // 5. 유저의 모든 냉장고 정보 다시 가져오기
    const result = await getRefrigeratorData(user_id);

    // 6. 결과가 없는 경우 처리
    if (result.refrigerators.length === 0) {
      errLog("REFRIG_02", 404, "Not Found", {
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

    successLog("REFRIG_02");
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error(err);

    // 7. 트랜잭션 롤백
    if (connection) await connection.rollback();

    errLog("REFRIG_02", 500, "Internal Server Error", {
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
        message: "재료 저장에 실패했습니다. 다시 시도해주세요.",
      }),
    };
  } finally {
    if (connection) connection.release();
  }
};
