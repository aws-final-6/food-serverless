const mysql = require("mysql2/promise");
const AWS = require("aws-sdk");
const { validateSession } = require("/opt/nodejs/utils/sessionUtils");
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

exports.updateFilterList = async (event) => {
  const body = JSON.parse(event.body);
  infoLog("FILTER_02", body);
  const { user_id, access_token, filter_list } = body;

  // 0. Session 테이블에서 user_id와 access_token이 올바르게 짝지어져 있는지 확인
  const isValidSession = await validateSession(user_id, access_token);
  if (!isValidSession) {
    errLog("FILTER_02", 401, "Unauthorized", {
      user_id: user_id,
      message: "user_id와 access_token이 일치하지 않습니다.",
    });
    return {
      statusCode: 401,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        message: "user_id와 access_token이 일치하지 않습니다.",
      }),
    };
  }

  // 1. 입력 데이터 체크
  if (!user_id || !Array.isArray(filter_list) || filter_list.length === 0) {
    errLog("FILTER_02", 400, "Bad Request", {
      user_id: user_id,
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
    if (!pool) {
      await createPool();
    }
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // 2. 현재 저장된 필터 가져오기
      const [currentFilters] = await connection.query(
        `SELECT ingredient_id FROM SearchFilter WHERE user_id = ?`,
        [user_id]
      );
      const currentFilterIds = currentFilters.map((f) => f.ingredient_id);

      // 3. 재료명으로 재료 ID를 검색
      const placeholders = filter_list.map(() => "?").join(", ");
      const [ingredients] = await connection.query(
        `SELECT ingredient_id, ingredient_name FROM Ingredient WHERE ingredient_name IN (${placeholders})`,
        filter_list
      );

      const foundIngredientNames = ingredients.map(
        (ingredient) => ingredient.ingredient_name
      );
      const notFoundIngredients = filter_list.filter(
        (name) => !foundIngredientNames.includes(name)
      );

      // 4. 입력된 재료 중 저장되어 있지 않은 재료가 있는 경우 예외 처리
      if (notFoundIngredients.length > 0) {
        errLog("FILTER_02", 404, "Not Found", {
          notFoundIngredients: notFoundIngredients,
          message: `이 재료는 재료 테이블에 저장되어있지 않습니다: ${notFoundIngredients.join(
            ", "
          )}`,
        });
        return {
          statusCode: 404,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": true,
          },
          body: JSON.stringify({
            message: `이 재료는 재료 테이블에 저장되어있지 않습니다: ${notFoundIngredients.join(
              ", "
            )}`,
          }),
        };
      }

      // 5. 존재하는 재료의 ID 리스트 추출
      const ingredientIds = ingredients.map(
        (ingredient) => ingredient.ingredient_id
      );

      // 6. 추가할 필터와 삭제할 필터 구분
      const filtersToAdd = ingredientIds.filter(
        (id) => !currentFilterIds.includes(id)
      );
      const filtersToRemove = currentFilterIds.filter(
        (id) => !ingredientIds.includes(id)
      );

      // 7. 필터 추가
      if (filtersToAdd.length > 0) {
        const addValues = filtersToAdd
          .map((id) => `(${connection.escape(user_id)}, ${id})`)
          .join(", ");
        await connection.query(
          `INSERT INTO SearchFilter (user_id, ingredient_id) VALUES ${addValues}`
        );
      }

      // 8. 필터 삭제
      if (filtersToRemove.length > 0) {
        const removePlaceholders = filtersToRemove.map(() => "?").join(", ");
        await connection.query(
          `DELETE FROM SearchFilter WHERE user_id = ? AND ingredient_id IN (${removePlaceholders})`,
          [user_id, ...filtersToRemove]
        );
      }

      // 9. 트랜잭션 커밋
      await connection.commit();
      successLog("FILTER_02");
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({
          message: "제외 필터가 성공적으로 저장되었습니다.",
        }),
      };
    } catch (err) {
      // 트랜잭션 롤백
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    errLog("FILTER_02", 500, "Internal Server Error", {
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
        message: "제외 필터 저장에 실패했습니다. 다시 시도해주세요.",
      }),
    };
  }
};
