const AWS = require('aws-sdk')

exports.handler = function (event, context, callback) {
    const ses = new AWS.SES({region: "us-east-1"})
    console.log(event)
    console.log(event.Records)
    const promiseArray = []
    event.Records.forEach((record) => {
        const snsRecord = JSON.parse(record.Sns.Message)
        console.log(snsRecord)
        const snsContent = snsRecord.content

        const messageBodyHTML = "<div>FROM: " + snsRecord.mail.source +
            "<div><br></div>TO: " + snsRecord.mail.destination[0] +
            "<div><br></div>SUBJECT: " + snsRecord.mail.commonHeaders.subject +
            "<div><br></div>DATE: " + snsRecord.mail.commonHeaders.date +
            "<div><br></div>MESSAGE:<div><br></div><div><br></div></div>" + snsContent
        console.log(messageBodyHTML)

        const sesSendEmailPromise = ses.sendEmail({
            Destination: {
                ToAddresses: ['richardsappen@gmail.com']
            },
            Message: {
                Body: {
                    Html: {
                        Data: messageBodyHTML
                    }
                },
                Subject: {Data: "New Email from " + snsRecord.mail.source + " to Requestr Domain"}
            },
            Source: "RequestrEmailServer@requestr.org"
        }).promise()
        promiseArray.push(sesSendEmailPromise)
    })


    Promise.all(promiseArray).then((date) => {
        callback(null, null)
    })
}