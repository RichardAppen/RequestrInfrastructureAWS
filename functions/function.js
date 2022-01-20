exports.handler = async function (event) {
    console.log("request: ", JSON.stringify(event));

    return {
        statusCode: 200,
        headers: {
            "Access-Control-Allow-Origin" : "*"
        },
        body: event["queryStringParameters"]['testParam']
    }
};