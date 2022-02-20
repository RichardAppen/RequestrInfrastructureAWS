# CDK Infrastructure Deployment
- cdk synth
- cdk bootstrap aws://182624231406/us-east-1
- cdk deploy


# API Reference
This is a REST API built with AWS API Gateway Service organised into two separate APIs.

## Requestr Groups API
### Background & Context
'Requestr Groups API' is built around a DyanmoDB table that holds every 'Group' that has
been created on Requestr. This table keeps track of all Groups, as well as all users of Requestr. 
The partition key of the table is the unique groupHash AND
a username and thus, each entry in the table contains a username. Below is a an example:

groupHash | username | groupName      | owner | public | stateMachineARN | usersRole 
--------- |----------|----------------|-------|--------|-----------------|--- 
xxxxx   | user1    | group1         | user1 | true   | yyyy            | Owner
xxxxx   | user2    | group1         | user1 | true   | yyyy            | Member
zzzzz   | user1    | differentGroup | user1 | true   | wwww            | Owner


Now if you were to query this table just by group hash 'xxxxx' you would see the two users 
in the group, user1 and user2. If you queried the table by just username 'user1' you would
see both the groups that user1 is a part of, group1 and differentGroup. Thus, this table
structure can be used to keep track of group information as well as user information. 

### Actions

#### addUpdateGroupEntry
Add a new entry into this DynamoDB Table. The entry is specific to some user. After the entry
is added, a brand new State Machine is created which will hold the execution of tickets that
are created in this specific group. The State Machine ARN will be added to the DynamoDB table entry.

###### Request Syntax
- POST method

*Request Body:*
````json
{
    "username" : string,
    "groupName" : string,
    "groupHash" : string,
    "owner" : string,
    "usersRole": string,
    "public" : boolean
}
````

###### Request Parameters

- username
  - The username of the Requestr User that is either creating the group (which would make them the Owner of the group), or adding themselves to the group as a Member.
- groupName
  - The title of the group
- groupHash
  - The hash of the group. This is created on the client side using Md5 hash of the groupName + the owner of the group
- owner
  - The username of the Requestr User who created the group
- usersRole
  - Refers to the role of the user referred to by the 'username' field
  - Valid Values: ```` Member | Admin | Owner````
- public
  - A boolean that describes if the group does public or private tickets. A group with this value set to true lets all users view all tickets created in the group. If the value is set to false then only those who created a ticket and group staff can see that specific ticket.

###### Response Syntax
````json
string
````

###### Response Elements
- The response is a singular string that can take on two forms:
  - "Created a new State Machine"
    - This is the response if the entry being added is for a brand new group which means a new state machine was created for this group
  - "Did not create a new State Machine"
    - This is the response if the entry being added (or updated) belongs to a group that already exists and thus does not need another new state machine to be created.

<br/>
<br/>

#### deleteEntryByHashAndUsername
Delete an entry in this DynamoDB table. Since the partition key is made up of the groupHash and a username, these must be provided 

###### Request Syntax
- DELETE method

*Query String Parameters:*
````json
{
    "username" : string,
    "groupHash" : string
}
````

###### Query String Parameters

- username
    - The username of the Requestr User that either created the group (which would make them the Owner of the group), or added themselves to the group as a Member.
- groupHash
    - The hash of the group. This is created on the client side using Md5 hash of the groupName + the owner of the group

###### Response Syntax
````
````

###### Response Elements
- none

<br/>
<br/>

#### getEntriesByHash
Get all entries of the DynamoDB table by Querying the partition key. This will return all entries of the table with that corresponding groupHash. This result would reepresent
all members of the given group.

###### Request Syntax
- GET method

*Query String Parameters:*
````json
{
    "groupHash" : string
}
````

###### Query String Parameters

- groupHash
    - The hash of the group. This is created on the client side using Md5 hash of the groupName + the owner of the group

###### Response Syntax
- An array of entries that all have the given groupHash:
````json
[
  {
    "username" : string,
    "groupName" : string,
    "groupHash" : string,
    "owner" : string,
    "usersRole": string,
    "public" : boolean
  }
]
````

###### Response Elements
- An array of the JSON representation of a group [[See addUpdateGroupEntry's Request Parameters](#addupdategroupentry)]

<br/>
<br/>

#### getEntriesByUsername
Get all entries of the DynamoDB table by Querying a Secondary Global Index which has a partition key of just
username. This will return all entries of the table corresponding to the given user. This would represent all
the groups the given user is a part of, and his/her role in them.

###### Request Syntax
- GET method

*Query String Parameters:*
````json
{
    "username" : string
}
````

###### Query String Parameters

- username
    - The username of the Requestr User that is either creating the group (which would make them the Owner of the group), or adding themselves to the group as a Member.

###### Response Syntax
- An array of entries that all have the given username:
````json
[
  {
    "username" : string,
    "groupName" : string,
    "groupHash" : string,
    "owner" : string,
    "usersRole": string,
    "public" : boolean
  }
]
````

###### Response Elements
- An array of the JSON representation of a group [[See addUpdateGroupEntry's Request Parameters](#addupdategroupentry)]

<br/>
<br/>







## Requestr Tickets API
### Background & Context
'Requestr Tickets API' is built around the concept of State Machines. Each Group has a corresponding State Machine.
One execution of this state machine will represent a ticket going through the approval process in this group.
When a ticket is created, a new execution is started in this group's state machine and it will go through the process
of having comments added, being approved or denied, and being archived. This allows us to keep all ticket data within
the execution of the state machine and eliminates the need for permanently storing the data in
another DynamoDB table.

### Actions

#### createTicket
Create a new ticket in the given group by starting a new execution of the group's state machine.
The ticket will automatically go into the first state which waits for interaction. The next possible states
are the approved state, denied state, or comment state. When a ticket is created the DynamoDB table is queried for all members
of the group that are of rank 'Admin' or 'Owner'. It then calls on AWS Cognito to get the emails of these users. It will then
send an email using AWS SES to each of these emails, notifying them that a new ticket was created in their group.

###### Request Syntax
- POST method

*Query String Parameters:*
````json
{
    "stateMachineARN" : string
}
````
*Request Body:*
````json
{
    "ticketId" : string,
    "requestor" : string,
    "subject" : string,
    "description" : string,
    "date" : string,
    "status": string
}
````

###### Request Parameters

- stateMachineARN
    - The ARN to identify the group's unique state machine to start the ticket execution in



- ticketId
    - The unique ID of the new ticket
- requestr
    - The username of the Requestr user that created the ticket
- subject
    - The subject of the ticket
- description
  - The content of the ticket
- date
    - The date when the ticket was created
- status
    - The current status of the ticket
    - Valid Values: ```` Pending | Approved | Denied````

###### Response Syntax
````
string
````

###### Response Elements
- The date and time that the execution started (i.e. when the ticket was created) as a string


<br/>
<br/>

#### getTicketExecutionsByStateMachineARN
Get all the tickets within a given group by providing the stateMachineARN of the state machine associated with the group.
You can ask for running or succeeded executions. 

###### Request Syntax
- GET method

*Query String Parameters:*
````json
{
    "stateMachineARN" : string,
    "statusFilter" : string
}
````

###### Request Parameters

- stateMachineARN
  - The ARN to identify the group's unique state machine to get the tickets from
- statusFilter
  - What type of tickets to get. Tickets that are still running have yet to be archived, will tickets that have succeeded have been archived.
  - Valid Values: ```` RUNNING | SUCCEEDED ````

###### Response Syntax
- The response is an array of JSON objects, each representing a ticket. The format of this JSON object is different depending on the 'statusFilter' value given.
- If 'statusFilter' = 'RUNNING'
````json
[
  {
    "request": {
      "ticketData": {
        "ticketId": string,
        "requestor": string,
        "subject": string,
        "description": string,
        "date": string,
        "status": string
      },
      "comments": string[]
    },
    "token": string
  }
]
````
- If 'statusFilter' = 'SUCCEEDED'
````json
[
  {
    "ticketData": {
      "ticketId": string,
      "requestor": string,
      "subject": string,
      "description": string,
      "date": string,
      "status": string
    },
    "comments": string[][]
  }
]
````

###### Response Elements
- If 'statusFilter' = 'RUNNING'
  - request
    - ticketData
      - Holds the JSON object that represents a ticket [[See createTicket Requests Parameters](#createticket)]
    - comments
      - Holds the comments associated with that ticket which is an array of strings expected in the format of: ["Commenter", "Comment Date", "Actual Comment"]
  - token
    - The current taskToken of the execution that represents this ticket in the group's state machine
    - Use this token to update the ticket.
- If 'statusFilter' = 'SUCCEEDED'
  - ticketData 
    - Holds the JSON object that represents a ticket [[See createTicket Requests Parameters](#createticket)]
  - comments
    - Holds the comments associated with that ticket which is an array of strings expected in the format of: ["Commenter", "Comment Date", "Actual Comment"]



<br/>
<br/>

#### interactWithTicket
Interact with a ticket execution that already exists within some State Machine. You can add comments, approve tickets, deny tickets, and archive tickets.
You cannot comment on approved, denied, or archived tickets.

###### Request Syntax
- POST method

*Query String Parameters:*
````json
{
    "taskToken" : string,
    "updateType" : string,
    "comment" : string
}
````

###### Request Parameters

- taskToken
  - The token that the Step Function API needs to know which execution in which state machine to update
- updateType
  - What kind of interaction with the ticket is occurring.
  - Valid Values: ```` Approved | Denied | Comment | Archived ````
- comment
  - A string representing a JSON array of strings expected in the format of: ["Commenter", "Comment Date", "Actual Comment"]
  - For the case that 'updateType' = 'Comment', this is the comment that is added to the ticket
  - For the case that 'updateType' = 'Approved' or 'Denied', this comment is still added to the ticket, and should be an automated comment created for informative purposes
  - For the case that 'updateType' = 'Archived', this comment is discarded.

###### Response Syntax
````
````

###### Response Elements
- none