const mysql = require("mysql2/promise");
const AWS = require("aws-sdk");
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

exports.getIngredientSearchList = async (event) => {
  infoLog("SEARCH_02", event.body);
  const { keyword, type } = JSON.parse(event.body);

  // 0-1. keyword 없을 때 예외 처리
  if (!keyword) {
    errLog("SEARCH_02", 400, "Bad Request", {
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

  // 0-2. type 없거나 page / navbar가 아닐 때
  if (!type || !["page", "navbar"].includes(type)) {
    errLog("SEARCH_02", 400, "Bad Request", {
      type: type,
      message: "유효한 타입을 입력해주세요.",
    });
    return {
      statusCode: 400,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({ message: "유효한 타입을 입력해주세요." }),
    };
  }

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

    // 1. 재료명으로 재료 ID를 검색
    let query = `
      SELECT i.recipe_id, r.recipe_title, r.recipe_thumbnail 
      FROM IngredientSearch i 
      JOIN Recipe r ON i.recipe_id = r.recipe_id 
      WHERE i.ingredient_id IN (SELECT ingredient_id FROM Ingredient WHERE ingredient_name LIKE ?)
    `;

    const params = [`%${keyword}%`];

    if (type === "navbar") {
      query += `LIMIT ?`;
      params.push(10);
    }

    const [recipes] = await pool.query(query, params);

    // 4. 최종 레시피 리스트 반환
    if (recipes.length === 0) {
      errLog("SEARCH_02", 404, "Not Found", {
        keyword: keyword,
        message: "재료가 일치하는 레시피가 없습니다.",
      });
      return {
        statusCode: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({ message: "재료가 일치하는 레시피가 없습니다." }),
      };
    }

    // 5. 최종 결과 형식으로 변환
    const search_list = recipes.map((r) => ({
      recipe_id: r.recipe_id,
      recipe_title: r.recipe_title,
      recipe_thumbnail: r.recipe_thumbnail,
    }));

    successLog("SEARCH_02");
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({ search_list }),
    };
  } catch (err) {
    errLog("SEARCH_02", 500, "Internal Server Error", {
      error: err.message,
    });
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        message: "레시피 검색에 실패했습니다. 다시 시도해주세요.",
      }),
    };
  }
};
