import * as lambda from '@aws-cdk/aws-lambda';
import * as apigateway from '@aws-cdk/aws-apigateway';
import {JsonSchemaType} from '@aws-cdk/aws-apigateway';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as cdk from '@aws-cdk/core';

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
  }
}
