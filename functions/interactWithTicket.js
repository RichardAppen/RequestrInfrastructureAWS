const AWS = require('aws-sdk')

exports.handler = function (event, context, callback) {
    console.log("request: ", JSON.stringify(event));
    const stepfunctions = new AWS.StepFunctions();
    const taskToken = event["queryStringParameters"]['taskToken']

    stepfunctions.sendTaskSuccess({
        output: JSON.stringify({updateType: event["queryStringParameters"]['updateType'], comment: JSON.parse(event["queryStringParameters"]['comment'])}),
        taskToken: taskToken
    }, (error, data) => {
        if (error) {
            console.log(error)
            callback(error.message)
        } else {
            console.log(data)
            callback(data)
        }
        return
    })
};