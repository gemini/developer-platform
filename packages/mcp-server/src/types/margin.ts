export interface MarginAccount {
  amount: string;
  available: string;
  currency: string;
  maintenanceMarginRequirementAmount: string;
  percentUsed: number;
  type: string;
}

export interface MarginPreview {
  amount: string;
  currency: string;
  available: string;
  collateral: string;
  haircut: string;
  percentUsed: number;
}

export interface FundingPayment {
  assetName: string;
  contractType: string;
  eventTime: number;
  fundingPaymentAmount: string;
  fundingPaymentCurrency: string;
  fundingRate: string;
  fundingRateBps: number;
  positionAmount: string;
  positionAmountCurrency: string;
  positionSide: string;
}

export interface ClearingOrder {
  order_id: string;
  symbol: string;
  price: string;
  amount: string;
  side: string;
  clearing_id: string;
  status: string;
}
