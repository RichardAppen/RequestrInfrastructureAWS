const AWS = require('aws-sdk')
let dynamodb = new AWS.DynamoDB.DocumentClient


exports.handler = function (event, context, callback) {
    const stepfunctions = new AWS.StepFunctions();
    console.log("request: ", JSON.stringify(event));

    let tableName = process.env.TABLE_NAME
    let statemachine_definition = process.env.STATEMACHINE_DEFINITION
    let model_roleARN = process.env.MODEL_ROLE_ARN
    console.log(tableName)
    console.log(event.body)

    let entry = JSON.parse(event.body)

    dynamodb.query({
        TableName: tableName,
        KeyConditionExpression: "groupHash = :groupHash",
        ExpressionAttributeValues: {
            ":groupHash": entry.groupHash
        }
    }, (error, queryResult) => {
        if (error) {
            console.log("Error: " + error)
        } else {
            // If the dynamoDB query shows that this group already as zero entries, then this is a new group and we need to build a state machine for it
            if (queryResult.Items.length === 0) {
                console.log("Group doesn't already exists so we can create the state machine")
                const createStateMachinePromise = stepfunctions.createStateMachine({
                    definition: statemachine_definition,
                    name: "StateMachineForGroup_" + entry.groupName + "_CreatedBy_" + entry.owner,
                    roleArn: model_roleARN
                }).promise()

                createStateMachinePromise.then((createStateMachineResult) => {
                    dynamodb.put({
                        TableName: tableName,
                        Item : {
                            username: entry.username,
                            groupHash: entry.groupHash,
                            groupName: entry.groupName,
                            usersRole : entry.usersRole,
                            owner : entry.owner,
                            public : entry.public,
                            stateMachineARN : createStateMachineResult.stateMachineArn
                        }
                    }, (error, data) => {
                        if (error) {
                            console.log("Error: " + error)
                        } else {
                            console.log("Success " + data)
                        }

                        callback(null, {
                            statusCode: 200,
                            headers: {
                                "Access-Control-Allow-Headers" : "*",
                                "Access-Control-Allow-Origin" : "*"
                            },
                            body: "Created a new State Machine"
                        })
                    })
                })
                // otherwise this group already has at least one entry in the table and must already have a state machine built for it
            } else {
                console.log('Group does already exists so we are getting the state machine ARN and saving this')
                console.log(queryResult.Items[0])
                dynamodb.put({
                    TableName: tableName,
                    Item : {
                        username: entry.username,
                        groupHash: entry.groupHash,
                        groupName: entry.groupName,
                        usersRole : entry.usersRole,
                        owner : entry.owner,
                        public : entry.public,
                        stateMachineARN : queryResult.Items[0].stateMachineARN
                    }
                }, (error, data) => {
                    if (error) {
                        console.log("Error: " + error)
                    } else {
                        console.log("Success " + data)
                    }

                    callback(null, {
                        statusCode: 200,
                        headers: {
                            "Access-Control-Allow-Headers" : "*",
                            "Access-Control-Allow-Origin" : "*"
                        },
                        body: "Did not create a new State Machine"
                    })
                })
            }
        }
    })
};