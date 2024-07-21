const mysql = require("mysql2/promise");
const AWS = require("aws-sdk");
const { validateSession } = require("../../utils/sessionUtils");
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

exports.testhandler = async (event) => {
  infoLog("MYPAGE_01", event.body);
  // 0. user_id 를 받아옴
  const { user_id, access_token } = JSON.parse(event.body);

  const isValidSession = await validateSession(user_id, access_token);
  if (!isValidSession) {
    errLog("MYPAGE_01", 401, "Unauthorized", { user_id: user_id });
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

    // 1. User 테이블에서 user_id를 키값으로 유저 검색 - user_email
    const [getUserProfile] = await pool.query(
      "SELECT user_email FROM User WHERE user_id = ?",
      [user_id]
    );

    // 2. MyPage 테이블에서 user_id를 키값으로 유저 검색 - user_nickname, user_subscription, cate_no, situ_no
    const [getMyPageProfile] = await pool.query(
      "SELECT user_nickname, user_subscription, cate_no, situ_no FROM MyPage WHERE user_id = ?",
      [user_id]
    );

    if (!getUserProfile.length || !getMyPageProfile.length) {
      errLog("MYPAGE_01", 400, "Bad Request", { user_id: user_id });
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({ message: "잘못된 유저 정보입니다." }),
      };
    }

    // 3. 결과값 클라이언트로 보내기 위해 가져오기
    const user_email = getUserProfile[0].user_email;
    const user_nickname = getMyPageProfile[0].user_nickname;
    const user_subscription = getMyPageProfile[0].user_subscription;
    const user_prefer = getMyPageProfile.map((profile) => ({
      cate_no: profile.cate_no,
      situ_no: profile.situ_no,
    }));

    // 4. 클라이언트로 전달
    successLog("MYPAGE_01");
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        user_id,
        user_email,
        user_nickname,
        user_subscription,
        user_prefer,
      }),
    };
  } catch (err) {
    errLog("MYPAGE_01", 500, "Internal Server Error", {
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
        message: "마이페이지 불러오기에 실패했습니다. 다시 시도해주세요.",
      }),
    };
  }
};
