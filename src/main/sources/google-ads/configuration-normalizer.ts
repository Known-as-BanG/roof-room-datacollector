import type {
  GoogleAdsConfigurationDatasetType,
  GoogleAdsConfigurationNormalizedRow,
} from '../../../shared/google-ads-configuration';
import { Buffer } from 'node:buffer';
import { isDeepStrictEqual } from 'node:util';
import { flattenGoogleAdsSearchStream } from './search-stream-response';
import {
  normalizeGoogleAdsConfigurationRows as normalizeGoogleAdsNegativeConfigurationRows,
} from './negatives-adapter';
import {
  normalizeGoogleAdsConversionConfigurationRows,
} from './conversion-configuration-adapter';
import {
  normalizeGoogleAdsCampaignSettingsRows,
  parseGoogleAdsCampaignTargetingEvidenceBundle,
  extractGoogleAdsCampaignTargetingGeoResourceNames,
  type GoogleAdsGeoTargetConstantEvidence,
  type GoogleAdsCampaignSettingsNormalizationOptions,
} from './campaign-settings-adapter';

export const normalizeGoogleAdsConfigurationRows = (
  datasetType: GoogleAdsConfigurationDatasetType,
  rows: Record<string, unknown>[],
  options: GoogleAdsCampaignSettingsNormalizationOptions = {},
): GoogleAdsConfigurationNormalizedRow[] => {
  switch (datasetType) {
    case 'CAMPAIGN_NEGATIVE_KEYWORDS':
    case 'AD_GROUP_NEGATIVE_KEYWORDS':
    case 'SHARED_NEGATIVE_KEYWORDS':
    case 'CAMPAIGN_NEGATIVE_KEYWORD_LISTS':
    case 'ACCOUNT_NEGATIVE_KEYWORD_LISTS':
      return normalizeGoogleAdsNegativeConfigurationRows(datasetType, rows);

    case 'CONVERSION_ACTIONS':
    case 'CUSTOMER_CONVERSION_GOALS':
    case 'CONVERSION_GOAL_CAMPAIGN_CONFIGS':
    case 'CAMPAIGN_CONVERSION_GOALS':
    case 'CUSTOM_CONVERSION_GOALS':
    case 'CUSTOMER_CONVERSION_TRACKING_SETTINGS':
      return normalizeGoogleAdsConversionConfigurationRows(datasetType, rows);

    case 'CAMPAIGN_SETTINGS':
    case 'CAMPAIGN_BUDGETS':
    case 'CAMPAIGN_TARGETING_CRITERIA':
      return normalizeGoogleAdsCampaignSettingsRows(
        datasetType,
        rows,
        options,
      );

    default:
      throw new Error(
        `Unsupported Google Ads configuration dataset: ${String(datasetType)}.`,
      );
  }
};

// Targeting artifacts preserve the SearchStream and geo resolver as separate raw parts.
export const normalizeGoogleAdsConfigurationArtifact = (
  datasetType: GoogleAdsConfigurationDatasetType,
  body: unknown,
): GoogleAdsConfigurationNormalizedRow[] => {
  if (datasetType !== 'CAMPAIGN_TARGETING_CRITERIA') {
    return normalizeGoogleAdsConfigurationRows(datasetType, flattenGoogleAdsSearchStream(body));
  }
  const bundle = parseGoogleAdsCampaignTargetingEvidenceBundle(body);
  const stream = JSON.parse(Buffer.from(bundle.parts[0].raw_body_base64, 'base64').toString('utf8')) as unknown;
  const geo = bundle.parts.find((part) => part.kind === 'GEO_TARGET_CONSTANT_SUGGESTIONS');
  const constants = new Map<string, GoogleAdsGeoTargetConstantEvidence>();
  if (geo?.kind === 'GEO_TARGET_CONSTANT_SUGGESTIONS') {
    const observed = [...new Set(extractGoogleAdsCampaignTargetingGeoResourceNames(stream))];
    if (!isDeepStrictEqual(geo.requested_resource_names, observed)) {
      throw new Error('Google Ads geo resolver scope does not match observed LOCATION evidence.');
    }
    const response: unknown = JSON.parse(Buffer.from(geo.raw_body_base64, 'base64').toString('utf8'));
    if (typeof response !== 'object' || response === null || Array.isArray(response)
      || !('geoTargetConstantSuggestions' in response) || !Array.isArray(response.geoTargetConstantSuggestions)) {
      throw new Error('Google Ads geo target resolver suggestions are invalid.');
    }
    for (const suggestion of response.geoTargetConstantSuggestions) {
      if (typeof suggestion !== 'object' || suggestion === null || Array.isArray(suggestion)) {
        throw new Error('Google Ads geo target resolver suggestion is invalid.');
      }
      const value: unknown = (suggestion as Record<string, unknown>).geoTargetConstant;
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('Google Ads geo target constant evidence is invalid.');
      }
      const constant = value as Record<string, unknown>;
      const text = (key: string): string => {
        const field = constant[key];
        if (typeof field !== 'string' || field.length === 0) {
          throw new Error(`Google Ads geo target constant ${key} is required.`);
        }
        return field;
      };
      const id = text('id'), resourceName = text('resourceName');
      if (resourceName !== `geoTargetConstants/${id}`) {
        throw new Error('Google Ads geo target constant resourceName does not match its id.');
      }
      constants.set(resourceName, { resource_name: resourceName, id,
        name: text('name'), canonical_name: text('canonicalName'), country_code: text('countryCode'),
        target_type: text('targetType'), status: text('status') });
    }
  }
  return normalizeGoogleAdsConfigurationRows(datasetType, flattenGoogleAdsSearchStream(stream), {
    geo_target_constants: constants,
  });
};
