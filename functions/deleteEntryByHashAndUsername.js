const AWS = require("aws-sdk");
let dynamodb = new AWS.DynamoDB.DocumentClient

exports.handler = function (event, context, callback) {
    console.log("request: ", JSON.stringify(event));
    let tableName = process.env.TABLE_NAME

    dynamodb.delete({
        TableName: tableName,
        Key : {
            "groupHash" : event["queryStringParameters"]['groupHash'],
            "username" : event["queryStringParameters"]['username']
        }
    }, (error, data) => {
        if (error) {
            console.log("Error: " + error)
        } else {
            console.log("Success " + JSON.stringify(data))

            callback(null, {
                statusCode: 200,
                headers: {
                    "Access-Control-Allow-Origin" : "*"
                },
                body: JSON.stringify(data)
            })
        }
    })
};