const AWS = require("aws-sdk");
const axios = require("axios");
const qs = require("qs");
const {
  validateSession,
  deleteSession,
} = require("/opt/nodejs/utils/sessionUtils");
const { errLog, infoLog, successLog } = require("/opt/nodejs/utils/logUtils");

// .env naver OAuth
const naverReq = {
  client_id: process.env.NAVER_CLIENT_ID,
  client_secret: process.env.NAVER_CLIENT_SECRET,
};

exports.logout = async (event) => {
  infoLog("AUTH_07", event.body);
  const { user_id, user_provider, access_token } = JSON.parse(event.body);

  // 0. 유효한 user_provider 목록
  const validProviders = ["kakao", "naver", "google"];

  // 1. user_provider가 유효하지 않은 경우 예외 처리
  if (!validProviders.includes(user_provider)) {
    errLog("AUTH_07", 400, "Bad Request", { user_provider: user_provider });
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
    // 2. Session 테이블에서 user_id와 access_token이 올바르게 짝지어져 있는지 확인
    const isValidSession = await validateSession(user_id, access_token);
    if (!isValidSession) {
      errLog("AUTH_07", 401, "Unauthorized", { user_id: user_id });
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

    // 3. user_provider값에 따른 switch-case 처리
    switch (user_provider) {
      // 3-1. kakao OAuth logout
      case "kakao":
        await axios.post("https://kapi.kakao.com/v1/user/logout", null, {
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        });
        await deleteSession(user_id);
        successLog("AUTH_07");
        return {
          statusCode: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": true,
          },
          body: JSON.stringify({ message: "카카오 로그아웃을 완료했습니다." }),
        };
      // 3-2. naver OAuth logout
      case "naver":
        await axios.post(
          "https://nid.naver.com/oauth2.0/token",
          qs.stringify({
            grant_type: "delete",
            client_id: naverReq.client_id,
            client_secret: naverReq.client_secret,
            access_token,
          }),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
          }
        );
        await deleteSession(user_id);
        successLog("AUTH_07");
        return {
          statusCode: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": true,
          },
          body: JSON.stringify({ message: "네이버 로그아웃을 완료했습니다." }),
        };
      // 3-3. google OAuth logout
      case "google":
        await axios.post(
          `https://oauth2.googleapis.com/revoke?token=${access_token}`,
          {},
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
          }
        );
        await deleteSession(user_id);
        successLog("AUTH_07");
        return {
          statusCode: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": true,
          },
          body: JSON.stringify({ message: "구글 로그아웃을 완료했습니다." }),
        };
      // 3-4. default - 500 err
      default:
        errLog("AUTH_07", 500, "Internal Server Error", {
          user_provider: user_provider,
        });
        return {
          statusCode: 500,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": true,
          },
          body: JSON.stringify({
            message: "로그아웃에 실패했습니다. 다시 시도해주세요.",
          }),
        };
    }
  } catch (err) {
    errLog("AUTH_07", 500, "Internal Server Error", {
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
        message: "로그아웃에 실패했습니다. 다시 시도해주세요.",
      }),
    };
  }
};
