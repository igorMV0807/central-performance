export type PurchaseJourney = {
  id: number;
  buyer_email: string | null;
  buyer_name: string | null;
  product_id: number | null;
  offer_code: string | null;
  transaction_id: string | null;
  current_status: string | null;
  recovery_allowed: boolean | null;
  recovery_flow: string | null;
  last_step_sent: number | null;
  next_step_at: string | null;
  approved_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  expired_at: string | null;
  overdue_at: string | null;
  refund_requested_at: string | null;
  refunded_at: string | null;
  chargeback_at: string | null;
  recovered: boolean | null;
  recovered_step: number | null;
  recovered_revenue: number | null;
  currency: string | null;
  first_event_id: string | null;
  last_event_id: string | null;
  last_event_created_at: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export type DashboardRecovery = {
  recovered: boolean;
  step: number | null;
  revenue: number;
  flow: string | null;
  approvedAt: string | null;
  source: "stored" | "inferred" | null;
};

export type DashboardJourney = PurchaseJourney & {
  dashboardRecovery: DashboardRecovery;
};

export type RecoveryEmailLog = {
  id: number;
  journey_id: number;
  recovery_flow: string | null;
  step: number | null;
  buyer_email: string | null;
  subject: string | null;
  gmail_message_id: string | null;
  status: string | null;
  sent_at: string | null;
  created_at: string | null;
  tracking_token: string | null;
  checkout_url: string | null;
  click_count: number | null;
  first_clicked_at: string | null;
  last_clicked_at: string | null;
  converted_at: string | null;
  conversion_transaction_id: string | null;
  converted_revenue: number | null;
  conversion_currency: string | null;
};

export type RecoveryConversion = {
  id: number;
  email_log_id: number;
  journey_id: number;
  recovery_flow: string | null;
  step: number | null;
  transaction_id: string;
  purchase_event_id: string | null;
  revenue: number | null;
  currency: string | null;
  clicked_at: string;
  converted_at: string;
  attribution_model: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type HotmartEvent = {
  id: number;
  event_id: string | null;
  event_type: string | null;
  event_created_at: number | null;
  transaction_id: string | null;
  buyer_email: string | null;
  buyer_name: string | null;
  product_id: number | null;
  offer_code: string | null;
  purchase_status: string | null;
  price: number | null;
  currency: string | null;
  processed: boolean | null;
  processed_at: string | null;
  processing_error: string | null;
  created_at: string | null;
};

export type Period = "today" | "7d" | "30d" | "90d" | "all";
