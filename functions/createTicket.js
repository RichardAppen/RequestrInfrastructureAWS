const AWS = require('aws-sdk')

exports.handler = function (event, context, callback) {
    const stepfunctions = new AWS.StepFunctions();
    let ticket = JSON.parse(event.body)
    console.log(event["queryStringParameters"]['stateMachineARN'])
    console.log(ticket)

    const createTicketPromise = stepfunctions.startExecution({
        stateMachineArn: event["queryStringParameters"]['stateMachineARN'],
        input: JSON.stringify({
            "ticketData" : ticket,
            "comments" : []
        })
    }).promise()

    createTicketPromise.then((data) => {
        callback(null, {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Headers" : "*",
                "Access-Control-Allow-Origin" : "*"
            },
            body: data.startDate
        })
    })
}