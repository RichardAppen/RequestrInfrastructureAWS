import * as lambda from '@aws-cdk/aws-lambda';
import * as apigateway from '@aws-cdk/aws-apigateway';
import {JsonSchemaType} from '@aws-cdk/aws-apigateway';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as cdk from '@aws-cdk/core';
import * as cognito from '@aws-cdk/aws-cognito'
import {Mfa} from '@aws-cdk/aws-cognito'

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

      const addUpdateGroupEntryLambda = new lambda.Function(this, "AddUpdateGroupEntryLambda", {
          runtime: lambda.Runtime.NODEJS_12_X,
          code: lambda.Code.fromAsset("functions"),
          handler: "addUpdateGroupEntry.handler",
          environment: {
              TABLE_NAME: requestrGroupsTable.tableName
          },
      });

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

      requestrGroupsTable.grantReadWriteData(addUpdateGroupEntryLambda);
      requestrGroupsTable.grantReadWriteData(getEntriesByUsernameLambda);
      requestrGroupsTable.grantReadWriteData(getEntriesByHashLambda)

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
  }
}
