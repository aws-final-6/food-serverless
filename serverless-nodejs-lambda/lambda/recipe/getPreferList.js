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

exports.getPreferList = async (event) => {
  infoLog("RECIPE_03", event.body);
  const { user_id } = JSON.parse(event.body);

  try {
    if (!pool) await createPool();

    // 1. User 테이블에서 user_id로 cate_no와 situ_no 값 가져오기
    const [getUserPrefer] = await pool.query(
      "SELECT cate_no, situ_no FROM MyPage WHERE user_id = ? ",
      [user_id]
    );

    // 1-1. 선호도 정보 없거나 못가져온 경우
    if (
      getUserPrefer.length === 0 ||
      getUserPrefer[0].cate_no === null ||
      getUserPrefer[0].situ_no === null
    ) {
      errLog("RECIPE_03", 204, "No Content", {
        user_id: user_id,
        message: "선호도 정보가 없습니다.",
      });
      return {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({ message: "선호도 정보가 없습니다." }),
      };
    }

    // 2. 두 선호도 모두 만족하는 레시피 목록 SELECT
    const [queryRes] = await pool.query(
      "SELECT recipe_id, recipe_title, recipe_thumbnail FROM Recipe WHERE cate_no = ? AND situ_no = ? ORDER BY RAND() LIMIT 20",
      [getUserPrefer[0].cate_no, getUserPrefer[0].situ_no]
    );

    // 3. 결과를 클라이언트로 전달
    const result = {
      prefer_list: queryRes.map((recipe) => ({
        recipe_id: recipe.recipe_id,
        recipe_title: recipe.recipe_title,
        recipe_thumbnail: recipe.recipe_thumbnail,
      })),
    };
    successLog("RECIPE_03");
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify(result),
    };
  } catch (err) {
    errLog("RECIPE_03", 500, "Internal Server Error", {
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
