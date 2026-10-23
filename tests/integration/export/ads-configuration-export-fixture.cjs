const campaign = { resourceName: 'customers/1234567890/campaigns/1001', id: '1001', name: 'Search',
  status: 'ENABLED', advertisingChannelType: 'SEARCH' };

module.exports = {
  // Other snapshot datasets deliberately return verified NO_DATA, never invented rows.
  rows: {
    CAMPAIGN_NEGATIVE_KEYWORDS: [{ campaign, campaignCriterion: {
      resourceName: 'customers/1234567890/campaignCriteria/1001~2001', criterionId: '2001',
      type: 'KEYWORD', negative: true, status: 'REMOVED', keyword: { text: 'free', matchType: 'BROAD' },
    } }],
    CONVERSION_ACTIONS: [{ conversionAction: {
      resourceName: 'customers/1234567890/conversionActions/9001', id: '9001', name: 'Purchase',
      status: 'ENABLED', type: 'WEBPAGE', category: 'PURCHASE', origin: 'WEBSITE',
      ownerCustomer: 'customers/1234567890', countingType: 'ONE_PER_CLICK', primaryForGoal: true,
      includeInConversionsMetric: false, clickThroughLookbackWindowDays: '30', viewThroughLookbackWindowDays: '1',
      attributionModelSettings: { attributionModel: 'GOOGLE_ADS_LAST_CLICK', dataDrivenModelStatus: 'AVAILABLE' },
      valueSettings: { defaultValue: 0, defaultCurrencyCode: 'TRY', alwaysUseDefaultValue: false },
      googleAnalytics4Settings: { propertyId: '123456789', eventName: 'purchase' },
    } }],
    CUSTOMER_CONVERSION_GOALS: [{ customerConversionGoal: {
      resourceName: 'customers/1234567890/customerConversionGoals/PURCHASE~WEBSITE',
      category: 'PURCHASE', origin: 'WEBSITE', biddable: false,
    } }],
    CUSTOMER_CONVERSION_TRACKING_SETTINGS: [{ customer: {
      resourceName: 'customers/1234567890', id: '1234567890', conversionTrackingSetting: {
        conversionTrackingStatus: 'NOT_CONVERSION_TRACKED', conversionTrackingId: null,
        crossAccountConversionTrackingId: null, googleAdsConversionCustomer: null,
      },
    } }],
    CAMPAIGN_SETTINGS: [{ campaign: { ...campaign, campaignBudget: 'customers/1234567890/campaignBudgets/5001',
      biddingStrategyType: 'MANUAL_CPC', networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false,
        targetContentNetwork: false, targetPartnerSearchNetwork: false },
    } }],
    CAMPAIGN_BUDGETS: [{ campaignBudget: { resourceName: 'customers/1234567890/campaignBudgets/5001',
      id: '5001', name: 'Budget', status: 'ENABLED', amountMicros: '0', totalAmountMicros: '0',
      explicitlyShared: false, period: 'DAILY', deliveryMethod: 'STANDARD',
    } }],
    CAMPAIGN_TARGETING_CRITERIA: [{ campaign, campaignCriterion: {
      resourceName: 'customers/1234567890/campaignCriteria/1001~3001', campaign: campaign.resourceName,
      criterionId: '3001', type: 'LOCATION', negative: false, status: 'ENABLED',
      location: { geoTargetConstant: 'geoTargetConstants/2392' },
    } }],
  },
  geo: { geoTargetConstantSuggestions: [{ geoTargetConstant: {
    resourceName: 'geoTargetConstants/2392', id: '2392', name: 'Turkey', canonicalName: 'Turkey',
    countryCode: 'TR', targetType: 'Country', status: 'ENABLED',
  } }] },
};
