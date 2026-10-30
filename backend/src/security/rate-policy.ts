import { SetMetadata } from '@nestjs/common';
export type RatePolicyName = 'login' | 'refresh' | 'ai' | 'sensitive' | 'probe';
export const RATE_POLICY = 'request-rate-policy';
export const RatePolicy = (policy: RatePolicyName): MethodDecorator => SetMetadata(RATE_POLICY, policy);
