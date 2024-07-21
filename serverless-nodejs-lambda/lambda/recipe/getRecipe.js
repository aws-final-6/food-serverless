const mysql = require("mysql2/promise");
const AWS = require("aws-sdk");
const csv = require("csv-parser");
const { errLog, infoLog, successLog } = require("/opt/nodejs/utils/logUtils");

const secretsManager = new AWS.SecretsManager();
const s3 = new AWS.S3();

// .env bodydata
const bodydata = {
  uri: process.env.BODYDATA_URI,
  filename: process.env.BODYDATA_FILENAME,
};

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

exports.getRecipe = async (event) => {
  infoLog("RECIPE_06", event.body);
  // 0-1. 문자열을 JSON 배열로 변환하는 함수
  const convertToJSONArray = (str) => {
    return str.replace(/\(/g, "[").replace(/\)/g, "]").replace(/'/g, '"');
  };

  // 0-2. 재료 배열을 변환하는 함수
  const transformIngredients = (ingredients) => {
    return ingredients.map(([ingredient, amount]) => ({ ingredient, amount }));
  };

  // 0-3. 레시피 배열을 변환하는 함수
  const transformRecipe = (recipes) => {
    return recipes.map(([step, image]) => ({ step, image }));
  };

  // 1. 파라미터로 받은 id값 정수형태로 변환
  const recipe_id = parseInt(event.pathParameters.id, 10);
  if (isNaN(recipe_id)) {
    errLog("RECIPE_06", 400, "Bad Request", {
      recipe_id: recipe_id,
      message: "잘못된 레시피 ID입니다.",
    });
    return {
      statusCode: 400,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({ message: "잘못된 레시피 ID입니다." }),
    };
  }

  try {
    await getDatabaseCredentials();
    const pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: dbPassword,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    const params = {
      Bucket: bodydata.uri,
      Key: bodydata.filename,
    };

    // 2. CSV 파일 스트림을 생성하고 파싱
    const s3Stream = s3
      .getObject(params)
      .createReadStream()
      .pipe(
        csv({
          headers: [
            "recipe_id",
            "name",
            "image",
            "author",
            "datePublished",
            "description",
            "recipeIngredient",
            "recipeInstructions",
            "tags",
            "cat4",
            "cat2",
          ],
          skipLines: 1,
        })
      );

    // 3. 일치하는 recipe를 찾으면 found = true, 스트림을 파기하여 더 이상의 읽기를 중단
    let found = false;

    const recipePromise = new Promise((resolve, reject) => {
      s3Stream.on("data", async (data) => {
        if (parseInt(data.recipe_id, 10) === recipe_id) {
          found = true;

          const transformedData = {
            recipe_id: data.recipe_id,
            name: data.name,
            image: JSON.parse(data.image.replace(/'/g, '"')),
            author: data.author,
            datePublished: data.datePublished,
            description: data.description,
            recipeIngredient: transformIngredients(
              JSON.parse(convertToJSONArray(data.recipeIngredient))
            ),
            recipeInstructions: transformRecipe(
              JSON.parse(convertToJSONArray(data.recipeInstructions))
            ),
            tags: JSON.parse(data.tags.replace(/'/g, '"')),
            recipe_class: [
              {
                cate_no: data.cat4,
                situ_no: data.cat2,
              },
            ],
          };

          // 6. 쇼핑API를 위해 재료 테이블에서 해당 레시피가 가지고 있는 재료명(정제됨)을 가져오게 함
          const [shoppingIngredientList] = await pool.query(
            "SELECT ingredient_name FROM Ingredient WHERE ingredient_id IN (SELECT ingredient_id FROM IngredientSearch WHERE recipe_id = ?)",
            [recipe_id]
          );

          // 쇼핑 재료 목록을 문자열 배열로 변환하여 추가
          transformedData.shoppingIngredients = shoppingIngredientList.map(
            (item) => item.ingredient_name
          );

          successLog("RECIPE_06");
          s3Stream.destroy();
          resolve({
            statusCode: 200,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Credentials": true,
            },
            body: JSON.stringify(transformedData),
          });
        }
      });

      // 5-1. 만약 없으면 404 반환
      s3Stream.on("end", () => {
        if (!found) {
          errLog("RECIPE_06", 404, "Not Found", {
            recipe_id: recipe_id,
            message: "잘못된 레시피 정보입니다.",
          });
          reject({
            statusCode: 404,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Credentials": true,
            },
            body: JSON.stringify({ message: "잘못된 레시피 정보입니다." }),
          });
        }
      });

      s3Stream.on("error", (err) => {
        errLog("RECIPE_06", 500, "Internal Server Error", {
          recipe_id: recipe_id,
          error: err.message,
        });
        reject({
          statusCode: 500,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": true,
          },
          body: JSON.stringify({
            message: "레시피를 불러오는데에 실패했습니다. 다시 시도해주세요.",
          }),
        });
      });
    });
    return await recipePromise;
  } catch (err) {
    errLog("RECIPE_06", 500, "Internal Server Error", {
      recipe_id: recipe_id,
      error: err.message,
    });
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        message: "레시피를 불러오는데에 실패했습니다. 다시 시도해주세요.",
      }),
    };
  }
};
