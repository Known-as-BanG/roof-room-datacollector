import type { SourceCollectionResult } from '../../../shared/collection';
import {
  GoogleApiTransportError,
  type ApiResponse,
} from '../google-api/api-helpers';
import {
  GoogleCredentialError,
} from '../google-api/google-auth';
import {
  mapGoogleApiCollectionError,
} from '../google-api/google-api-error';

type GoogleAdsFailureCategory =
  | 'API_CONFIGURATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'INVALID_REQUEST'
  | 'RATE_LIMIT'
  | 'NETWORK_FAILURE';

const requireRecord = (
  value: unknown,
): Record<string, unknown> | null => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const safeEnum = (value: unknown): string | undefined => (
  typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/u.test(value)
    ? value
    : undefined
);

const safeRequestId = (value: unknown): string | undefined => (
  typeof value === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)
    ? value
    : undefined
);

const pascalCase = (value: string): string => (
  `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`
);

const readGoogleAdsErrors = (
  body: unknown,
): { status?: string; errorCodes: string[]; requestId?: string } => {
  const providerError = requireRecord(requireRecord(body)?.error);
  const status = safeEnum(providerError?.status);
  const details = Array.isArray(providerError?.details)
    ? providerError.details
    : [];
  const errorCodes: string[] = [];
  let requestId: string | undefined;

  for (const candidate of details) {
    const detail = requireRecord(candidate);
    if (
      typeof detail?.['@type'] !== 'string'
      || !detail['@type'].endsWith('.GoogleAdsFailure')
    ) {
      continue;
    }

    requestId ??= safeRequestId(detail.requestId);
    if (!Array.isArray(detail.errors)) continue;

    for (const candidateError of detail.errors) {
      const error = requireRecord(candidateError);
      const errorCode = requireRecord(error?.errorCode);
      if (!errorCode) continue;

      for (const [rawGroup, rawCode] of Object.entries(errorCode)) {
        const group = /^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(rawGroup)
          ? pascalCase(rawGroup)
          : undefined;
        const code = safeEnum(rawCode);
        if (group && code) {
          errorCodes.push(`GoogleAdsFailure.${group}.${code}`);
        }
      }
    }
  }

  return { status, errorCodes: [...new Set(errorCodes)].slice(0, 3), requestId };
};

const classifyGoogleAdsFailure = (
  httpStatus: number,
  providerStatus: string | undefined,
  providerErrorCodes: readonly string[],
): GoogleAdsFailureCategory | undefined => {
  const codes = [providerStatus, ...providerErrorCodes]
    .filter((value): value is string => value !== undefined)
    .join(' ');

  if (
    codes.includes('CUSTOMER_NOT_ENABLED')
    || codes.includes('CUSTOMER_NOT_ON_ALLOWLIST')
    || codes.includes('CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION')
  ) {
    return 'API_CONFIGURATION_ERROR';
  }
  if (
    providerStatus === 'UNAUTHENTICATED'
    || codes.includes('AUTHENTICATION_ERROR')
    || codes.includes('OAUTH_TOKEN_REVOKED')
    || codes.includes('OAUTH_TOKEN_EXPIRED')
    || codes.includes('OAUTH_TOKEN_INVALID')
    || httpStatus === 401
  ) {
    return 'AUTHENTICATION_ERROR';
  }
  if (
    providerStatus === 'PERMISSION_DENIED'
    || codes.includes('AUTHORIZATION_ERROR')
    || codes.includes('USER_PERMISSION_DENIED')
    || codes.includes('ACCESS_DENIED')
    || httpStatus === 403
  ) {
    return 'AUTHORIZATION_ERROR';
  }
  if (
    providerStatus === 'RESOURCE_EXHAUSTED'
    || providerErrorCodes.some((code) => code.startsWith('GoogleAdsFailure.QuotaError.'))
    || httpStatus === 429
  ) {
    return 'RATE_LIMIT';
  }
  if (
    providerStatus === 'INVALID_ARGUMENT'
    || providerStatus === 'INVALID_REQUEST'
    || providerErrorCodes.some((code) => (
      code.startsWith('GoogleAdsFailure.QueryError.')
      || code.startsWith('GoogleAdsFailure.RequestError.')
    ))
    || httpStatus === 400
  ) {
    return 'INVALID_REQUEST';
  }
  return undefined;
};

export class GoogleAdsApiResponseError extends Error {
  constructor(
    public readonly error_code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GoogleAdsApiResponseError';
  }
}

export const createGoogleAdsApiResponseError = (
  response: ApiResponse,
): GoogleAdsApiResponseError => {
  const provider = readGoogleAdsErrors(response.body);
  const requestId = safeRequestId(response.request_id) ?? provider.requestId;
  const category = classifyGoogleAdsFailure(
    response.status,
    provider.status,
    provider.errorCodes,
  );
  const errorCodeParts = [
    'GOOGLE_ADS_API_FAILED',
    `HTTP_${response.status}`,
    category,
  ].filter((value): value is string => value !== undefined);
  const categoryDescription = category === undefined
    ? ''
    : `, ${category}`;
  const providerDescription = provider.errorCodes.length === 0
    ? ''
    : `, provider error ${provider.errorCodes.join(', ')}`;
  const requestDescription = requestId === undefined
    ? ''
    : `, request ID ${requestId}`;

  return new GoogleAdsApiResponseError(
    errorCodeParts.join('_'),
    `Google Ads API request failed with HTTP ${response.status}${categoryDescription}${providerDescription}${requestDescription}.`,
  );
};

const transportFailure = (
  error: GoogleApiTransportError,
): SourceCollectionResult => {
  const category = error.code === 'PROVIDER_AUTHORIZATION_FAILED'
    ? error.http_status === 401
      ? 'AUTHENTICATION_ERROR'
      : 'AUTHORIZATION_ERROR'
    : error.code === 'RATE_OR_QUOTA_FAILED'
      ? 'RATE_LIMIT'
      : 'NETWORK_FAILURE';
  const parts = [
    'GOOGLE_ADS_API_FAILED',
    error.http_status === undefined ? undefined : `HTTP_${error.http_status}`,
    category,
    error.code === 'REQUEST_TIMEOUT' ? 'REQUEST_TIMEOUT' : undefined,
  ].filter((value): value is string => value !== undefined);
  return {
    result_type: 'FAILED',
    error_code: parts.join('_'),
    message: `Google Ads API request failed (${category}${error.code === 'REQUEST_TIMEOUT' ? ', request timeout' : ''}).`,
  };
};

export const mapGoogleAdsSearchTermsError = (
  error: unknown,
): SourceCollectionResult => {
  if (error instanceof GoogleAdsApiResponseError) {
    return {
      result_type: 'FAILED',
      error_code: error.error_code,
      message: error.message,
    };
  }
  if (error instanceof GoogleApiTransportError) {
    return transportFailure(error);
  }
  if (error instanceof GoogleCredentialError) {
    return mapGoogleApiCollectionError(
      error,
      'GOOGLE_ADS_API_FAILED',
      'Google Ads request failed.',
    );
  }
  return {
    result_type: 'FAILED',
    error_code: 'GOOGLE_ADS_API_FAILED',
    message: 'Google Ads request failed.',
  };
};
