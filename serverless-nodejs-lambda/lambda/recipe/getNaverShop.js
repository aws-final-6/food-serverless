const AWS = require("aws-sdk");
const axios = require("axios");
const { errLog, infoLog, successLog } = require("/opt/nodejs/utils/logUtils");

exports.getNaverShop = async (event) => {
  infoLog("RECIPE_07", event.body);

  // 0. 검색할 재료 이름 받아오기
  const { ingredient_name } = JSON.parse(event.body);
  const shopUrl = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(
    ingredient_name
  )}&sort=asc&filter=naverpay&display=20`;

  // 1. 요청
  try {
    const response = await axios.get(shopUrl, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET,
      },
    });

    successLog("RECIPE_07");
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify(response.data),
    };
  } catch (err) {
    errLog("RECIPE_07", 500, "Internal Server Error", {
      ingredient_name: ingredient_name,
      error: err.message,
    });
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        message: "네이버 쇼핑 검색에 실패했습니다. 다시 시도해주세요.",
      }),
    };
  }
};
