const mysql = require("mysql2/promise");
const AWS = require("aws-sdk");
const { errLog, infoLog, successLog } = require("/opt/nodejs/utils/logUtils");
const secretsManager = new AWS.SecretsManager();

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

exports.signup = async (event) => {
  infoLog("AUTH_08", event.body);
  const {
    user_id,
    access_token,
    user_provider,
    user_email,
    user_nickname,
    user_subscription,
    user_prefer,
  } = JSON.parse(event.body);

  let connection;
  const subscription = Boolean(user_subscription == "true");

  try {
    if (!pool) await createPool();

    // 1. 이메일 중복 체크
    const [existingUsers] = await pool.query(
      "SELECT * FROM User WHERE user_email = ?",
      [user_email]
    );

    if (existingUsers.length > 0) {
      errLog("AUTH_08", 409, "Conflict", {
        user_id: user_id,
        user_email: user_email,
      });
      return {
        statusCode: 409,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({
          message: "중복된 이메일이 있습니다. 이메일을 다시 확인해주세요.",
        }),
      };
    }

    // 2. 트랜잭션 시작
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 3-1. User 테이블에 user_id, user_email, user_provider 저장
    await connection.query(
      "INSERT INTO User (user_id, user_email, user_provider) VALUES (?, ?, ?)",
      [user_id, user_email, user_provider]
    );
    // 3-2. Session 테이블에 user_id, access_token 저장
    await connection.query(
      "INSERT INTO Session (user_id, access_token) VALUES (?, ?)",
      [user_id, access_token]
    );
    // 3-3. MyPage 테이블에 user_id, user_nickname, user_subscription, cate_no, situ_no 저장
    for (const prefer of user_prefer) {
      const { cate_no, situ_no } = prefer;
      await connection.query(
        "INSERT INTO MyPage (user_id, user_nickname, user_subscription, cate_no, situ_no) VALUES (?, ?, ?, ?, ?)",
        [user_id, user_nickname, subscription, cate_no, situ_no]
      );
    }
    // 3-4. user_subscription이 true일 때 Subscription 테이블에 user_id, user_nickname, user_email, cate_no, situ_no 저장
    if (subscription) {
      for (const prefer of user_prefer) {
        const { cate_no, situ_no } = prefer;
        await connection.query(
          "INSERT INTO Subscription (user_id, user_email, user_nickname, cate_no, situ_no) VALUES (?, ?, ?, ?, ?)",
          [user_id, user_email, user_nickname, cate_no, situ_no]
        );
      }
    }
    // 3-5. Refrigerator 기본값 저장
    await connection.query(
      "INSERT INTO Refrigerator (refrigerator_name, refrigerator_type, user_id) VALUES (?, ?, ?)",
      ["냉장고", 1, user_id]
    );
    await connection.query(
      "INSERT INTO Refrigerator (refrigerator_name, refrigerator_type, user_id) VALUES (?, ?, ?)",
      ["냉동고", 2, user_id]
    );

    // 4. 트랜잭션 커밋
    await connection.commit();
    successLog("AUTH_08");
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({ message: "회원 가입이 완료되었습니다." }),
    };
  } catch (err) {
    // 5. 실패 시 트랜잭션 롤백
    if (connection) await connection.rollback();
    errLog("AUTH_08", 500, "Internal Server Error", {
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
        message: "회원 가입에 실패했습니다. 다시 시도해주세요.",
      }),
    };
  } finally {
    if (connection) connection.release();
  }
};
