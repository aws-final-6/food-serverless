const mysql = require("mysql2/promise");
const AWS = require("aws-sdk");

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

// user_id를 이용해 냉장고 정보를 불러오기
async function getRefrigeratorData(user_id) {
  const pool = await createPool(); // 이 부분이 추가되었습니다
  const [rows] = await pool.query(
    `
    SELECT 
      r.refrigerator_id, r.refrigerator_name, r.refrigerator_type,
      ri.refrigerator_ing_id, ri.refrigerator_ing_name, ri.expired_date, ri.enter_date, ri.color
    FROM Refrigerator r
    LEFT JOIN RefrigeratorIngredients ri ON r.refrigerator_id = ri.refrigerator_id
    WHERE r.user_id = ?
    `,
    [user_id]
  );

  const result = {};
  rows.forEach((row) => {
    const {
      refrigerator_id,
      refrigerator_name,
      refrigerator_type,
      refrigerator_ing_id,
      refrigerator_ing_name,
      expired_date,
      enter_date,
      color,
    } = row;
    if (!result[refrigerator_id]) {
      result[refrigerator_id] = {
        refrig: {
          refrigerator_id,
          refrigerator_name,
          refrigerator_type,
        },
        ingredients: [],
      };
    }
    if (refrigerator_ing_id) {
      result[refrigerator_id].ingredients.push({
        refrigerator_id,
        refrigerator_ing_name,
        enter_date,
        expired_date,
        refrigerator_ing_id,
        color,
      });
    }
  });

  return {
    user_id,
    refrigerators: Object.values(result),
  };
}

module.exports = { getRefrigeratorData };
