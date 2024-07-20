import json
import pymysql
import boto3
import os

# 환경변수 설정
MYSQL_HOST = os.getenv('MYSQL_HOST')
MYSQL_USER = os.getenv('MYSQL_USER')
MYSQL_PASSWORD = os.getenv('MYSQL_PASSWORD')
MYSQL_DATABASE = os.getenv('MYSQL_DATABASE')
SQS_QUEUE_URL = os.getenv('SQS_QUEUE_URL')

# SQS 클라이언트 설정
sqs = boto3.client('sqs')

def lambda_handler(event, context):
    # MySQL 데이터베이스 연결 설정
    connection = pymysql.connect(
        host=MYSQL_HOST,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        database=MYSQL_DATABASE,
        cursorclass=pymysql.cursors.DictCursor
    )

    try:
        with connection.cursor() as cursor:
            # Subscription 테이블 조회
            sql = "SELECT * FROM Subscription"
            cursor.execute(sql)
            result = cursor.fetchall()

            # 결과를 로그에 출력 (테스트 용도)
            print("Fetched data: ", result)

            # 결과를 SQS로 전송
            # for row in result:
            #     response = sqs.send_message(
            #         QueueUrl=SQS_QUEUE_URL,
            #         MessageBody=json.dumps(row)
            #     )
            #     print(f"Message ID: {response['MessageId']} sent to SQS")

    except Exception as e:
        print(f"Error: {str(e)}")
    finally:
        connection.close()

    # 결과를 반환하여 테스트에서 확인할 수 있도록 함
    return {
        'statusCode': 200,
        'body': json.dumps(result)
    }
