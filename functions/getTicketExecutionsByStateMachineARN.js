const AWS = require('aws-sdk')

exports.handler = function (event, context, callback) {
    const stepfunctions = new AWS.StepFunctions();
    const statusOfExecutions = event["queryStringParameters"]['statusFilter']
    const username = event["queryStringParameters"]['username']
    const usersRole = event["queryStringParameters"]['usersRole']
    const groupType = event["queryStringParameters"]['groupType']

    console.log("Headed into listExecutions() method")

    //
    //Complicated promise use explained ahead:
    //

    // First promise a list of all executions (which represent tickets) in the given state machine (which will correspond to some group)
    const listExecutionsPromise = stepfunctions.listExecutions({
        stateMachineArn: event["queryStringParameters"]['stateMachineARN'],
        statusFilter: statusOfExecutions
    }).promise()

    // When the promise is kept, the result is a list of executions
    listExecutionsPromise.then((listOfExecutions) => {
        const promiseArray = []
        // iterate over the list of executions
        listOfExecutions.executions.forEach((execution) => {
            // For each execution promise a JSON representation of that executions history
            const executionHistoryPromise = stepfunctions.getExecutionHistory({
                executionArn: execution.executionArn,
                reverseOrder: true
            }).promise()
            // Put this promise in a promise array
            promiseArray.push(executionHistoryPromise)
        })

        // Using Promise.all we can get a list of every execution history (one history for each execution) in the state machine
        Promise.all(promiseArray).then((allExecutionHistories) => {
            let arrayOfExecutionsFinalEvents = []
            // Filter out to just have an array with the most recent event in the execution history (this is the only event that currently matters for a ticket)
            allExecutionHistories.forEach((executionHistory) => {
                console.log("pushing event: ")
                console.log(executionHistory.events[0])
                // 'TaskSubmitted' will be present on every ticket execution. It WILL be the most recent event in a still Running (Pending or awaiting archival) ticket
                if (statusOfExecutions === "RUNNING") {
                    const mostRecentExecutionEvent = executionHistory.events[0]
                    const outputOfMostRecentEventAsJSON = JSON.parse(mostRecentExecutionEvent.taskSubmittedEventDetails.output)
                    const ticketDataFromMostRecentEvent = outputOfMostRecentEventAsJSON.Payload.body
                    arrayOfExecutionsFinalEvents.push(ticketDataFromMostRecentEvent)
                }
                // 'ExecutionSucceeded' will be the most recent event of a ticket that has been archived and thus the execution is no longer running (i.e. execution will have succeeded)
                else if (statusOfExecutions === "SUCCEEDED") {
                    const mostRecentExecutionEvent = executionHistory.events[0]
                    // In the case of 'ExecutionSucceeded, this will already be the ticketData, so no need to parse further
                    const outputOfMostRecentEventAsJSON = JSON.parse(mostRecentExecutionEvent.executionSucceededEventDetails.output)
                    arrayOfExecutionsFinalEvents.push(outputOfMostRecentEventAsJSON)
                }
            })

            // process final result if the group is private
            if (groupType === 'private') {
                // Case of active tickets
                if (statusOfExecutions === "RUNNING") {
                    if (usersRole === 'Member') {
                        let filteredTickets = []
                        arrayOfExecutionsFinalEvents.forEach((execution) => {
                            if (execution.request.ticketData.requestor === username) {
                                filteredTickets.push(execution)
                            }
                        })
                        arrayOfExecutionsFinalEvents = filteredTickets
                    }

                // Case of archived tickets
                } else if (statusOfExecutions === "SUCCEEDED") {
                    if (usersRole === 'Member') {
                        let filteredTickets = []
                        arrayOfExecutionsFinalEvents.forEach((ticket) => {
                            if (ticket.ticketData.requestor === username) {
                                filteredTickets.push(ticket)
                            }
                        })
                        arrayOfExecutionsFinalEvents = filteredTickets
                    }
                }
            }

            // finally, callback the lambda with the list of each execution history's final event
            callback(null, {
                statusCode: 200,
                headers: {
                    "Access-Control-Allow-Headers" : "*",
                    "Access-Control-Allow-Origin" : "*"
                },
                body: JSON.stringify(arrayOfExecutionsFinalEvents)
            })
        })
    })
};