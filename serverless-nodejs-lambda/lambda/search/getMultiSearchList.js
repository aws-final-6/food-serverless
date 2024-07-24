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

exports.getMultiSearchList = async (event) => {
  const body = JSON.parse(event.body);
  infoLog("SEARCH_04", body);
  const { ing_search } = body;

  // 1. 필수 값 체크
  if (!ing_search || !Array.isArray(ing_search) || ing_search.length === 0) {
    errLog("SEARCH_04", 400, "Bad Request", {
      ing_search: ing_search,
      message: "검색할 재료 리스트를 입력해주세요.",
    });
    return {
      statusCode: 400,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({ message: "검색할 재료 리스트를 입력해주세요." }),
    };
  }

  try {
    if (!pool) await createPool();

    // 2. 재료명으로 재료 ID를 검색
    const placeholders = ing_search.map(() => "?").join(", ");
    const [ingredients] = await pool.execute(
      `SELECT ingredient_id FROM Ingredient WHERE ingredient_name IN (${placeholders})`,
      ing_search
    );

    // 2-1. 해당 재료가 없을 경우 예외 처리
    if (ingredients.length === 0) {
      errLog("SEARCH_04", 404, "Not Found", {
        ing_search: ing_search,
        message: "일치하는 재료가 없습니다.",
      });
      return {
        statusCode: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({ message: "일치하는 재료가 없습니다." }),
      };
    }

    // 2-2. 재료 ID 리스트 추출
    const ingredientIds = ingredients.map(
      (ingredient) => ingredient.ingredient_id
    );

    // 3. 재료 ID 리스트로 레시피 ID 검색
    const recipePlaceholders = ingredientIds.map(() => "?").join(", ");
    const [recipes] = await pool.execute(
      `SELECT r.recipe_id, r.recipe_title, r.recipe_thumbnail 
      FROM Recipe r 
      JOIN (
        SELECT recipe_id 
        FROM IngredientSearch 
        WHERE ingredient_id IN (${recipePlaceholders}) 
        GROUP BY recipe_id 
        HAVING COUNT(DISTINCT ingredient_id) = ?
      ) matched_recipes ON r.recipe_id = matched_recipes.recipe_id`,
      [...ingredientIds, ingredientIds.length]
    );

    // 3-1. 검색 결과가 없을 때 예외 처리
    if (recipes.length === 0) {
      errLog("SEARCH_04", 404, "Not Found", {
        ing_search: ing_search,
        message: "재료가 모두 일치하는 레시피가 없습니다.",
      });
      return {
        statusCode: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({
          message: "재료가 모두 일치하는 레시피가 없습니다.",
        }),
      };
    }

    // 3-2. 최종 결과 형식으로 변환
    let search_list = recipes.map((r) => ({
      recipe_id: r.recipe_id,
      recipe_title: r.recipe_title,
      recipe_thumbnail: r.recipe_thumbnail,
    }));
    successLog("SEARCH_04");
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({ search_list }),
    };
  } catch (err) {
    errLog("SEARCH_04", 500, "Internal Server Error", {
      error: err.message,
    });
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        message: "레시피 재료 검색에 실패했습니다. 다시 시도해주세요.",
      }),
    };
  }
};
