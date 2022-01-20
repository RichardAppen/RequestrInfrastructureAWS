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

    const table = new dynamodb.Table(this, "Test", {
      partitionKey: { name: "testTable", type: dynamodb.AttributeType.STRING}
    });


    const testLambda = new lambda.Function(this, "TestLambda", {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset("functions"),
      handler: "function.handler",
      environment: {
        TABLE_NAME: table.tableName
      },
    });

    table.grantReadWriteData(testLambda);

    const api = new apigateway.RestApi(this, "TestAPI");

    api.root
        .resourceForPath("testing")
        .addMethod("GET", new apigateway.LambdaIntegration(testLambda), {
            requestParameters: {
              "method.request.querystring.testParam": true
            },
          requestValidatorOptions: {
              requestValidatorName: "queryStringValidator",
              validateRequestParameters: true,
              validateRequestBody: false
          }
        });



      const requestrGroupsTable = new dynamodb.Table(this, "RequestrGroupsTable", {
          partitionKey: { name: "username", type: dynamodb.AttributeType.STRING}
      });

      const addGroupEntryLambda = new lambda.Function(this, "AddGroupEntryLambda", {
          runtime: lambda.Runtime.NODEJS_12_X,
          code: lambda.Code.fromAsset("functions"),
          handler: "addGroupEntry.handler",
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
          .resourceForPath("addGroupEntry")
          .addMethod("POST", new apigateway.LambdaIntegration(addGroupEntryLambda), {
              requestValidator: new apigateway.RequestValidator(this, "validator", {
                  restApi: requestrGroupsAPI,
                  requestValidatorName: "validator",
                  validateRequestBody: true
              }),
              requestModels: {
                  "application/json": groupEntryModel
              },
          });

      requestrGroupsTable.grantReadWriteData(addGroupEntryLambda);

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
