const { getRefrigeratorData } = require("/opt/nodejs/utils/refrigUtils");
const { errLog, infoLog, successLog } = require("/opt/nodejs/utils/logUtils");

exports.getRefrig = async (event) => {
  const body = JSON.parse(event.body);
  infoLog("REFRIG_01", body);
  const { user_id } = body;

  // 1. user_id 체크
  if (!user_id) {
    errLog("REFRIG_01", 400, "Bad Request", {
      user_id: user_id,
      message: "잘못된 유저 정보입니다.",
    });
    return {
      statusCode: 400,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({ message: "잘못된 유저 정보입니다." }),
    };
  }

  try {
    // 2. user_id로 냉장고 및 재료 정보 가져오기
    const result = await getRefrigeratorData(user_id);

    // 3. 결과가 없는 경우 처리
    if (result.length === 0) {
      errLog("REFRIG_01", 404, "Not Found", {
        user_id: user_id,
        message: "냉장고 정보를 찾을 수 없습니다.",
      });
      return {
        statusCode: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({ message: "냉장고 정보를 찾을 수 없습니다." }),
      };
    }

    successLog("REFRIG_01");
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify(result),
    };
  } catch (err) {
    errLog("REFRIG_01", 500, "Internal Server Error", {
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
        message: "냉장고 데이터를 불러오지 못했습니다. 다시 시도해주세요.",
      }),
    };
  }
};
