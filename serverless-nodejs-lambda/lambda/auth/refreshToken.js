const mysql = require("mysql2/promise");
const AWS = require("aws-sdk");
const axios = require("axios");
const qs = require("qs");
const { errLog, infoLog, successLog } = require("/opt/nodejs/utils/logUtils");
const secretsManager = new AWS.SecretsManager();

// .env kakao OAuth
const kakaoReq = {
  client_id: process.env.KAKAO_CLIENT_ID,
  client_secret: process.env.KAKAO_CLIENT_SECRET,
  redirect_uri: process.env.KAKAO_REDIRECT_URI,
  scope: process.env.KAKAO_SCOPE,
};

// .env naver OAuth
const naverReq = {
  client_id: process.env.NAVER_CLIENT_ID,
  client_secret: process.env.NAVER_CLIENT_SECRET,
  redirect_uri: process.env.NAVER_REDIRECT_URI,
  state: process.env.NAVER_STATE,
};

// .env google OAuth
const googleReq = {
  client_id: process.env.GOOGLE_CLIENT_ID,
  client_secret: process.env.GOOGLE_CLIENT_SECRET,
  redirect_uri: process.env.GOOGLE_REDIRECT_URI,
  scope: encodeURIComponent(process.env.GOOGLE_SCOPE),
};

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

exports.refreshToken = async (event) => {
  // AUTH_03 : 토큰재발급
  const { user_provider, refresh_token } = JSON.parse(event.body);
  infoLog("AUTH_03", event.body);

  if (!pool) await createPool();

  // 0-1. 유효한 user_provider 목록
  const validProviders = ["kakao", "naver", "google"];

  // 0-2. user_provider가 유효하지 않은 경우 예외 처리
  if (!validProviders.includes(user_provider)) {
    errLog("AUTH_03", 400, "Bad Request", { user_provider: user_provider });
    return {
      statusCode: 400,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({ message: "유효하지 않은 프로바이더 입니다." }),
    };
  }

  try {
    let authURL, tokenData, userInfoUrl, response, userInfoResponse, user_id;

    // 1. user_provider에 따라 switch - case
    switch (user_provider) {
      // 1-1. kakao
      case "kakao":
        authURL = "https://kauth.kakao.com/oauth/token";
        tokenData = {
          grant_type: "refresh_token",
          client_id: kakaoReq.client_id,
          client_secret: kakaoReq.client_secret,
          refresh_token,
        };

        response = await axios.post(authURL, qs.stringify(tokenData), {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
          },
        });

        const { access_token: kakao_access_token } = response.data;

        userInfoUrl = "https://kapi.kakao.com/v2/user/me";
        userInfoResponse = await axios.get(userInfoUrl, {
          headers: {
            Authorization: `Bearer ${kakao_access_token}`,
          },
        });

        user_id = String(userInfoResponse.data.id);

        await pool.query(
          "UPDATE Session SET access_token = ? WHERE user_id = ?",
          [kakao_access_token, user_id]
        );

        successLog("AUTH_03");
        return {
          statusCode: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": true,
          },
          body: JSON.stringify({ user_id, access_token: kakao_access_token }),
        };

      // 1-2. naver
      case "naver":
        authURL = "https://nid.naver.com/oauth2.0/token";
        tokenData = {
          grant_type: "refresh_token",
          client_id: naverReq.client_id,
          client_secret: naverReq.client_secret,
          refresh_token,
        };

        response = await axios.post(authURL, qs.stringify(tokenData), {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
          },
        });

        const { access_token: naver_access_token } = response.data;

        userInfoUrl = "https://openapi.naver.com/v1/nid/me";
        userInfoResponse = await axios.get(userInfoUrl, {
          headers: {
            Authorization: `Bearer ${naver_access_token}`,
          },
        });

        user_id = String(userInfoResponse.data.response.id);

        await pool.query(
          "UPDATE Session SET access_token = ? WHERE user_id = ?",
          [naver_access_token, user_id]
        );

        successLog("AUTH_03");
        return {
          statusCode: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": true,
          },
          body: JSON.stringify({ user_id, access_token: naver_access_token }),
        };

      // 1-3. google
      case "google":
        authURL = "https://oauth2.googleapis.com/token";
        tokenData = {
          grant_type: "refresh_token",
          client_id: googleReq.client_id,
          client_secret: googleReq.client_secret,
          refresh_token,
        };

        response = await axios.post(authURL, qs.stringify(tokenData), {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
          },
        });

        const { access_token: google_access_token } = response.data;

        userInfoUrl = "https://www.googleapis.com/oauth2/v2/userinfo";
        userInfoResponse = await axios.get(userInfoUrl, {
          headers: {
            Authorization: `Bearer ${google_access_token}`,
          },
        });

        user_id = String(userInfoResponse.data.id);

        await pool.query(
          "UPDATE Session SET access_token = ? WHERE user_id = ?",
          [google_access_token, user_id]
        );

        successLog("AUTH_03");
        return {
          statusCode: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": true,
          },
          body: JSON.stringify({ user_id, access_token: google_access_token }),
        };

      default:
        errLog("AUTH_03", 500, "Internal Server Error", {
          user_provider: user_provider,
        });
        return {
          statusCode: 500,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": true,
          },
          body: JSON.stringify({
            message: "토큰 갱신에 실패했습니다. 다시 시도해주세요.",
          }),
        };
    }
  } catch (err) {
    errLog("AUTH_03", 500, "Internal Server Error", {
      user_provider: user_provider,
      error: err.message,
    });
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        message: "토큰 재발급 요청에 실패했습니다. 다시 시도해주세요.",
      }),
    };
  }
};
