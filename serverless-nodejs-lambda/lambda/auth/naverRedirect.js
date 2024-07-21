const mysql = require("mysql2/promise");
const AWS = require("aws-sdk");
const axios = require("axios");
const qs = require("qs");
const { checkSession } = require("/opt/nodejs/utils/sessionUtils");
const { errLog, infoLog, successLog } = require("/opt/nodejs/utils/logUtils");
const secretsManager = new AWS.SecretsManager();

// .env naver OAuth
const naverReq = {
  client_id: process.env.NAVER_CLIENT_ID,
  client_secret: process.env.NAVER_CLIENT_SECRET,
  redirect_uri: process.env.NAVER_REDIRECT_URI,
  state: process.env.NAVER_STATE,
};

// .env front uri
const front_uri = process.env.FRONT_URI;

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

exports.naverRedirect = async (event) => {
  infoLog("AUTH_05", event.body);
  // 0. authorization code를 AUTH_02에서 받아옴
  const { code, state } = event.queryStringParameters;
  const tokenUrl = `https://nid.naver.com/oauth2.0/token?grant_type=authorization_code&client_id=${naverReq.client_id}&client_secret=${naverReq.client_secret}&redirect_uri=${naverReq.redirect_uri}&code=${code}&state=${state}`;

  // 1. access_token 발급
  try {
    const response = await axios.post(
      tokenUrl,
      {},
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Naver-Client-Id": naverReq.client_id,
          "X-Naver-Client-Secret": naverReq.client_secret,
        },
      }
    );

    const { access_token, refresh_token } = response.data;

    // 2. access_token을 사용하여 사용자 정보 가져오기
    const userInfoUrl = "https://openapi.naver.com/v1/nid/me";
    const userInfoResponse = await axios.get(userInfoUrl, {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    const userInfo = userInfoResponse.data.response;
    const user_id = String(userInfo.id);
    const user_email = userInfo.email;

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

    // 2-1. 사용자 정보 중 고유값인 id를 추출하여 User 테이블에 있는지(회원인지) 확인
    const [rows] = await pool.query("SELECT * FROM User WHERE user_id = ?", [
      user_id,
    ]);

    // 2-2. DB에 없을 경우, 회원가입으로 넘어가도록 함, 유저정보 저장하지 않음
    if (rows.length === 0) {
      successLog("AUTH_05");
      return {
        statusCode: 302,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
          Location: `${front_uri}/auth?user_id=${user_id}&access_token=${access_token}&refresh_token=${refresh_token}&new=true&user_email=${user_email}&provider=naver`,
        },
        body: null,
      };
    } else {
      // 2-4. DB에 있을 경우 (= 회원일 경우), 세션 업데이트
      const checkUser = await checkSession(user_id);

      const connection = await pool.getConnection();
      await connection.beginTransaction();
      // 사용자별로 최대 3개의 세션만 보유 할수 있도록 제한
      if (checkUser == 3) {
        // 사용자가 다른 창으로 로그인 중
        await connection.query(
          "UPDATE Session SET access_token = ?, user_agent = ?, created_at = CURRENT_TIMESTAMP WHERE session_id = (SELECT session_id FROM ( SELECT session_id FROM Session WHERE user_id = ? ORDER BY created_at ASC LIMIT 1 ) AS subquery);",
          [access_token, event.headers["User-Agent"], user_id]
        );
      } else {
        // 로그아웃 된 사용자
        await connection.query(
          "INSERT INTO Session (user_id, access_token, user_agent) VALUES (?, ?, ?)",
          [user_id, access_token, event.headers["User-Agent"]]
        );
      }
      await connection.commit();
      successLog("AUTH_05");
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({
          redirect_url: `${front_uri}/auth?user_id=${user_id}&access_token=${access_token}&refresh_token=${refresh_token}&new=false&provider=naver&user_email=${user_email}`,
        }),
      };
    }
  } catch (err) {
    const user_id = err.response?.data?.id
      ? String(err.response.data.id)
      : null;
    errLog("AUTH_05", 500, "Internal Server Error", {
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
        message: "네이버 로그인에 실패했습니다. 다시 시도해주세요.",
      }),
    };
  }
};
