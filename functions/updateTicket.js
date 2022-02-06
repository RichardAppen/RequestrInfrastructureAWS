const AWS = require('aws-sdk')
let dynamodb = new AWS.DynamoDB.DocumentClient

exports.handler = function (event, context, callback) {
    console.log("request: ", JSON.stringify(event));

    if (event.choiceStateResult.updateType !== "Comment") {
        event.ticketData.status = event.choiceStateResult.updateType
    }

    const comments = event.comments
    const commentToAdd = event.choiceStateResult.comment
    comments.push(commentToAdd)
    event.comments = comments

    delete event['choiceStateResult']

    callback(null, {
        statusCode: 200,
        headers: {
            "Access-Control-Allow-Headers" : "*",
            "Access-Control-Allow-Origin" : "*"
        },
        body: event
    })
};