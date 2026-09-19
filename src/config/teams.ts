export const TEAMS = {
  billing: {
    owns: "Invoices, charges, refunds, failed payments, plan and seat changes, tax documents.",
    not: "Pricing questions from someone who has not bought yet; that is sales.",
    zendeskGroupId: null,
  },
  technical_support: {
    owns: "The product is broken or behaving wrongly: errors, crashes, failing integrations, bad or missing data, outages.",
    not: "The product works as designed and the customer does not know how to use it; that is onboarding.",
    zendeskGroupId: null,
  },
  account_access: {
    owns: "Login failures, SSO and MFA, password resets, permissions and roles, adding or removing users.",
    not: "Adding seats because they want to buy more; that is billing.",
    zendeskGroupId: null,
  },
  onboarding: {
    owns: "How do I questions, setup and configuration guidance, requests for documentation or training.",
    not: "The customer followed the documentation and it failed; that is technical support.",
    zendeskGroupId: null,
  },
  sales: {
    owns: "Pricing, quotes, upgrades, renewals, trial extensions, questions from prospects who are not customers yet.",
    not: "A customer disputing a charge they already paid; that is billing.",
    zendeskGroupId: null,
  },
  product_feedback: {
    owns: "Feature requests, roadmap questions, complaints about intended behaviour the customer dislikes.",
    not: "Anything the customer needs resolved today.",
    zendeskGroupId: null,
  },
} as const;

export type TeamId = keyof typeof TEAMS;

export const TEAM_IDS = Object.keys(TEAMS) as [TeamId, ...TeamId[]];
