const axios = require("axios");
const { errLog, infoLog, successLog } = require("/opt/nodejs/utils/logUtils");

exports.getShop = async (event) => {
  infoLog("RECIPE_08", event.body);

  // 0. 검색할 재료 이름 받아오기
  const { ingredient_name } = JSON.parse(event.body);
  const shopUrl = `https://shopping.naver.com/v1/search/base-products?_nc_=1720018800000&q=${encodeURIComponent(
    ingredient_name
  )}&verticals[]=MARKET&verticalDistrictNos[]=1260100840117,1250100839984,1310000004044,1340000001122,1280000000233,1440000004936,1330000000918,1350000001056,1240000000571,1360000001182,1450000003025,1230000000141,1470000003604,1430000002226,1210000000000&sort=POPULARITY&start=1&display=20&filterSoldOut=true`;

  // 1. 요청
  try {
    const response = await axios.get(shopUrl, {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
      },
    });

    const result = response.data.items;
    const extractedData = result.map((item) => ({
      _id: item._id,
      name: item.name,
      channel_name: item.channel.channelName,
      dispSalePrice: item.dispSalePrice,
      discountedPrice: item.benefitsView.dispDiscountedSalePrice,
      discountedRatio: item.benefitsView.dispDiscountedRatio,
      image_url: item.productImages[0].url,
      reviewCount: item.reviewAmount.totalReviewCount,
      reviewScore: item.reviewAmount.averageReviewScore,
    }));

    successLog("RECIPE_08");
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify(extractedData),
    };
  } catch (err) {
    errLog("RECIPE_08", 500, "Internal Server Error", {
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
