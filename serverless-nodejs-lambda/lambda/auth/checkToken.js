const axios = require("axios"); // HTTP 요청을 위한 axios 패키지 추가
const {
  validateSession,
  deleteSession,
} = require("/opt/nodejs/utils/sessionUtils");
const { errLog, infoLog, successLog } = require("/opt/nodejs/utils/logUtils");

exports.checkToken = async (event) => {
  // AUTH_01 : 토큰검증
  const { user_id, user_provider, access_token } = JSON.parse(event.body);
  infoLog("AUTH_01", event.body);

  // 0. 유효한 user_provider 목록
  const validProviders = ["kakao", "naver", "google"];

  // 1. user_provider가 유효하지 않은 경우 예외 처리
  if (!validProviders.includes(user_provider)) {
    errLog("AUTH_01", 400, "Bad Request", { user_provider: user_provider });
    return {
      statusCode: 400,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({ message: "유효하지 않은 프로바이더 입니다." }),
    };
  }

  // 2-1. user_id와 access_token을 받지 못했을 때 - 프론트에서 아예 값을 가지고 있지 않을 때 (최초, 혹은 회원가입 취소 시 등)
  if (!user_id || !access_token) {
    errLog("AUTH_01", 400, "Bad Request", {
      message: "user_id 또는 access_token이 제공되지 않았습니다.",
    });
    return {
      statusCode: 400,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        message: "user_id 또는 access_token이 제공되지 않았습니다.",
      }),
    };
  }
  try {
    // 2-2. Session 테이블에서 user_id와 access_token이 올바르게 짝지어져 있는지 확인
    const isValidSession = await validateSession(user_id, access_token);
    if (!isValidSession) {
      errLog("AUTH_01", 401, "Unauthorized", { user_id: user_id });
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

    // 3. switch-case문으로 user_provider값에 따라 코드 실행
    switch (user_provider) {
      // 3-1. kakao
      case "kakao":
        const kakaoAuthURL = `https://kapi.kakao.com/v1/user/access_token_info`;
        try {
          // 3-1-1. 유효할 경우 200
          const response = await axios.get(kakaoAuthURL, {
            headers: {
              Authorization: `Bearer ${access_token}`,
            },
          });
          successLog("AUTH_01");
          return {
            statusCode: 200,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Credentials": true,
            },
            body: JSON.stringify({ message: "유효한 액세스 토큰입니다." }),
          };
        } catch (err) {
          // 3-1-2. 유효하지 않은 경우 419, Session Table에서 user_id, access_token 삭제
          if (err.response && err.response.status === 401) {
            await deleteSession(user_id);
            errLog("AUTH_01", 419, "Token Expired", { user_id: user_id });
            return {
              statusCode: 419,
              headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": true,
              },
              body: JSON.stringify({
                message: "유효하지 않은 액세스 토큰입니다.",
              }),
            };
          } else {
            errLog("AUTH_01", 500, "Internal Server Error", {
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
                message: "카카오 토큰 검증에 실패했습니다. 다시 시도해주세요.",
              }),
            };
          }
        }
      // 3-2. naver
      case "naver":
        const naverAuthURL = `https://openapi.naver.com/v1/nid/me`;
        try {
          // 3-2-1. 유효할 경우 200
          const response = await axios.get(naverAuthURL, {
            headers: {
              Authorization: `Bearer ${access_token}`,
            },
          });
          successLog("AUTH_01");
          return {
            statusCode: 200,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Credentials": true,
            },
            body: JSON.stringify({ message: "유효한 액세스 토큰입니다." }),
          };
        } catch (err) {
          // 3-2-2. 유효하지 않은 경우 419, Session Table에서 user_id, access_token 삭제
          if (err.response && err.response.status === 401) {
            await deleteSession(user_id);
            errLog("AUTH_01", 419, "Token Expired", { user_id: user_id });
            return {
              statusCode: 419,
              headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": true,
              },
              body: JSON.stringify({
                message: "유효하지 않은 액세스 토큰입니다.",
              }),
            };
          } else {
            errLog("AUTH_01", 500, "Internal Server Error", {
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
                message: "네이버 토큰 검증에 실패했습니다. 다시 시도해주세요.",
              }),
            };
          }
        }
      // 3-3. google
      case "google":
        const googleAuthURL = `https://oauth2.googleapis.com/tokeninfo?access_token=${access_token}`;
        try {
          // 3-3-1. 유효할 경우 200
          const response = await axios.get(googleAuthURL);
          successLog("AUTH_01");
          return {
            statusCode: 200,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Credentials": true,
            },
            body: JSON.stringify({ message: "유효한 액세스 토큰입니다." }),
          };
        } catch (err) {
          // 3-3-2. 유효하지 않은 경우 419, Session Table에서 user_id, access_token 삭제
          if (err.response && err.response.status === 400) {
            await deleteSession(user_id);
            errLog("AUTH_01", 419, "Token Expired", { user_id: user_id });
            return {
              statusCode: 419,
              headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": true,
              },
              body: JSON.stringify({
                message: "유효하지 않은 액세스 토큰입니다.",
              }),
            };
          } else {
            errLog("AUTH_01", 500, "Internal Server Error", {
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
                message: "구글 토큰 검증에 실패했습니다. 다시 시도해주세요.",
              }),
            };
          }
        }
      default:
        errLog("AUTH_01", 500, "Internal Server Error", {
          user_id: user_id,
          user_provider: user_provider,
        });
        return {
          statusCode: 500,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": true,
          },
          body: JSON.stringify({
            message: "토큰 검증에 실패했습니다. 다시 시도해주세요.",
          }),
        };
    }
  } catch (err) {
    errLog("AUTH_01", 500, "Internal Server Error", {
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
        message: "토큰 검증에 실패했습니다. 다시 시도해주세요.",
      }),
    };
  }
};
