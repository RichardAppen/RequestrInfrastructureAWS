#!/usr/bin/env node
import * as cdk from '@aws-cdk/core';
import { RequestrProjectStack } from '../lib/requestr-project-stack';

const app = new cdk.App();
new RequestrProjectStack(app, 'RequestrProjectStack');
