const AWS = require('aws-sdk')
let dynamodb = new AWS.DynamoDB.DocumentClient

exports.handler = function (event, context, callback) {
    console.log("request: ", JSON.stringify(event));

    let tableName = process.env.TABLE_NAME
    console.log(tableName)
    console.log(event.body)

    let entry = JSON.parse(event.body)

    dynamodb.put({
        TableName: tableName,
        Item : {
            username: entry.username,
            groupHash: entry.groupHash,
            groupName: entry.groupName,
            usersRole : entry.usersRole,
            owner : entry.owner,
            public : entry.public
        }
    }, (error, data) => {
        if (error) {
            console.log("Error: " + error)
        } else {
            console.log("Success " + data)
        }

    })

    callback(null, {
        statusCode: 200,
        headers: {
            "Access-Control-Allow-Headers" : "*",
            "Access-Control-Allow-Origin" : "*"
        },
        body: null
    })
};