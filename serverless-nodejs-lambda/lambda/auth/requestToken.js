const { errLog, infoLog, successLog } = require("/opt/nodejs/utils/logUtils");

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

let userAgent = "";

exports.requestToken = async (event) => {
  // AUTH_02 : 토큰요청
  const { user_provider, user_agent } = JSON.parse(event.body);
  infoLog("AUTH_02", event.body);

  // userAgent 저장
  userAgent = user_agent;

  // 0. 유효한 user_provider 목록
  const validProviders = ["kakao", "naver", "google"];

  // 1. user_provider가 유효하지 않은 경우 예외 처리
  if (!validProviders.includes(user_provider)) {
    errLog("AUTH_02", 400, "Bad Request", { user_provider: user_provider });
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
    let authURL;
    // 2. user_provider값에 따른 switch-case 처리
    switch (user_provider) {
      // 2-1. kakao
      case "kakao":
        authURL = `https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=${kakaoReq.client_id}&redirect_uri=${kakaoReq.redirect_uri}&scope=${kakaoReq.scope}`;
        successLog("AUTH_02");
        break;
      // 2-2. naver
      case "naver":
        authURL = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${naverReq.client_id}&redirect_uri=${naverReq.redirect_uri}&state=${naverReq.state}`;
        successLog("AUTH_02");
        break;
      // 2-3. google
      case "google":
        authURL = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${googleReq.client_id}&redirect_uri=${googleReq.redirect_uri}&scope=${googleReq.scope}`;
        successLog("AUTH_02");
        break;
      // 2-4. default - 500 err
      default:
        errLog("AUTH_02", 500, "Internal Server Error", {
          user_provider: user_provider,
        });
        return {
          statusCode: 500,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": true,
          },
          body: JSON.stringify({
            message: "토큰 발급 요청에 실패했습니다. 다시 시도해주세요.",
          }),
        };
    }

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({ url: authURL }),
    };
  } catch (err) {
    errLog("AUTH_02", 500, "Internal Server Error", { error: err.message });
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        message: "토큰 발급 요청에 실패했습니다. 다시 시도해주세요.",
      }),
    };
  }
};
