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

exports.delRefrig = async (event) => {
  infoLog("REFRIG_06", event.body);
  const { user_id, refrigerator_id } = JSON.parse(event.body);

  // 1. 입력 데이터 체크
  if (!user_id || !refrigerator_id) {
    errLog("REFRIG_06", 400, "Bad Request", {
      user_id: user_id,
      refrigerator_id: refrigerator_id,
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
    // 2. 데이터베이스 연결
    if (!pool) {
      await createPool();
    }
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 3. 유저의 냉장고 칸 수 체크
    const [existingFridges] = await connection.query(
      "SELECT COUNT(*) as count FROM Refrigerator WHERE user_id = ?",
      [user_id]
    );

    if (existingFridges[0].count <= 2) {
      await connection.rollback();
      errLog("REFRIG_06", 409, "Conflict", {
        user_id: user_id,
        message: "냉장고 칸은 최소 2칸을 유지해야 합니다.",
      });
      return {
        statusCode: 409,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({
          message: "냉장고 칸은 최소 2칸을 유지해야 합니다.",
        }),
      };
    }

    // 4. 해당 냉장고 칸과 그 안의 모든 재료 삭제
    await connection.query(
      "DELETE FROM RefrigeratorIngredients WHERE refrigerator_id = ?",
      [refrigerator_id]
    );

    const [deleteResult] = await connection.query(
      "DELETE FROM Refrigerator WHERE refrigerator_id = ? AND user_id = ?",
      [refrigerator_id, user_id]
    );

    if (deleteResult.affectedRows === 0) {
      await connection.rollback();
      errLog("REFRIG_06", 404, "Not Found", {
        user_id: user_id,
        refrigerator_id: refrigerator_id,
        message: "해당 냉장고 칸을 찾을 수 없습니다.",
      });
      return {
        statusCode: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({ message: "해당 냉장고 칸을 찾을 수 없습니다." }),
      };
    }

    // 5. 트랜잭션 커밋
    await connection.commit();

    // 6. 유저의 모든 냉장고 정보 다시 가져오기
    const result = await getRefrigeratorData(user_id);

    // 7. 결과가 없는 경우 처리
    if (result.length === 0) {
      errLog("REFRIG_06", 404, "Not Found", {
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

    connection.release();

    successLog("REFRIG_06");
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

    // 8. 트랜잭션 롤백
    if (connection) await connection.rollback();

    errLog("REFRIG_06", 500, "Internal Server Error", {
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
        message: "냉장고 칸 삭제에 실패했습니다. 다시 시도해주세요.",
      }),
    };
  } finally {
    if (connection) connection.release();
  }
};
