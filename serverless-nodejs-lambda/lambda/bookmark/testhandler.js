const mysql = require("mysql2/promise");
const AWS = require("aws-sdk");
const axios = require("axios"); // HTTP 요청을 위한 axios 패키지 추가
const { validateSession } = require("../../utils/sessionUtils");
const { errLog } = require("../../utils/logUtils");

const secretsManager = new AWS.SecretsManager();

let dbPassword;

// 비밀번호 가져오기 함수
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

exports.testhandler = async (event) => {
  // 인터넷 접근 테스트를 위해 google.com에 요청 시도
  try {
    const response = await axios.get("https://www.google.com");
    console.log("Internet Access Test: Success", response.status);
  } catch (error) {
    console.error("Internet Access Test: Failed", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "인터넷 접근 실패",
        error: error.message,
      }),
    };
  }

  const { user_id, access_token } = JSON.parse(event.body);

  const dbPassword = await getDatabaseCredentials();

  // 데이터베이스 연결 설정
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: dbPassword,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  // 0. Session 테이블에서 user_id와 access_token이 올바르게 짝지어져 있는지 확인
  const isValidSession = await validateSession(user_id, access_token);
  if (!isValidSession) {
    errLog("BOOKMK_01", 401, "Unauthorized", { user_id: user_id });
    return {
      statusCode: 401,
      body: JSON.stringify({
        message: "user_id와 access_token이 일치하지 않습니다.",
      }),
    };
  }

  // 1. 입력 데이터 체크
  if (!user_id) {
    errLog("BOOKMK_01", 400, "Bad Request", { user_id: user_id });
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "잘못된 유저 정보입니다." }),
    };
  }

  try {
    // 2. 북마크 목록 가져오기
    const [rows] = await pool.query(
      "SELECT recipe_id FROM Bookmark WHERE user_id = ?",
      [user_id]
    );

    // 3. 북마크 목록 반환
    const user_bookmark = rows.map((row) => row.recipe_id);

    return {
      statusCode: 200,
      body: JSON.stringify({ user_bookmark }),
    };
  } catch (err) {
    errLog("BOOKMK_01", 500, "Internal Server Error", {
      user_id: user_id,
      error: err.message,
    });
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "즐겨찾기 가져오기에 실패했습니다. 다시 시도해주세요.",
      }),
    };
  }
};
