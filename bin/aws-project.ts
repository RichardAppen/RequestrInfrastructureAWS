#!/usr/bin/env node
import * as cdk from '@aws-cdk/core';
import { AwsProjectStack } from '../lib/aws-project-stack';

const app = new cdk.App();
new AwsProjectStack(app, 'AwsProjectStack');
