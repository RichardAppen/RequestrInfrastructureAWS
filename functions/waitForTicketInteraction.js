const AWS = require('aws-sdk')

exports.handler = function (event, context, callback) {
    console.log("request: ", JSON.stringify(event));
    console.log("waiting for interaction")

    callback(null, {
        statusCode: 200,
        headers: {
            "Access-Control-Allow-Headers" : "*",
            "Access-Control-Allow-Origin" : "*"
        },
        body: event
    })
};