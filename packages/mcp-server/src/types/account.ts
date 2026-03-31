export interface Account {
  account: {
    accountName: string;
    shortName: string;
    type: string;
    created: string;
  };
  users: Array<{
    name: string;
    lastSignIn: string;
    status: string;
    countryCode: string;
    isVerified: boolean;
  }>;
  memo_reference_code: string;
}

export interface AccountDetail {
  name: string;
  session: string;
  roles: string[];
  last_sign_in_time: string;
  agreement: string;
  created: string;
  sandbox: boolean;
  status: string;
}

export interface Role {
  role: string;
  active: boolean;
}

export interface ApprovedAddress {
  label: string;
  address: string;
}

export interface OAuthToken {
  scope: string;
  expires_in: number;
  token_type: string;
}
