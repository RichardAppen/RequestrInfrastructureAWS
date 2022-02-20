const AWS = require('aws-sdk')
let dynamodb = new AWS.DynamoDB.DocumentClient

exports.handler = function (event, context, callback) {
    const stepfunctions = new AWS.StepFunctions();
    const cognito = new AWS.CognitoIdentityServiceProvider();
    const ses = new AWS.SES({region: "us-east-1"})
    let ticket = JSON.parse(event.body)
    console.log(event["queryStringParameters"]['stateMachineARN'])
    console.log(ticket)
    let tableName = process.env.TABLE_NAME
    let userPoolId = process.env.USER_POOL_ID

    const createTicketPromise = stepfunctions.startExecution({
        stateMachineArn: event["queryStringParameters"]['stateMachineARN'],
        input: JSON.stringify({
            "ticketData" : ticket,
            "comments" : []
        })
    }).promise()

    createTicketPromise.then((data) => {
        dynamodb.query({
            TableName: tableName,
            IndexName: 'RequestrGroupsTableByStateMachineARNIndex',
            KeyConditionExpression: "stateMachineARN = :stateMachineARN",
            FilterExpression: "usersRole <> :usersRole",
            ExpressionAttributeValues: {
                ":stateMachineARN": event["queryStringParameters"]['stateMachineARN'],
                ":usersRole": "Member"
            }
        }, (error, queryResult) => {
            if (error) {
                console.log("Error: " + error)
            } else {
                const emailsToAlert = []
                const getUsersEmailPromiseArray = []
                let groupName = ""
                let groupHash = ""
                if (queryResult.Items.length > 0) {
                    groupName = queryResult.Items[0].groupName
                    groupHash = queryResult.Items[0].groupHash
                }
                queryResult.Items.forEach((entry) => {
                    const getUserPromise = cognito.adminGetUser({
                        Username: entry.username,
                        UserPoolId: userPoolId
                    }).promise()
                    getUsersEmailPromiseArray.push(getUserPromise)
                })

                Promise.all(getUsersEmailPromiseArray).then((getUserResponseArray) => {
                    // Get all Admin & Owner Emails
                    getUserResponseArray.forEach((getUserResponse) => {
                        getUserResponse.UserAttributes.forEach((userAttribute) => {
                            console.log(userAttribute)
                            if (userAttribute.Name.toString() === 'email') {
                                emailsToAlert.push(userAttribute.Value.toString())
                            }
                        })
                    })

                    const emailContentHTML = '<div style="margin: auto;\n' +
                        '    border: solid 2px #9d1c00;\n' +
                        '    width: fit-content;\n' +
                        '    padding: 20px;">' +
                        '<div><br></div><div style="margin: auto;\n' +
                        '    width: fit-content;\n' +
                        '    padding: 10px;\n' +
                        '    text-align: center;\n' +
                        '    font-size: x-large;\n' +
                        '    font-weight: bolder;\n' +
                        '    color: #9d1c00;"> Requestr</div>'+
                        `<div style="margin: auto; width: fit-content">A new ticket was created in your group, ${groupName}, by ${ticket.requestor} with the subject being: ${ticket.subject}</div>` +
                        `<div><br></div><div style="margin: auto; width: fit-content">Check out the ticket <a href="www.requestr.org/Groups/${groupHash}/active/${ticket.ticketId}">Here</a></div>` +
                        `<div><br></div><div style="margin: auto; width: fit-content">Check out your group <a href="www.requestr.org/Groups/${groupHash}/active">Here</a></div>` +
                        `<div><br></div>` +
                        `<div><br></div><div style="margin: auto; width: fit-content">You recieved this notification becuase you are an administrator of the group ${groupName}</div>` +
                        `<div><br></div><div style="margin: auto; width: fit-content">Thank you for using Requestr!</div>` +
                        '</div>'


                    console.log("sending email")
                    console.log(emailsToAlert)
                    // Once we have the emails, send out an alert using SES
                    const sendEmailPromise = ses.sendEmail({
                        Destination: {
                            ToAddresses: emailsToAlert
                        },
                        Message: {
                            Body: {
                                Html: {
                                    Data: emailContentHTML
                                }
                            },
                            Subject: {Data: `New Ticket created in group ${groupName} by ${ticket.requestor}`}
                        },
                        Source: 'RequestrAlerts@requestr.org'
                    }).promise()

                    sendEmailPromise.then((result) => {
                        console.log(result)
                        callback(null, {
                            statusCode: 200,
                            headers: {
                                "Access-Control-Allow-Headers" : "*",
                                "Access-Control-Allow-Origin" : "*"
                            },
                            body: data.startDate
                        })
                    })
                })
            }
        })
    })
}