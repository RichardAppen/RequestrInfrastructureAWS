const AWS = require('aws-sdk')

exports.handler = function (event, context, callback) {
    console.log("request: ", JSON.stringify(event));
    const stepfunctions = new AWS.StepFunctions();
    const taskToken = event["queryStringParameters"]['taskToken']

    const interactWithTicketPromise = stepfunctions.sendTaskSuccess({
        output: JSON.stringify({updateType: event["queryStringParameters"]['updateType'], comment: JSON.parse(event["queryStringParameters"]['comment'])}),
        taskToken: taskToken
    }).promise()

    interactWithTicketPromise.then((data) => {
        callback(null, {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Headers" : "*",
                "Access-Control-Allow-Origin" : "*"
            },
            body: null
        })
    })
};