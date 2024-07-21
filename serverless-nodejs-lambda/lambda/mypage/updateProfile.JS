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

exports.updateProfile = async (event) => {
  infoLog("MYPAGE_02", event.body);
  const {
    user_id,
    user_nickname,
    user_subscription,
    user_prefer,
    user_email,
    access_token,
  } = JSON.parse(event.body);

  const isValidSession = await validateSession(user_id, access_token);
  if (!isValidSession) {
    errLog("MYPAGE_02", 401, "Unauthorized", { user_id: user_id });
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

    // 최종적인 회원 정보 업데이트 던지기
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. MyPage 테이블 업데이트
      await connection.query(
        "UPDATE MyPage SET user_nickname = ?, user_subscription = ?, cate_no = ?, situ_no = ? WHERE user_id = ?",
        [
          user_nickname,
          user_subscription == "true",
          user_prefer[0].cate_no,
          user_prefer[0].situ_no,
          user_id,
        ]
      );

      // 0. 사용자가 이전에 구독했는지 확인
      const [rows] = await connection.query(
        "SELECT user_id FROM Subscription WHERE user_id = ?",
        [user_id]
      );

      // 1. Subscription 테이블 업데이트
      if (rows.length == 0 && user_subscription == "true") {
        // 2-1. user_subscription이 false -> true일 때 Subscription 테이블에 데이터 추가
        for (const prefer of user_prefer) {
          const { cate_no, situ_no } = prefer;
          await connection.query(
            "INSERT INTO Subscription (user_id, user_email, user_nickname, cate_no, situ_no) VALUES (?, ?, ?, ?, ?)",
            [user_id, user_email, user_nickname, cate_no, situ_no]
          );
        }
      } else if (rows.length > 0 && user_subscription != "true") {
        // 2-2. user_subscription이 true -> false일 때 Subscription 테이블에서 해당 유저 정보 삭제
        await connection.query("DELETE FROM Subscription WHERE user_id = ?", [
          user_id,
        ]);
      } else {
        // user_subscription 값이 변하지 않았을 때
        // 다른 값들만 업데이트
        for (const prefer of user_prefer) {
          const { cate_no, situ_no } = prefer;
          await connection.query(
            "UPDATE Subscription SET user_email = ?, user_nickname = ? WHERE user_id = ? AND cate_no = ? AND situ_no = ?",
            [user_email, user_nickname, user_id, cate_no, situ_no]
          );
        }
      }

      await connection.commit();
      successLog("MYPAGE_02");
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({ message: "마이페이지가 저장되었습니다." }),
      };
    } catch (err) {
      await connection.rollback();
      errLog("MYPAGE_02", 500, "Internal Server Error", {
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
          message: "마이페이지 저장에 실패했습니다. 다시 시도해주세요.",
        }),
      };
    } finally {
      connection.release();
    }
  } catch (err) {
    errLog("MYPAGE_02", 500, "Internal Server Error", {
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
        message: "마이페이지 저장에 실패했습니다. 다시 시도해주세요.",
      }),
    };
  }
};
