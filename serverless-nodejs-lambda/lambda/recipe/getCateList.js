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

exports.getCateList = async (event) => {
  infoLog("RECIPE_04", event.body);
  const { cate_no } = JSON.parse(event.body);

  // 0. 입력 데이터 체크
  if (!cate_no || typeof cate_no !== "number") {
    errLog("RECIPE_04", 400, "Bad Request", {
      cate_no: cate_no,
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

    // 1. 만족하는 레시피 찾기 (무작위로 최대 20개)
    const [queryRes] = await pool.query(
      "SELECT recipe_id, recipe_title, recipe_thumbnail FROM Recipe WHERE cate_no = ? ORDER BY RAND() LIMIT 20",
      [cate_no]
    );

    // 2. 결과가 없는 경우 예외 처리
    if (queryRes.length === 0) {
      errLog("RECIPE_04", 204, "No Content", {
        cate_no: cate_no,
        message: "해당 카테고리에 대한 레시피가 없습니다.",
      });
      return {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({
          message: "해당 카테고리에 대한 레시피가 없습니다.",
        }),
      };
    }

    // 3. 결과를 클라이언트로 전달
    const result = {
      cate_list: queryRes.map((recipe) => ({
        recipe_id: recipe.recipe_id,
        recipe_title: recipe.recipe_title,
        recipe_thumbnail: recipe.recipe_thumbnail,
      })),
    };

    successLog("RECIPE_04");
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify(result),
    };
  } catch (err) {
    errLog("RECIPE_04", 500, "Internal Server Error", {
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
          "추천 레시피 목록을 불러오는데에 실패했습니다. 다시 시도해주세요.",
      }),
    };
  }
};
