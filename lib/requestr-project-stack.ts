import * as lambda from '@aws-cdk/aws-lambda';
import * as apigateway from '@aws-cdk/aws-apigateway';
import {JsonSchemaType} from '@aws-cdk/aws-apigateway';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as sfn from '@aws-cdk/aws-stepfunctions'
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks'
import * as cdk from '@aws-cdk/core';
import * as cognito from '@aws-cdk/aws-cognito'
import {CfnUserPool, Mfa} from '@aws-cdk/aws-cognito'
import * as iam from '@aws-cdk/aws-iam'
import {Effect} from '@aws-cdk/aws-iam'
import * as sns from '@aws-cdk/aws-sns'
import * as ses from '@aws-cdk/aws-ses'
import * as sesActions from '@aws-cdk/aws-ses-actions'
import * as custom from '@aws-cdk/custom-resources'
import * as subscriptions from '@aws-cdk/aws-sns-subscriptions'

export class RequestrProjectStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

      const requestrGroupsTable = new dynamodb.Table(this, "RequestrGroupsTable", {
          partitionKey: { name: "groupHash", type: dynamodb.AttributeType.STRING},
          sortKey: { name: "username", type: dynamodb.AttributeType.STRING}
      });

      requestrGroupsTable.addGlobalSecondaryIndex({
          indexName: "RequestrGroupsTableByUsernameIndex",
          partitionKey: { name: "username", type: dynamodb.AttributeType.STRING}
      })

      requestrGroupsTable.addGlobalSecondaryIndex({
          indexName: "RequestrGroupsTableByStateMachineARNIndex",
          partitionKey: { name: "stateMachineARN", type: dynamodb.AttributeType.STRING}
      })

      const emailPasswordUserPool = new cognito.UserPool(this, "emailPasswordClientUserPool", {
          userPoolName: "emailPasswordClientUserPool",
          signInAliases: {
              username: true,
              email: true
          },
          signInCaseSensitive: false,
          autoVerify: {email: true},
          standardAttributes: {
              fullname: {
                  required: true,
                  mutable: true
              },
              email: {
                  required: true,
                  mutable:false
              }
          },
          passwordPolicy: {
              minLength: 10,
              requireLowercase: true,
              requireDigits: true,
              requireSymbols: true,
              requireUppercase: true,
          },
          selfSignUpEnabled: true,
          mfa: Mfa.OFF,
      });

      // L1 cast
      const cfnEmailPasswordUserPool = emailPasswordUserPool.node.defaultChild as CfnUserPool
      cfnEmailPasswordUserPool.emailConfiguration = {
          sourceArn: "arn:aws:ses:us-east-1:182624231406:identity/requestr.org",
          emailSendingAccount: "DEVELOPER",
          from: "Requestr Automated System <no-reply@requestr.org>",
          replyToEmailAddress: "support@requestr.org"
      }

      const emailPasswordAppClient = new cognito.UserPoolClient(this, "emailPasswordAppClient", {
          userPoolClientName: "emailPasswordAppClient",
          userPool: emailPasswordUserPool,
          generateSecret: false,
          preventUserExistenceErrors: true,
          authFlows: {
              userPassword: true,
              userSrp: true
          }
      });

      const stepFunctionRoleAllAllowed = new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['states:*'],
          resources: ["*"]

      })

      const iamPassRole = new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['iam:passRole'],
          resources: ["*"]
      })

      const snsPublish = new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['sns:Publish'],
          resources: ["*"]

      })

      const createTicketPolicy = new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['cognito-idp:AdminGetUser', 'ses:SendEmail', 'ses:SendRawEmail'],
          resources: ["*"]
      })

      const waitForTicketInteractionLambda = new lambda.Function(this, "waitForTicketInteractionLambda", {
          runtime: lambda.Runtime.NODEJS_12_X,
          code: lambda.Code.fromAsset("functions"),
          handler: "waitForTicketInteraction.handler",
      });

      const interactWithTicketLambda = new lambda.Function(this, "interactWithTicketLambda", {
          runtime: lambda.Runtime.NODEJS_12_X,
          code: lambda.Code.fromAsset("functions"),
          handler: "interactWithTicket.handler",
          timeout: cdk.Duration.seconds(60)
      });
      interactWithTicketLambda.addToRolePolicy(stepFunctionRoleAllAllowed)

      const updateTicketLambda = new lambda.Function(this, "updateTicketLambda", {
          runtime: lambda.Runtime.NODEJS_12_X,
          code: lambda.Code.fromAsset("functions"),
          handler: "updateTicket.handler"
      });

      const getTicketExecutionsByStateMachineARNLambda = new lambda.Function(this, "getTicketExecutionsByStateMachineARNLambda", {
          runtime: lambda.Runtime.NODEJS_12_X,
          code: lambda.Code.fromAsset("functions"),
          handler: "getTicketExecutionsByStateMachineARN.handler",
          timeout: cdk.Duration.seconds(60)
      });
      getTicketExecutionsByStateMachineARNLambda.addToRolePolicy(stepFunctionRoleAllAllowed)

      const createTicketLambda = new lambda.Function(this, "createTicketLambda", {
          runtime: lambda.Runtime.NODEJS_12_X,
          code: lambda.Code.fromAsset("functions"),
          handler: "createTicket.handler",
          timeout: cdk.Duration.seconds(60),
          environment: {
              TABLE_NAME: requestrGroupsTable.tableName,
              USER_POOL_ID: emailPasswordUserPool.userPoolId
          },
      });
      createTicketLambda.addToRolePolicy(stepFunctionRoleAllAllowed)
      createTicketLambda.addToRolePolicy(createTicketPolicy)
      requestrGroupsTable.grantReadWriteData(createTicketLambda)



      const waitForMainInteractionState = new tasks.LambdaInvoke(this, "waitForMainInteractionState", {
          lambdaFunction: waitForTicketInteractionLambda,
          payload: sfn.TaskInput.fromObject({
              token: sfn.JsonPath.taskToken,
              request: sfn.JsonPath.entirePayload
          }),
          integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
          resultPath: '$.choiceStateResult'
      })

      const waitToBeArchivedState = new tasks.LambdaInvoke(this, "waitToBeArchivedState", {
          lambdaFunction: waitForTicketInteractionLambda,
          payload: sfn.TaskInput.fromObject({
              token: sfn.JsonPath.taskToken,
              request: sfn.JsonPath.entirePayload
          }),
          integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
          resultPath: sfn.JsonPath.DISCARD
      })

      const approvedState = new tasks.LambdaInvoke(this, "approvedState", {
          lambdaFunction: updateTicketLambda,
          resultSelector: {
              "request.$": "$.Payload.body"
          },
          outputPath: "$.request"
      }).next(waitToBeArchivedState)

      const deniedState = new tasks.LambdaInvoke(this, "deniedState", {
          lambdaFunction: updateTicketLambda,
          resultSelector: {
              "request.$": "$.Payload.body"
          },
          outputPath: "$.request"
      }).next(waitToBeArchivedState)

      const processCommentState = new tasks.LambdaInvoke(this, "processCommentState", {
          lambdaFunction: updateTicketLambda,
          outputPath: '$.Payload.body'
      }).next(waitForMainInteractionState)

      const stateMachineModel = new sfn.StateMachine(this, "stateMachineModel", {
          definition: waitForMainInteractionState.next(
              new sfn.Choice(this, "approveDenyOrCommentChoice")
                  .when(sfn.Condition.stringEquals('$.choiceStateResult.updateType', 'Approved'), approvedState)
                  .when(sfn.Condition.stringEquals('$.choiceStateResult.updateType', 'Denied'), deniedState)
                  .otherwise(processCommentState)
          )
      })

      // L1 construct cast
      const cfnStateMachineModel = stateMachineModel.node.defaultChild as sfn.CfnStateMachine

      const requestrTicketsAPI = new apigateway.RestApi(this, "requestrTicketsAPI", {
          defaultCorsPreflightOptions: {
              allowOrigins: apigateway.Cors.ALL_ORIGINS,
              allowMethods: apigateway.Cors.ALL_METHODS
          }
      });

      requestrTicketsAPI.root
          .resourceForPath("interactWithTicket")
          .addMethod("POST", new apigateway.LambdaIntegration(interactWithTicketLambda), {
              requestParameters: {
                  "method.request.querystring.taskToken": true,
                  "method.request.querystring.updateType": true,
                  "method.request.querystring.comment": true
              },
              requestValidator: new apigateway.RequestValidator(this, "interactWithTicketValidator", {
                  restApi: requestrTicketsAPI,
                  requestValidatorName: "interactWithTicketCheck",
                  validateRequestParameters: true,
                  validateRequestBody: false
              })
          });


      requestrTicketsAPI.root
          .resourceForPath("getTicketExecutionsByStateMachineARN")
          .addMethod("GET",  new apigateway.LambdaIntegration(getTicketExecutionsByStateMachineARNLambda), {
              requestParameters: {
                  "method.request.querystring.stateMachineARN": true,
                  "method.request.querystring.statusFilter": true,
                  "method.request.querystring.groupType": true,
                  "method.request.querystring.username": true,
                  "method.request.querystring.usersRole": true
              },
              requestValidator: new apigateway.RequestValidator(this, "filterAndARNValidator", {
                  restApi: requestrTicketsAPI,
                  requestValidatorName: "filterAndARNStringCheck",
                  validateRequestParameters: true,
                  validateRequestBody: false
              }),
          });

      const ticketModel = new apigateway.Model(this, "ticketModel-Validator", {
          restApi: requestrTicketsAPI,
          contentType: 'application/json',
          modelName: 'ticketModel',
          schema: {
              type: JsonSchemaType.OBJECT,
              properties: {
                  ticketId: {type: JsonSchemaType.STRING},
                  requestor: {type: JsonSchemaType.STRING},
                  subject: {type: JsonSchemaType.STRING},
                  description: {type: JsonSchemaType.STRING},
                  date: {type: JsonSchemaType.STRING},
                  status: {type: JsonSchemaType.STRING}
              },
              required:
                  ["ticketId", "requestor", "subject", "description", "date", "status"]
          }})

      requestrTicketsAPI.root
          .resourceForPath("createTicket")
          .addMethod("POST",  new apigateway.LambdaIntegration(createTicketLambda), {
              requestParameters: {
                  "method.request.querystring.stateMachineARN": true
              },
              requestValidator: new apigateway.RequestValidator(this, "arnValidator", {
                  restApi: requestrTicketsAPI,
                  requestValidatorName: "arnStringCheck",
                  validateRequestParameters: true,
                  validateRequestBody: true
              }),
              requestModels: {
                  "application/json": ticketModel
              }
          });









      const addUpdateGroupEntryLambda = new lambda.Function(this, "AddUpdateGroupEntryLambda", {
          runtime: lambda.Runtime.NODEJS_12_X,
          code: lambda.Code.fromAsset("functions"),
          handler: "addUpdateGroupEntry.handler",
          environment: {
              TABLE_NAME: requestrGroupsTable.tableName,
              STATEMACHINE_DEFINITION: cfnStateMachineModel.definitionString!,
              MODEL_ROLE_ARN: stateMachineModel.role.roleArn
          },
      });
      addUpdateGroupEntryLambda.addToRolePolicy(stepFunctionRoleAllAllowed)
      addUpdateGroupEntryLambda.addToRolePolicy(iamPassRole)

      const getEntriesByUsernameLambda = new lambda.Function(this, "GetEntriesByUsernameLambda", {
          runtime: lambda.Runtime.NODEJS_12_X,
          code: lambda.Code.fromAsset("functions"),
          handler: "getEntriesByUsername.handler",
          environment: {
              TABLE_NAME: requestrGroupsTable.tableName
          },
      });

      const getEntriesByHashLambda = new lambda.Function(this, "GetEntriesByHashLambda", {
          runtime: lambda.Runtime.NODEJS_12_X,
          code: lambda.Code.fromAsset("functions"),
          handler: "getEntriesByHash.handler",
          environment: {
              TABLE_NAME: requestrGroupsTable.tableName
          },
      });

      const deleteEntryByHashAndUsernameLambda = new lambda.Function(this, "DeleteEntryByHashAndUsernameLambda", {
          runtime: lambda.Runtime.NODEJS_12_X,
          code: lambda.Code.fromAsset("functions"),
          handler: "deleteEntryByHashAndUsername.handler",
          environment: {
              TABLE_NAME: requestrGroupsTable.tableName
          },
      });

      const requestrGroupsAPI = new apigateway.RestApi(this, "requestrGroupsAPI", {
          defaultCorsPreflightOptions: {
              allowOrigins: apigateway.Cors.ALL_ORIGINS,
              allowMethods: apigateway.Cors.ALL_METHODS
          }
      });

      const groupEntryModel = new apigateway.Model(this, "groupEntryModel-Validator", {
          restApi: requestrGroupsAPI,
          contentType: 'application/json',
          modelName: 'groupEntryModel',
          schema: {
              type: JsonSchemaType.OBJECT,
              properties: {
                  username: {type: JsonSchemaType.STRING},
                  groupName: {type: JsonSchemaType.STRING},
                  groupHash: {type: JsonSchemaType.STRING},
                  owner: {type: JsonSchemaType.STRING},
                  usersRole: {type: JsonSchemaType.STRING},
                  public: {type: JsonSchemaType.BOOLEAN}
              },
              required:
                  ["username", "groupName", "groupHash", "owner", "usersRole", "public"]
          }})

      requestrGroupsAPI.root
          .resourceForPath("addUpdateGroupEntry")
          .addMethod("POST", new apigateway.LambdaIntegration(addUpdateGroupEntryLambda), {
              requestValidator: new apigateway.RequestValidator(this, "groupEntryBodyValidator", {
                  restApi: requestrGroupsAPI,
                  requestValidatorName: "bodyValidator-GroupEntry",
                  validateRequestBody: true
              }),
              requestModels: {
                  "application/json": groupEntryModel
              },
          });

      requestrGroupsAPI.root
          .resourceForPath("getEntriesByUsername")
          .addMethod("GET",  new apigateway.LambdaIntegration(getEntriesByUsernameLambda), {
              requestParameters: {
                  "method.request.querystring.username": true
              },
              requestValidator: new apigateway.RequestValidator(this, "usernameValidator", {
                  restApi: requestrGroupsAPI,
                  requestValidatorName: "usernameStringCheck",
                  validateRequestParameters: true,
                  validateRequestBody: false
              }),
      });

      requestrGroupsAPI.root
          .resourceForPath("getEntriesByHash")
          .addMethod("GET",  new apigateway.LambdaIntegration(getEntriesByHashLambda), {
              requestParameters: {
                  "method.request.querystring.groupHash": true
              },
              requestValidator: new apigateway.RequestValidator(this, "hashValidator", {
                  restApi: requestrGroupsAPI,
                  requestValidatorName: "hashStringCheck",
                  validateRequestParameters: true,
                  validateRequestBody: false
              }),

          });

      requestrGroupsAPI.root
          .resourceForPath("deleteEntryByHashAndUsername")
          .addMethod("DELETE",  new apigateway.LambdaIntegration(deleteEntryByHashAndUsernameLambda), {
              requestParameters: {
                  "method.request.querystring.groupHash": true,
                  "method.request.querystring.username": true
              },
              requestValidator: new apigateway.RequestValidator(this, "deleteValidator", {
                  restApi: requestrGroupsAPI,
                  requestValidatorName: "usernameAndHashStringCheck",
                  validateRequestParameters: true,
                  validateRequestBody: false
              }),

          });

      requestrGroupsTable.grantReadWriteData(addUpdateGroupEntryLambda);
      requestrGroupsTable.grantReadWriteData(getEntriesByUsernameLambda);
      requestrGroupsTable.grantReadWriteData(getEntriesByHashLambda);
      requestrGroupsTable.grantReadWriteData(deleteEntryByHashAndUsernameLambda);






    const virtualEmailServerForDomainTopic = new sns.Topic(this, 'virtualEmailServerForDomainTopic', {
        topicName: "virtualEmailServerForDomain"
    })

      const sesAllowSetSendRole = new iam.PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['ses:SendEmail', 'ses:SendRawEmail'],
          resources: ['*']
      })

      const processAndSendIncomingEmailLambda = new lambda.Function(this, "processAndSendIncomingEmailLambda", {
          runtime: lambda.Runtime.NODEJS_12_X,
          code: lambda.Code.fromAsset("functions"),
          handler: "processAndSendIncomingEmail.handler",
          timeout: cdk.Duration.seconds(60)
      });
    processAndSendIncomingEmailLambda.addToRolePolicy(sesAllowSetSendRole)

      virtualEmailServerForDomainTopic.addSubscription(new subscriptions.LambdaSubscription(processAndSendIncomingEmailLambda))

      const virtualEmailServerForDomainRuleSet = new ses.ReceiptRuleSet(this, 'virtualEmailServerForDomainRuleSet', {
          receiptRuleSetName: 'virtualEmailServerForDomainRuleSet',
          rules: [
              {
                  recipients: ['support@requestr.org'],
                  actions: [
                      new sesActions.Sns({
                          topic: virtualEmailServerForDomainTopic
                      })
                  ]
              }
          ]
      })

      //Make previous RuleSet the 'active' ruleset with AWS Custom Resource
      const setActiveAWSSDKCall: custom.AwsSdkCall = {
        service: 'SES',
          action: 'setActiveReceiptRuleSet',
          physicalResourceId: custom.PhysicalResourceId.of('DefaultSesCustomResource'),
          parameters: {
            RuleSetName: virtualEmailServerForDomainRuleSet.receiptRuleSetName
          }
      }

      const sesAllowSetActiveRuleSetRole = new iam.PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['ses:SetActiveReceiptRuleSet'],
          resources: ['*']
      })

      const customResourceForSetActiveCall = new custom.AwsCustomResource(this, 'customResourceForSetActiveCall', {
          onCreate: setActiveAWSSDKCall,
          onUpdate: setActiveAWSSDKCall,
          policy: custom.AwsCustomResourcePolicy.fromStatements([
              sesAllowSetActiveRuleSetRole
          ]),
          timeout: cdk.Duration.seconds(60)
      })





  }
}
